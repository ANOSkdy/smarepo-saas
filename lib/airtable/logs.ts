import { Record as AirtableRecord } from 'airtable';
import { logsTable, machinesTable } from '@/lib/airtable';
import type { LogFields, MachineFields } from '@/types';
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
  siteId: string | null;
  siteName: string | null;
  workType: string | null;
  note: string | null;
  machineRecordId: string | null;
  machineId: string | null;
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
  userName: string;
  siteName: string | null;
  clockInAt: string;
  clockOutAt?: string;
  hours?: number;
  status: SessionStatus;
  machineId?: string | null;
};

const RETRY_LIMIT = 3;
const RETRY_DELAY = 500;
const MACHINE_BATCH_SIZE = 10;

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

function escapeFormulaValue(value: string) {
  return value.replace(/'/g, "''");
}

async function fetchMachineIdMap(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) {
    return new Map();
  }

  const map = new Map<string, string>();
  for (let index = 0; index < unique.length; index += MACHINE_BATCH_SIZE) {
    const slice = unique.slice(index, index + MACHINE_BATCH_SIZE);
    const filterByFormula = `OR(${slice.map((id) => `RECORD_ID()='${escapeFormulaValue(id)}'`).join(',')})`;
    const records = await withRetry(() =>
      machinesTable
        .select({
          filterByFormula,
          fields: ['machineid'],
          pageSize: slice.length,
        })
        .all(),
    );
    for (const record of records) {
      const fields = record.fields as MachineFields;
      if (typeof fields.machineid === 'string' && fields.machineid.length > 0) {
        map.set(record.id, fields.machineid);
      }
    }
  }

  return map;
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
  const machineLinks = Array.isArray(fields['machine'])
    ? (fields['machine'] as readonly string[])
    : [];
  const userName = typeof fields[LOG_FIELDS.userName] === 'string'
    ? (fields[LOG_FIELDS.userName] as string)
    : typeof fields[LOG_FIELDS.username] === 'string'
    ? (fields[LOG_FIELDS.username] as string)
    : null;
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
    siteId: siteLinks.length > 0 ? String(siteLinks[0]) : null,
    siteName,
    workType,
    note,
    machineRecordId: machineLinks.length > 0 ? String(machineLinks[0]) : null,
    machineId:
      typeof fields['machineId'] === 'string'
        ? (fields['machineId'] as string)
        : typeof fields['machineid'] === 'string'
        ? (fields['machineid'] as string)
        : null,
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

  const machineLookupIds = normalized
    .filter((log) => !log.machineId && log.machineRecordId)
    .map((log) => log.machineRecordId as string);
  const machineIdMap = machineLookupIds.length > 0 ? await fetchMachineIdMap(machineLookupIds) : new Map();

  const logs = normalized
    .map((log) => {
      if (log.machineId || !log.machineRecordId) {
        return log;
      }
      const resolved = machineIdMap.get(log.machineRecordId) ?? null;
      if (!resolved) {
        return log;
      }
      return { ...log, machineId: resolved } as NormalizedLog;
    })
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const usersMap = await getUsersMap();

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

function createOpenSession(source: NormalizedLog): SessionDetail {
  return {
    userName: source.userName ?? '未登録ユーザー',
    siteName: source.siteName ?? null,
    clockInAt: formatJstTime(source.timestampMs),
    status: '稼働中',
    machineId: source.machineId ?? null,
  };
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

    const durationHours = (log.timestampMs - currentOpen.timestampMs) / (1000 * 60 * 60);
    sessions.push({
      userName: currentOpen.userName ?? log.userName ?? '未登録ユーザー',
      siteName: currentOpen.siteName ?? log.siteName ?? null,
      clockInAt: formatJstTime(currentOpen.timestampMs),
      clockOutAt: formatJstTime(log.timestampMs),
      hours: roundHours(durationHours),
      status: '正常',
      machineId: currentOpen.machineId ?? log.machineId ?? null,
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
