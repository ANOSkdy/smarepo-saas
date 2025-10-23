import { sitesTable, withRetry } from '@/lib/airtable';
import type { ReportRow } from '@/lib/reports/pair';
import { fetchSessionReportRows, type SessionReportRow } from '@/src/lib/sessions-reports';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

function normalizeLookupText(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const [first] = value;
    if (typeof first === 'string') {
      const trimmed = first.trim();
      return trimmed ? trimmed : null;
    }
    if (first && typeof first === 'object') {
      const name = (first as { name?: unknown; value?: unknown }).name ??
        (first as { name?: unknown; value?: unknown }).value ??
        String(first);
      const trimmed = String(name).trim();
      return trimmed ? trimmed : null;
    }
    if (first != null) {
      const trimmed = String(first).trim();
      return trimmed ? trimmed : null;
    }
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

type DailyAggregate = {
  firstStart?: string;
  firstStartMs?: number;
  lastEnd?: string;
  lastEndMs?: number;
  totalMinutes: number;
  clientName?: string | null;
};

function toDayKey(session: SessionReportRow): string | null {
  if (typeof session.date === 'string' && session.date.trim().length > 0) {
    return session.date.trim();
  }
  const { year, month, day } = session;
  if (!year || !month || !day) {
    return null;
  }
  const yearStr = year.toString().padStart(4, '0');
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  return `${yearStr}-${monthStr}-${dayStr}`;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDailyAggregates(sessions: SessionReportRow[]): Map<string, DailyAggregate> {
  const aggregates = new Map<string, DailyAggregate>();
  for (const session of sessions) {
    const key = toDayKey(session);
    if (!key) {
      continue;
    }
    const entry = aggregates.get(key) ?? { totalMinutes: 0 };

    const startTs = parseTimestamp(session.start);
    if (startTs !== null && (entry.firstStartMs == null || startTs < entry.firstStartMs)) {
      entry.firstStartMs = startTs;
      entry.firstStart = session.start ?? undefined;
    }

    const endTs = parseTimestamp(session.end);
    if (endTs !== null && (entry.lastEndMs == null || endTs > entry.lastEndMs)) {
      entry.lastEndMs = endTs;
      entry.lastEnd = session.end ?? undefined;
    }

    const rawDuration = session.durationMin;
    if (typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0) {
      entry.totalMinutes += rawDuration;
    }

    const clientName = normalizeLookupText((session as Record<string, unknown>).clientName);
    if (!entry.clientName && clientName) {
      entry.clientName = clientName;
    }

    aggregates.set(key, entry);
  }
  return aggregates;
}

function formatHoursDecimal(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const hours = safeMinutes / 60;
  return `${hours.toFixed(1)}h`;
}

function formatOvertimeFromSpan(firstStartMs?: number, lastEndMs?: number): string {
  if (firstStartMs == null || lastEndMs == null || lastEndMs < firstStartMs) {
    return '0.0h';
  }
  const spanMinutes = Math.max(0, Math.round((lastEndMs - firstStartMs) / 60000));
  const overtimeMinutes = Math.max(0, spanMinutes - 90 - 450);
  return formatHoursDecimal(overtimeMinutes);
}

function formatTimestampJst(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: 'hour' | 'minute') =>
    parts.find((part) => part.type === type)?.value ?? '';
  const hour = pick('hour');
  const minute = pick('minute');
  if (!hour || !minute) {
    return null;
  }
  return `${hour}:${minute}`;
}

function pickFirstStringField(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (size <= 0) {
    return [values];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchSiteClientNames(sessions: SessionReportRow[]): Promise<Map<string, string>> {
  const siteIds = new Set<string>();
  for (const session of sessions) {
    const directClient = normalizeLookupText((session as Record<string, unknown>).clientName);
    if (directClient) {
      continue;
    }
    if (session.siteRecordId) {
      siteIds.add(session.siteRecordId);
    }
  }

  if (siteIds.size === 0) {
    return new Map();
  }

  const result = new Map<string, string>();
  const idList = Array.from(siteIds);
  const chunks = chunkArray(idList, 10);

  for (const chunk of chunks) {
    if (chunk.length === 0) {
      continue;
    }
    const conditions = chunk.map((id) => `RECORD_ID()='${id}'`).join(',');
    const formula = chunk.length === 1 ? conditions : `OR(${conditions})`;
    const records = await withRetry(() =>
      sitesTable.select({ fields: ['clientName', 'client'], filterByFormula: formula }).all(),
    );
    for (const record of records) {
      const fields = record.fields as Record<string, unknown>;
      const client =
        pickFirstStringField(fields, ['clientName', 'client', 'client name', 'client_name']) ?? null;
      if (client) {
        result.set(record.id, client);
      }
    }
  }

  return result;
}

export async function getReportRowsByUserName(
  userName: string,
  sort?: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Promise<ReportRow[]> {
  const trimmedName = userName.trim();
  if (!trimmedName) {
    return [];
  }

  const sessions = await fetchSessionReportRows({ userName: trimmedName });
  const completedSessions = sessions.filter(
    (session) => session.isCompleted && session.year && session.month && session.day,
  );

  if (completedSessions.length === 0) {
    return [];
  }

  const aggregates = buildDailyAggregates(completedSessions);
  const siteClientNames = await fetchSiteClientNames(completedSessions);

  const rows = completedSessions
    .map<ReportRow>((session) => {
      const rawMinutes =
        session.durationMin ?? (session.hours != null ? Math.round(session.hours * 60) : null);
      const candidate = typeof rawMinutes === 'number' ? Math.round(rawMinutes) : 0;
      const withinBounds = candidate > 0 && candidate < 24 * 60 ? candidate : 0;
      const { minutes } = applyTimeCalcV2FromMinutes(withinBounds);
      const key = toDayKey(session);
      const aggregate = key ? aggregates.get(key) : undefined;
      const siteClientName = session.siteRecordId ? siteClientNames.get(session.siteRecordId) : null;
      const directClientName = normalizeLookupText((session as Record<string, unknown>).clientName);
      const resolvedClientName =
        directClientName ?? aggregate?.clientName ?? siteClientName ?? undefined;
      const resolvedStart = aggregate?.firstStart ?? session.start ?? null;
      const resolvedEnd = aggregate?.lastEnd ?? session.end ?? null;
      const startJst = formatTimestampJst(resolvedStart);
      const endJst = formatTimestampJst(resolvedEnd);
      const overtimeHours = formatOvertimeFromSpan(aggregate?.firstStartMs, aggregate?.lastEndMs);

      return {
        year: session.year ?? 0,
        month: session.month ?? 0,
        day: session.day ?? 0,
        siteName: session.siteName ?? '',
        clientName: resolvedClientName ?? undefined,
        minutes,
        startJst,
        endJst,
        overtimeHours,
      } satisfies ReportRow;
    })
    .filter((row) => row.year > 0 && row.month > 0 && row.day > 0);

  if (sort) {
    const dir = order === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const aValue = a[sort];
      const bValue = b[sort];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const result = aValue.localeCompare(bValue, 'ja');
        return dir === 1 ? result : -result;
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        const result = aValue - bValue;
        return dir === 1 ? result : -result;
      }
      return 0;
    });
  }

  return rows;
}
