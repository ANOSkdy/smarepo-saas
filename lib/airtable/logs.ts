import { Record as AirtableRecord } from 'airtable';
import { logsTable } from '@/lib/airtable';
import type { LogFields } from '@/types';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';
import { getUsersMap } from './users';
import { AIRTABLE_PAGE_SIZE, JST_OFFSET, LOG_FIELDS } from './schema';

type LogType = 'IN' | 'OUT';

export type NormalizedLog = {
  id: string;
  type: LogType;
  timestamp: string;
  timestampMs: number;
  userId: string | null;
  userName: string | null;
  userLookupKeys: string[];
  machineId: string | null;
  machineName: string | null;
  siteId: string | null;
  siteName: string | null;
  workType: string | null;
  workDescriptions: string[];
  note: string | null;
  rawFields: Record<string, unknown>;
};

export type CalendarDaySummary = {
  date: string;
  sites: string[];
  punches: number;
  sessions: number;
  hours: number;
};

export type SessionStatus = '正常' | '稼働中';

export type SessionDetail = {
  userId: string | null;
  startMs: number;
  endMs?: number;
  startLogId: string;
  endLogId?: string;
  userName: string;
  siteName: string | null;
  clockInAt: string;
  clockOutAt?: string;
  hours?: number;
  status: SessionStatus;
  machineId: string | null;
  machineName: string | null;
  workDescription: string | null;
};

const RETRY_LIMIT = 3;
const RETRY_DELAY = 500;
async function withRetry<T>(factory: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (attempt >= RETRY_LIMIT) {
      throw error;
    }
    const delay = RETRY_DELAY * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(factory, attempt + 1);
  }
}

const MACHINE_ID_LOOKUP_FIELDS = [
  LOG_FIELDS.machineId,
  LOG_FIELDS.machineid,
  LOG_FIELDS.machineIdFromMachine,
  LOG_FIELDS.machineidFromMachine,
] as const;

const MACHINE_NAME_LOOKUP_FIELDS = [
  LOG_FIELDS.machineName,
  LOG_FIELDS.machinename,
  LOG_FIELDS.machineNameFromMachine,
  LOG_FIELDS.machinenameFromMachine,
] as const;

const USER_NAME_LOOKUP_FIELDS = [
  LOG_FIELDS.userName,
  LOG_FIELDS.username,
  LOG_FIELDS.userNameFromUser,
  LOG_FIELDS.nameFromUser,
] as const;

function normalizeLookupText(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const normalized = normalizeLookupText(entry);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }
  const text = String(raw).trim();
  return text.length === 0 ? null : text;
}

function normalizeMachineIdentifier(raw: unknown): string | null {
  const text = normalizeLookupText(raw);
  if (!text) {
    return null;
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const normalized = normalizeMachineIdentifier(item);
          if (normalized) {
            return normalized;
          }
        }
      }
    } catch {
      // ignore JSON parse errors and fall back to trimmed text handling
    }
  }
  const [first] = text.split(',');
  const normalized = first.trim();
  return normalized.length > 0 ? normalized : null;
}

function readLookupField(
  fields: Record<string, unknown>,
  keys: readonly string[],
  normalizer: (value: unknown) => string | null,
): string | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      continue;
    }
    const value = fields[key];
    const normalized = normalizer(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractWorkDescriptions(raw: unknown): string[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  if (Array.isArray(raw)) {
    const collected: string[] = [];
    for (const entry of raw) {
      collected.push(...extractWorkDescriptions(entry));
    }
    return collected;
  }
  const text = String(raw).trim();
  return text.length === 0 ? [] : [text];
}

function toNormalizedLog(record: AirtableRecord<LogFields>): NormalizedLog | null {
  const fields = record.fields as Record<string, unknown>;
  const typeRaw = fields[LOG_FIELDS.type];
  if (typeRaw !== 'IN' && typeRaw !== 'OUT') {
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
  const userLinks = Array.isArray(fields[LOG_FIELDS.user])
    ? (fields[LOG_FIELDS.user] as readonly string[])
    : [];
  const userIdField = typeof fields['userId'] === 'string' ? (fields['userId'] as string) : null;
  const siteLinks = Array.isArray(fields[LOG_FIELDS.site])
    ? (fields[LOG_FIELDS.site] as readonly string[])
    : [];
  const userName = readLookupField(fields, USER_NAME_LOOKUP_FIELDS, normalizeLookupText);
  const fallbackSiteName = fields['sitename'];
  const siteName = typeof fields[LOG_FIELDS.siteName] === 'string'
    ? (fields[LOG_FIELDS.siteName] as string)
    : typeof fallbackSiteName === 'string'
    ? (fallbackSiteName as string)
    : null;
  const workType = typeof fields[LOG_FIELDS.workType] === 'string'
    ? (fields[LOG_FIELDS.workType] as string)
    : typeof fields[LOG_FIELDS.workDescription] === 'string'
    ? (fields[LOG_FIELDS.workDescription] as string)
    : null;
  const workDescriptions = Array.from(new Set(extractWorkDescriptions(fields[LOG_FIELDS.workDescription])));
  const note = typeof fields[LOG_FIELDS.note] === 'string' ? (fields[LOG_FIELDS.note] as string) : null;
  const usernameField = typeof fields[LOG_FIELDS.username] === 'string' ? (fields[LOG_FIELDS.username] as string) : null;
  const userEmailField = (() => {
    const rawEmail = fields['userEmail'] ?? fields['email'];
    return typeof rawEmail === 'string' ? rawEmail : null;
  })();
  const machineId = readLookupField(fields, MACHINE_ID_LOOKUP_FIELDS, normalizeMachineIdentifier);
  const machineNameLookup = readLookupField(fields, MACHINE_NAME_LOOKUP_FIELDS, normalizeLookupText);
  const fallbackMachineName = normalizeLookupText(fields['machinename'] ?? fields['machineName']);
  const machineName = machineNameLookup ?? fallbackMachineName;

  const lookupKeys = new Set<string>();
  if (userLinks.length > 0) {
    lookupKeys.add(String(userLinks[0]));
  }
  if (userIdField) {
    lookupKeys.add(userIdField);
  }
  if (usernameField) {
    lookupKeys.add(usernameField);
  }
  if (userEmailField) {
    lookupKeys.add(userEmailField);
    lookupKeys.add(userEmailField.toLowerCase());
  }

  return {
    id: record.id,
    type: typeRaw,
    timestamp: timestampRaw,
    timestampMs,
    userId: userLinks.length > 0 ? String(userLinks[0]) : null,
    userName,
    userLookupKeys: Array.from(lookupKeys),
    machineId,
    machineName,
    siteId: siteLinks.length > 0 ? String(siteLinks[0]) : null,
    siteName,
    workType,
    workDescriptions,
    note,
    rawFields: fields,
  };
}

export async function getLogsBetween(params: { from: Date; to: Date }): Promise<NormalizedLog[]> {
  const { from, to } = params;
  const startIso = from.toISOString();
  const endIso = to.toISOString();
  const filterByFormula = `AND(NOT(IS_BEFORE({${LOG_FIELDS.timestamp}}, '${startIso}')), IS_BEFORE({${LOG_FIELDS.timestamp}}, '${endIso}'))`;

  const records = await withRetry(() =>
    logsTable
      .select({
        filterByFormula,
        pageSize: AIRTABLE_PAGE_SIZE,
        sort: [{ field: LOG_FIELDS.timestamp, direction: 'asc' }],
      })
      .all(),
  );

  const normalized = records
    .map((record) => toNormalizedLog(record))
    .filter((log): log is NormalizedLog => Boolean(log));

  if (normalized.length === 0) {
    return normalized;
  }

  const usersMap = await getUsersMap();
  const logs = normalized.sort((a, b) => a.timestampMs - b.timestampMs);

  return logs.map((log) => {
    const candidates = new Set<string>();
    if (log.userId) {
      candidates.add(log.userId);
      candidates.add(log.userId.toLowerCase());
    }
    for (const key of log.userLookupKeys) {
      if (!key) continue;
      candidates.add(String(key));
      candidates.add(String(key).toLowerCase());
    }

    let resolvedName = log.userName;
    for (const key of candidates) {
      const match = usersMap.get(key);
      if (match?.name) {
        resolvedName = match.name;
        break;
      }
    }

    return {
      ...log,
      userName: resolvedName ?? '未登録ユーザー',
      machineId: log.machineId ?? null,
      machineName: log.machineName ?? null,
    };
  });
}

function toJstParts(timestampMs: number) {
  const jstDate = new Date(timestampMs + JST_OFFSET);
  return {
    year: jstDate.getUTCFullYear(),
    month: jstDate.getUTCMonth() + 1,
    day: jstDate.getUTCDate(),
    hour: jstDate.getUTCHours(),
    minute: jstDate.getUTCMinutes(),
    second: jstDate.getUTCSeconds(),
  };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatJstDate(timestampMs: number) {
  const { year, month, day } = toJstParts(timestampMs);
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatJstTime(timestampMs: number) {
  const { hour, minute } = toJstParts(timestampMs);
  return `${pad(hour)}:${pad(minute)}`;
}

function formatJstIso(timestampMs: number) {
  const { year, month, day, hour, minute, second } = toJstParts(timestampMs);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+09:00`;
}

function joinWorkDescriptions(values: Iterable<string>): string {
  return Array.from(values).join(' / ');
}

function getWorkDescriptions(source: NormalizedLog | null | undefined): string[] {
  if (!source) {
    return [];
  }
  if (!Array.isArray(source.workDescriptions)) {
    return [];
  }
  return source.workDescriptions
    .map((value) => (typeof value === 'string' ? value.trim() : String(value).trim()))
    .filter((value) => value.length > 0);
}

function resolveWorkDescription(source: NormalizedLog | null): string | null {
  if (!source) {
    return null;
  }
  const direct = getWorkDescriptions(source);
  if (direct.length > 0) {
    return joinWorkDescriptions(new Set(direct));
  }
  const work = typeof source.workType === 'string' ? source.workType.trim() : '';
  if (work) {
    return work;
  }
  const note = typeof source.note === 'string' ? source.note.trim() : '';
  return note || null;
}

function createOpenSession(source: NormalizedLog): SessionDetail {
  return {
    userId: source.userId,
    startMs: source.timestampMs,
    startLogId: source.id,
    userName: source.userName ?? '未登録ユーザー',
    siteName: source.siteName ?? null,
    clockInAt: formatJstTime(source.timestampMs),
    status: '稼働中',
    machineId: source.machineId ?? null,
    machineName: source.machineName ?? null,
    workDescription: resolveWorkDescription(source),
  };
}

function toUserKey(source: NormalizedLog | null | undefined): string {
  if (!source) {
    return 'unknown-user';
  }
  return source.userId ?? source.userName ?? 'unknown-user';
}

function pickSessionWorkDescription(
  logs: NormalizedLog[],
  userKey: string,
  startMs: number,
  endMs: number,
  endLog: NormalizedLog,
): string | null {
  const collected = new Set<string>();

  for (const log of logs) {
    if (log.timestampMs < startMs || log.timestampMs > endMs) {
      continue;
    }
    if (toUserKey(log) !== userKey) {
      continue;
    }
    for (const value of getWorkDescriptions(log)) {
      collected.add(value);
    }
  }

  if (collected.size > 0) {
    return joinWorkDescriptions(collected);
  }

  if (toUserKey(endLog) === userKey) {
    for (const value of getWorkDescriptions(endLog)) {
      collected.add(value);
    }
    if (collected.size > 0) {
      return joinWorkDescriptions(collected);
    }
  }

  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];
    if (log.timestampMs > endMs) {
      continue;
    }
    if (toUserKey(log) !== userKey) {
      continue;
    }
    const values = getWorkDescriptions(log);
    if (values.length === 0) {
      continue;
    }
    return joinWorkDescriptions(new Set(values));
  }

  return null;
}

function buildSessionDetails(logs: NormalizedLog[]): SessionDetail[] {
  const sorted = [...logs].sort((a, b) => a.timestampMs - b.timestampMs);
  const openSessions = new Map<string, NormalizedLog | null>();
  const sessions: SessionDetail[] = [];

  for (const log of sorted) {
    const userKey = log.userId ?? log.userName ?? 'unknown-user';
    const currentOpen = openSessions.get(userKey) ?? null;

    if (log.type === 'IN') {
      if (currentOpen) {
        console.warn('[calendar][pairing] consecutive IN punch treated as open session', userKey, currentOpen.id);
        sessions.push(createOpenSession(currentOpen));
      }
      openSessions.set(userKey, log);
      continue;
    }

    if (!currentOpen) {
      console.warn('[calendar][pairing] unmatched OUT punch', userKey, log.id);
      continue;
    }

    if (log.timestampMs <= currentOpen.timestampMs) {
      console.warn('[calendar][pairing] non positive duration', userKey, log.id);
      continue;
    }

    const durationMinutes = Math.max(0, Math.round((log.timestampMs - currentOpen.timestampMs) / 60000));
    const { hours } = applyTimeCalcV2FromMinutes(durationMinutes, { breakMinutes: 0 });
    const workDescription = pickSessionWorkDescription(sorted, userKey, currentOpen.timestampMs, log.timestampMs, log);

    sessions.push({
      userId: currentOpen.userId ?? log.userId ?? null,
      startMs: currentOpen.timestampMs,
      endMs: log.timestampMs,
      startLogId: currentOpen.id,
      endLogId: log.id,
      userName: currentOpen.userName ?? log.userName ?? '未登録ユーザー',
      siteName: currentOpen.siteName ?? log.siteName ?? null,
      clockInAt: formatJstTime(currentOpen.timestampMs),
      clockOutAt: formatJstTime(log.timestampMs),
      hours,
      status: '正常',
      machineId: currentOpen.machineId ?? log.machineId ?? null,
      machineName: currentOpen.machineName ?? log.machineName ?? null,
      workDescription,
    });
    openSessions.set(userKey, null);
  }

  for (const [userKey, pending] of openSessions) {
    if (pending) {
      console.warn('[calendar][pairing] unmatched IN punch', userKey, pending.id);
      sessions.push(createOpenSession(pending));
    }
  }

  return sessions;
}

export function summariseMonth(logs: NormalizedLog[]): CalendarDaySummary[] {
  const grouped = new Map<string, NormalizedLog[]>();
  for (const log of logs) {
    const dateKey = formatJstDate(log.timestampMs);
    const group = grouped.get(dateKey) ?? [];
    group.push(log);
    grouped.set(dateKey, group);
  }

  const summaries: CalendarDaySummary[] = [];
  for (const [date, items] of grouped) {
    const sessions = buildSessionDetails(items);
    const completedSessions = sessions.filter(isCompletedSession);
    const totalMinutes = completedSessions.reduce((total, session) => {
      const durationMinutes = Math.round((session.endMs - session.startMs) / 60000);
      return total + Math.max(0, durationMinutes);
    }, 0);
    const { hours } = applyTimeCalcV2FromMinutes(totalMinutes);
    const sites = Array.from(
      new Set(items.map((item) => item.siteName).filter((name): name is string => Boolean(name))),
    );
    summaries.push({
      date,
      sites,
      punches: items.length,
      sessions: completedSessions.length,
      hours,
    });
  }

  return summaries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildDayDetail(logs: NormalizedLog[]): { sessions: SessionDetail[] } {
  const sessions = buildSessionDetails(logs);
  return { sessions };
}

type CompletedSessionDetail = SessionDetail & {
  endMs: number;
  clockOutAt: string;
  hours: number;
  status: '正常';
};

function isCompletedSession(session: SessionDetail): session is CompletedSessionDetail {
  return (
    session.status === '正常' &&
    typeof session.endMs === 'number' &&
    typeof session.hours === 'number' &&
    typeof session.clockOutAt === 'string'
  );
}

export type SessionReportRow = {
  id: string;
  date: string;
  userId: string | null;
  userName: string;
  siteName: string | null;
  machineId: string | null;
  machineName: string | null;
  workDescription: string | null;
  clockInAt: string;
  clockOutAt: string;
  hours: number;
};

function compareLocaleAware(a: string, b: string) {
  return a.localeCompare(b, 'ja');
}

export function buildSessionReport(logs: NormalizedLog[]): SessionReportRow[] {
  const sessions = buildSessionDetails(logs);
  const completed = sessions.filter(isCompletedSession);

  const rows = completed.map((session) => {
    const machineLabel = session.machineName ?? session.machineId ?? null;
    return {
      id: session.endLogId ?? session.startLogId,
      date: formatJstDate(session.startMs),
      userId: session.userId ?? null,
      userName: session.userName,
      siteName: session.siteName ?? null,
      machineId: session.machineId ?? null,
      machineName: machineLabel,
      workDescription: session.workDescription ?? null,
      clockInAt: formatJstIso(session.startMs),
      clockOutAt: formatJstIso(session.endMs),
      hours: session.hours,
    } satisfies SessionReportRow;
  });

  return rows.sort((a, b) => {
    return (
      compareLocaleAware(a.siteName ?? '', b.siteName ?? '') ||
      compareLocaleAware(a.userName, b.userName) ||
      compareLocaleAware(a.machineName ?? '', b.machineName ?? '') ||
      compareLocaleAware(a.date, b.date) ||
      compareLocaleAware(a.clockInAt, b.clockInAt)
    );
  });
}
