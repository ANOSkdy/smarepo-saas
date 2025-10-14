import { Record as AirtableRecord } from 'airtable';
import { logsTable } from '@/lib/airtable';
import type { LogFields } from '@/types';
import { resolveUserIdentity } from '@/lib/services/userIdentity';
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

type UserIdentity = ReturnType<typeof resolveUserIdentity>;

function toLogRecFromNormalized(log: NormalizedLog) {
  return {
    id: log.id,
    fields: (log.rawFields ?? {}) as Record<string, unknown>,
  };
}

function ensureIdentity(
  log: NormalizedLog,
  cache: Map<string, UserIdentity>,
): UserIdentity {
  const cached = cache.get(log.id);
  if (cached) {
    return cached;
  }
  const identity = resolveUserIdentity(toLogRecFromNormalized(log));
  cache.set(log.id, identity);
  return identity;
}

function computePairingKey(log: NormalizedLog, identity: UserIdentity): string {
  const fallbackLookup = log.userLookupKeys.find((value) => value);
  const base =
    identity.employeeCode ??
    identity.userRecId ??
    log.userId ??
    fallbackLookup ??
    log.userName ??
    'unknown-user';
  const site = log.siteId ?? log.siteName ?? 'site-unknown';
  const machine = log.machineId ?? 'machine-unknown';
  return [base, site, machine].join('::');
}

function createOpenSession(source: NormalizedLog, identity: UserIdentity): SessionDetail {
  const fallbackLookup = source.userLookupKeys.find((value) => value);
  const resolvedUserId =
    identity.employeeCode ??
    identity.userRecId ??
    source.userId ??
    fallbackLookup ??
    null;

  return {
    userId: resolvedUserId,
    startMs: source.timestampMs,
    startLogId: source.id,
    userName: source.userName ?? '未登録ユーザー',
    siteName: source.siteName ?? null,
    clockInAt: formatJstTime(source.timestampMs),
    status: '稼働中',
    machineId: source.machineId ?? null,
  };
}

function buildSessionDetails(logs: NormalizedLog[]): SessionDetail[] {
  const sorted = [...logs].sort((a, b) => a.timestampMs - b.timestampMs);
  const identityCache = new Map<string, UserIdentity>();
  const stacks = new Map<string, NormalizedLog[]>();
  const sessions: SessionDetail[] = [];

  const pushStack = (key: string, log: NormalizedLog) => {
    const stack = stacks.get(key);
    if (stack) {
      stack.push(log);
      return;
    }
    stacks.set(key, [log]);
  };

  const popStack = (key: string, outLog: NormalizedLog): NormalizedLog | null => {
    const stack = stacks.get(key);
    if (!stack || stack.length === 0) {
      return null;
    }
    while (stack.length > 0) {
      const candidate = stack.pop()!;
      if (stack.length === 0) {
        stacks.delete(key);
      }
      if (candidate.timestampMs < outLog.timestampMs) {
        return candidate;
      }
      console.warn('[calendar][pairing] discard non chronological IN punch', {
        key,
        inLogId: candidate.id,
        outLogId: outLog.id,
      });
    }
    return null;
  };

  for (const log of sorted) {
    if (log.type !== 'IN' && log.type !== 'OUT') {
      continue;
    }

    const identity = ensureIdentity(log, identityCache);
    const key = computePairingKey(log, identity);

    if (log.type === 'IN') {
      pushStack(key, log);
      continue;
    }

    const inLog = popStack(key, log);
    if (!inLog) {
      console.warn('[calendar][pairing] unmatched OUT punch', {
        key,
        outLogId: log.id,
        identity,
      });
      continue;
    }

    if (log.timestampMs <= inLog.timestampMs) {
      console.warn('[calendar][pairing] non positive duration', {
        key,
        inLogId: inLog.id,
        outLogId: log.id,
      });
      continue;
    }

    const inIdentity = ensureIdentity(inLog, identityCache);
    const durationHours = (log.timestampMs - inLog.timestampMs) / (1000 * 60 * 60);
    const sessionEmployeeCode = identity.employeeCode ?? inIdentity.employeeCode;
    const sessionUserRecId = identity.userRecId ?? inIdentity.userRecId;
    const sessionUserId =
      sessionEmployeeCode ??
      sessionUserRecId ??
      inLog.userId ??
      log.userId ??
      inLog.userLookupKeys.find((value) => value) ??
      log.userLookupKeys.find((value) => value) ??
      null;

    sessions.push({
      userId: sessionUserId,
      startMs: inLog.timestampMs,
      endMs: log.timestampMs,
      startLogId: inLog.id,
      endLogId: log.id,
      userName: inLog.userName ?? log.userName ?? '未登録ユーザー',
      siteName: inLog.siteName ?? log.siteName ?? null,
      clockInAt: formatJstTime(inLog.timestampMs),
      clockOutAt: formatJstTime(log.timestampMs),
      hours: roundHours(durationHours),
      status: '正常',
      machineId: inLog.machineId ?? log.machineId ?? null,
    });
  }

  for (const [key, stack] of stacks) {
    if (!stack) {
      continue;
    }
    while (stack.length > 0) {
      const pending = stack.pop();
      if (!pending) {
        continue;
      }
      const identity = ensureIdentity(pending, identityCache);
      console.warn('[calendar][pairing] unmatched IN punch', {
        key,
        inLogId: pending.id,
        identity,
      });
      sessions.push(createOpenSession(pending, identity));
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
