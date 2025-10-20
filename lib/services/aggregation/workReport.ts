import { Record as AirtableRecord } from 'airtable';
import { logsTable, withRetry } from '@/lib/airtable';
import { LOG_FIELDS } from '@/lib/airtable/schema';
import type { LogFields } from '@/types';
import { resolveUserIdentity, resolveUserKey } from '@/lib/services/userIdentity';
import { normalizeDailyMinutes } from '@/src/lib/timecalc';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type LogRecord = AirtableRecord<LogFields>;

type EnrichedLog = {
  record: LogRecord;
  id: string;
  type: 'IN' | 'OUT';
  timestampMs: number;
  userKey: string;
  siteName?: string;
  machineId?: string;
  machineLabel?: string;
  work?: string;
};

type Session = {
  in: EnrichedLog;
  out: EnrichedLog;
  mins: number;
  dayKeyJst: string;
  attrs: {
    siteName?: string;
    machineId?: string;
    machineLabel?: string;
    work?: string;
  };
};

function toUtcRangeOfJstMonth(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0, 0));
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1, -9, 0, 0, 0));
  return { startUtcIso: start.toISOString(), endUtcIso: end.toISOString() };
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeString(item);
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}

function resolveSiteName(fields: Record<string, unknown>): string | undefined {
  return (
    normalizeString(fields[LOG_FIELDS.siteName]) ??
    normalizeString(fields['sitename']) ??
    normalizeString(fields['site']) ??
    undefined
  );
}

const MACHINE_ID_CANDIDATE_KEYS = [
  LOG_FIELDS.machineId,
  LOG_FIELDS.machineid,
  LOG_FIELDS.machineIdFromMachine,
  LOG_FIELDS.machineidFromMachine,
  'machine',
];

const MACHINE_LABEL_KEYS = [
  LOG_FIELDS.machineName,
  LOG_FIELDS.machinename,
  LOG_FIELDS.machineNameFromMachine,
  LOG_FIELDS.machinenameFromMachine,
  'machineName',
  'machinename',
];

function resolveMachineId(fields: Record<string, unknown>): string | undefined {
  for (const key of MACHINE_ID_CANDIDATE_KEYS) {
    if (key in fields) {
      const value = normalizeString(fields[key]);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

function resolveMachineLabel(fields: Record<string, unknown>): string | undefined {
  for (const key of MACHINE_LABEL_KEYS) {
    if (key in fields) {
      const value = normalizeString(fields[key]);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

function resolveWork(fields: Record<string, unknown>): string | undefined {
  return (
    normalizeString(fields['work']) ??
    normalizeString(fields[LOG_FIELDS.workType]) ??
    normalizeString(fields[LOG_FIELDS.workDescription]) ??
    undefined
  );
}

function enrichRecord(record: LogRecord): EnrichedLog | null {
  const fields = record.fields as Record<string, unknown>;
  const type = fields[LOG_FIELDS.type];
  if (type !== 'IN' && type !== 'OUT') {
    return null;
  }
  const timestampRaw = fields[LOG_FIELDS.timestamp];
  if (typeof timestampRaw !== 'string') {
    return null;
  }
  const timestampMs = Date.parse(timestampRaw);
  if (Number.isNaN(timestampMs)) {
    return null;
  }
  const userKey = resolveUserKey(record);
  return {
    record,
    id: record.id,
    type,
    timestampMs,
    userKey,
    siteName: resolveSiteName(fields),
    machineId: resolveMachineId(fields),
    machineLabel: resolveMachineLabel(fields),
    work: resolveWork(fields),
  };
}

function pairByStack(rows: EnrichedLog[]) {
  const stack: EnrichedLog[] = [];
  const sessions: Session[] = [];
  const unmatched: Array<{ kind: 'IN' | 'OUT'; rec: EnrichedLog }> = [];

  const sorted = [...rows].sort((a, b) => a.timestampMs - b.timestampMs);

  for (const row of sorted) {
    if (row.type === 'IN') {
      stack.push(row);
      continue;
    }
    if (row.type === 'OUT') {
      const inRec = stack.pop();
      if (!inRec) {
        unmatched.push({ kind: 'OUT', rec: row });
        continue;
      }
      const mins = Math.max(0, Math.round((row.timestampMs - inRec.timestampMs) / 60000));
      const dayKeyJst = new Date(inRec.timestampMs + JST_OFFSET_MS).toISOString().slice(0, 10);
      sessions.push({
        in: inRec,
        out: row,
        mins,
        dayKeyJst,
        attrs: {
          siteName: inRec.siteName ?? row.siteName,
          machineId: inRec.machineId ?? row.machineId,
          machineLabel: inRec.machineLabel ?? row.machineLabel,
          work: inRec.work ?? row.work,
        },
      });
    }
  }

  while (stack.length > 0) {
    const rest = stack.pop();
    if (rest) {
      unmatched.push({ kind: 'IN', rec: rest });
    }
  }

  return { sessions, unmatched };
}

function matchesUserKey(target: string | undefined, candidates: (string | undefined)[]): boolean {
  if (!target) {
    return true;
  }
  return candidates.filter(Boolean).some((candidate) => candidate === target);
}

export async function getWorkReportByMonth(params: {
  year: number;
  month: number;
  userKey?: string;
  siteName?: string;
  machineId?: string | number;
}) {
  const { year, month, userKey, siteName, machineId } = params;
  const { startUtcIso, endUtcIso } = toUtcRangeOfJstMonth(year, month);
  const filterByFormula = `AND(OR({${LOG_FIELDS.type}}='IN',{${LOG_FIELDS.type}}='OUT'),IS_AFTER({${LOG_FIELDS.timestamp}}, '${startUtcIso}'),IS_BEFORE({${LOG_FIELDS.timestamp}}, '${endUtcIso}'))`;

  const records = await withRetry(() =>
    logsTable
      .select({
        filterByFormula,
        pageSize: 100,
        sort: [{ field: LOG_FIELDS.timestamp, direction: 'asc' }],
      })
      .all()
  );

  const normalized: EnrichedLog[] = [];
  for (const record of records) {
    const identity = resolveUserIdentity(record);
    const enriched = enrichRecord(record);
    if (!enriched) {
      continue;
    }
    if (
      userKey &&
      !matchesUserKey(userKey, [
        identity.employeeCode,
        identity.userRecId,
        identity.username,
        enriched.userKey,
      ])
    ) {
      continue;
    }
    if (siteName) {
      const site = enriched.siteName ?? resolveSiteName(record.fields as Record<string, unknown>);
      if (!site || site !== siteName) {
        continue;
      }
    }
    if (machineId) {
      const machine = enriched.machineId ?? resolveMachineId(record.fields as Record<string, unknown>);
      if (!machine || String(machine) !== String(machineId)) {
        continue;
      }
    }
    normalized.push(enriched);
  }

  const byUser = new Map<string, EnrichedLog[]>();
  for (const row of normalized) {
    if (!byUser.has(row.userKey)) {
      byUser.set(row.userKey, []);
    }
    byUser.get(row.userKey)!.push(row);
  }

  const result: Array<{
    userKey: string;
    days: { day: string; totalMins: number; breakdown: Record<string, number> }[];
    unmatchedCount: number;
  }> = [];
  const warnings: Array<{ kind: 'IN' | 'OUT'; recId: string; userKey: string }> = [];

  for (const [key, rows] of byUser) {
    const { sessions, unmatched } = pairByStack(rows);
    const byDay = new Map<string, { totalMins: number; breakdown: Record<string, number> }>();
    for (const session of sessions) {
      if (!byDay.has(session.dayKeyJst)) {
        byDay.set(session.dayKeyJst, { totalMins: 0, breakdown: {} });
      }
      const daily = byDay.get(session.dayKeyJst)!;
      daily.totalMins += session.mins;
      const labelParts = [session.attrs.siteName ?? '-', session.attrs.machineId ?? session.attrs.machineLabel ?? '-'];
      const label = labelParts.join(' / ');
      daily.breakdown[label] = (daily.breakdown[label] ?? 0) + session.mins;
    }

    result.push({
      userKey: key,
      days: Array.from(byDay.entries())
        .map(([day, value]) => ({
          day,
          totalMins: normalizeDailyMinutes(value.totalMins),
          breakdown: value.breakdown,
        }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      unmatchedCount: unmatched.length,
    });

    for (const item of unmatched) {
      warnings.push({ kind: item.kind, recId: item.rec.id, userKey: key });
    }
  }

  result.sort((a, b) => a.userKey.localeCompare(b.userKey, 'ja'));

  return { range: { startUtcIso, endUtcIso }, result, warnings };
}
