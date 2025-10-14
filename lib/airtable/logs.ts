import { Record as AirtableRecord } from 'airtable';
import { logsTable } from '@/lib/airtable';
import { resolveUserIdentity } from '@/lib/services/userIdentity';
import type { LogFields } from '@/types';
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
  siteId: string | null;
  siteName: string | null;
  workType: string | null;
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

type ResolvedLogIdentity = ReturnType<typeof resolveUserIdentity>;

function resolveIdentityForNormalizedLog(log: NormalizedLog): { identity: ResolvedLogIdentity; key: string } {
  const identity = resolveUserIdentity({ id: log.id, fields: log.rawFields });
  const fallbackUserId = typeof log.userId === 'string' && log.userId.length > 0 ? log.userId : undefined;
  const fallbackUserName = typeof log.userName === 'string' && log.userName.length > 0 ? log.userName : undefined;
  const key = identity.employeeCode ?? identity.userRecId ?? fallbackUserId ?? fallbackUserName ?? 'unknown-user';
  return { identity, key };
}

function debugIdentity(identity: ResolvedLogIdentity) {
  return JSON.stringify(identity ?? {});
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
  const note = typeof fields[LOG_FIELDS.note] === 'string' ? (fields[LOG_FIELDS.note] as string) : null;
  const usernameField = typeof fields[LOG_FIELDS.username] === 'string' ? (fields[LOG_FIELDS.username] as string) : null;
  const userEmailField = (() => {
    const rawEmail = fields['userEmail'] ?? fields['email'];
    return typeof rawEmail === 'string' ? rawEmail : null;
  })();
  const machineId = readLookupField(fields, MACHINE_ID_LOOKUP_FIELDS, normalizeMachineIdentifier);

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
    siteId: siteLinks.length > 0 ? String(siteLinks[0]) : null,
    siteName,
    workType,
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

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function createOpenSession(source: NormalizedLog, identityOverride?: ResolvedLogIdentity): SessionDetail {
  const resolved = identityOverride ?? resolveIdentityForNormalizedLog(source).identity;
  const userId =
    source.userId ??
    (typeof resolved.employeeCode === 'string' ? resolved.employeeCode : undefined) ??
    (typeof resolved.userRecId === 'string' ? resolved.userRecId : undefined) ??
    null;

  return {
    userId,
    startMs: source.timestampMs,
    startLogId: source.id,
    userName: source.userName ?? '未登録ユーザー',
    siteName: source.siteName ?? null,
    clockInAt: formatJstTime(source.timestampMs),
    status: '稼働中',
    machineId: source.machineId ?? null,
  };
}

type StackEntry = { log: NormalizedLog; identity: ResolvedLogIdentity };

function createCompletedSession(
  clockIn: NormalizedLog,
  clockInIdentity: ResolvedLogIdentity,
  clockOut: NormalizedLog,
  clockOutIdentity: ResolvedLogIdentity,
): SessionDetail {
  const userId =
    clockIn.userId ??
    clockOut.userId ??
    (typeof clockInIdentity.employeeCode === 'string' ? clockInIdentity.employeeCode : undefined) ??
    (typeof clockOutIdentity.employeeCode === 'string' ? clockOutIdentity.employeeCode : undefined) ??
    (typeof clockInIdentity.userRecId === 'string' ? clockInIdentity.userRecId : undefined) ??
    (typeof clockOutIdentity.userRecId === 'string' ? clockOutIdentity.userRecId : undefined) ??
    null;

  const durationHours = (clockOut.timestampMs - clockIn.timestampMs) / (1000 * 60 * 60);

  return {
    userId,
    startMs: clockIn.timestampMs,
    endMs: clockOut.timestampMs,
    startLogId: clockIn.id,
    endLogId: clockOut.id,
    userName: clockIn.userName ?? clockOut.userName ?? '未登録ユーザー',
    siteName: clockIn.siteName ?? clockOut.siteName ?? null,
    clockInAt: formatJstTime(clockIn.timestampMs),
    clockOutAt: formatJstTime(clockOut.timestampMs),
    hours: roundHours(durationHours),
    status: '正常',
    machineId: clockIn.machineId ?? clockOut.machineId ?? null,
  };
}

function buildSessionDetails(logs: NormalizedLog[]): SessionDetail[] {
  const sorted = [...logs].sort((a, b) => a.timestampMs - b.timestampMs);
  const stacks = new Map<string, StackEntry[]>();
  const sessions: SessionDetail[] = [];

  const ensureStack = (key: string) => {
    if (!stacks.has(key)) {
      stacks.set(key, []);
    }
    return stacks.get(key)!;
  };

  for (const log of sorted) {
    const { identity, key } = resolveIdentityForNormalizedLog(log);

    if (log.type === 'IN') {
      ensureStack(key).push({ log, identity });
      continue;
    }

    if (log.type !== 'OUT') {
      continue;
    }

    const stack = stacks.get(key);
    if (!stack || stack.length === 0) {
      console.warn(
        `[calendar][pairing] unmatched OUT punch { key: '${key}', recId: '${log.id}', identity: ${debugIdentity(identity)} }`,
      );
      continue;
    }

    const entry = stack.pop()!;
    if (stack.length === 0) {
      stacks.delete(key);
    }

    if (log.timestampMs <= entry.log.timestampMs) {
      console.warn(
        `[calendar][pairing] non positive duration { key: '${key}', recId: '${log.id}', identity: ${debugIdentity(identity)}, inRecId: '${entry.log.id}' }`,
      );
      ensureStack(key).push(entry);
      continue;
    }

    sessions.push(createCompletedSession(entry.log, entry.identity, log, identity));
  }

  for (const [key, stack] of stacks.entries()) {
    for (const entry of stack) {
      console.warn(
        `[calendar][pairing] unmatched IN punch { key: '${key}', recId: '${entry.log.id}', identity: ${debugIdentity(entry.identity)} }`,
      );
      sessions.push(createOpenSession(entry.log, entry.identity));
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
    const completedSessions = sessions.filter((session) => session.status === '正常');
    const hours = completedSessions.reduce((total, session) => total + (session.hours ?? 0), 0);
    const sites = Array.from(
      new Set(items.map((item) => item.siteName).filter((name): name is string => Boolean(name))),
    );
    summaries.push({
      date,
      sites,
      punches: items.length,
      sessions: completedSessions.length,
      hours: roundHours(hours),
    });
  }

  return summaries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildDayDetail(logs: NormalizedLog[]): { sessions: SessionDetail[] } {
  const sessions = buildSessionDetails(logs);
  return { sessions };
}
