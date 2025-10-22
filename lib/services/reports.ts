import { usersTable } from '@/lib/airtable';
import { escapeAirtable } from '@/lib/airtable/schema';
import { type ReportRow } from '@/lib/reports/pair';
import { listSessions, type SessionRecord } from '@/src/lib/data/sessions';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

function parseSessionDate(session: SessionRecord): { key: string; year: number; month: number; day: number } | null {
  const rawDate = typeof session.date === 'string' && session.date.trim().length > 0
    ? session.date.trim()
    : typeof session.start === 'string' && session.start.length >= 10
    ? session.start.slice(0, 10)
    : typeof session.inLog === 'string' && session.inLog.length >= 10
    ? session.inLog.slice(0, 10)
    : null;
  if (!rawDate) {
    return null;
  }
  const [yearText, monthText, dayText] = rawDate.split('-');
  const year = Number.parseInt(yearText ?? '', 10);
  const month = Number.parseInt(monthText ?? '', 10);
  const day = Number.parseInt(dayText ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { key, year, month, day };
}

function resolveSessionMinutes(session: SessionRecord): number | null {
  if (typeof session.durationMin === 'number' && Number.isFinite(session.durationMin)) {
    return Math.max(0, session.durationMin);
  }
  if (session.durationMin !== undefined) {
    const parsed = Number(session.durationMin);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  if (typeof session.start === 'string' && typeof session.end === 'string') {
    const startMs = Date.parse(session.start);
    const endMs = Date.parse(session.end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      return Math.max(0, Math.round((endMs - startMs) / 60000));
    }
  }
  return null;
}

export async function getReportRowsByUserName(
  userName: string,
  sort?: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Promise<ReportRow[]> {
  const escapedUserName = escapeAirtable(userName);
  const users = await usersTable
    .select({ filterByFormula: `{name} = '${escapedUserName}'`, maxRecords: 1 })
    .firstPage();
  const userRec = users?.[0];
  if (!userRec) return [];

  const userFields = userRec.fields as Record<string, unknown> | undefined;
  const candidateKeys = new Set<string>();
  candidateKeys.add(userRec.id);
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    candidateKeys.add(trimmed);
  };
  push(userFields?.name);
  push(userFields?.userId);
  push(userFields?.username);

  const formulas = Array.from(candidateKeys).map((value) => `{user}='${escapeAirtable(value)}'`);
  const filterFormula = formulas.length === 0 ? undefined : formulas.length === 1 ? formulas[0] : `OR(${formulas.join(',')})`;

  const sessions = await listSessions({
    filterFormula,
    status: 'close',
    sortBy: [{ field: 'date', direction: 'asc' }],
  });

  const keyMatches = new Set(Array.from(candidateKeys).map((value) => value.toLowerCase()));
  const aggregated = new Map<string, { year: number; month: number; day: number; siteName: string; minutes: number }>();

  for (const session of sessions) {
    const userValue = session.user;
    if (userValue === null || userValue === undefined) {
      continue;
    }
    const normalizedUser = String(userValue).trim();
    if (!normalizedUser || !keyMatches.has(normalizedUser.toLowerCase())) {
      continue;
    }
    const dateParts = parseSessionDate(session);
    if (!dateParts) {
      continue;
    }
    const minutes = resolveSessionMinutes(session);
    if (minutes === null || minutes <= 0) {
      continue;
    }
    const siteName = typeof session.siteName === 'string' ? session.siteName : '';
    const groupKey = `${dateParts.key}__${siteName}`;
    const entry = aggregated.get(groupKey) ?? {
      year: dateParts.year,
      month: dateParts.month,
      day: dateParts.day,
      siteName,
      minutes: 0,
    };
    entry.minutes += minutes;
    aggregated.set(groupKey, entry);
  }

  const normalized = Array.from(aggregated.values()).map<ReportRow>((entry) => ({
    year: entry.year,
    month: entry.month,
    day: entry.day,
    siteName: entry.siteName,
    clientName: undefined,
    minutes: applyTimeCalcV2FromMinutes(entry.minutes).minutes,
  }));

  if (sort) {
    const dir = order === 'desc' ? -1 : 1;
    normalized.sort((a, b) => {
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

  return normalized;
}
