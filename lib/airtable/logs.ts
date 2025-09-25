import { Record as AirtableRecord } from 'airtable';
import { logsTable } from '@/lib/airtable';
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
  siteId: string | null;
  siteName: string | null;
  workType: string | null;
  note: string | null;
};

export type CalendarDaySummary = {
  date: string;
  sites: string[];
  punches: number;
  sessions: number;
  hours: number;
};

export type SessionDetail = {
  userName: string;
  siteName: string | null;
  clockInAt: string;
  clockOutAt: string;
  hours: number;
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

  const logs = records
    .map((record) => toNormalizedLog(record))
    .filter((log): log is NormalizedLog => Boolean(log))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (logs.length === 0) {
    return logs;
  }

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

function buildSessionDetails(logs: NormalizedLog[]): SessionDetail[] {
  const sorted = [...logs].sort((a, b) => a.timestampMs - b.timestampMs);
  const stacks = new Map<string, NormalizedLog[]>();
  const sessions: SessionDetail[] = [];

  for (const log of sorted) {
    const userKey = log.userId ?? log.userName ?? 'unknown-user';
    if (log.type === 'IN') {
      const stack = stacks.get(userKey) ?? [];
      stack.push(log);
      stacks.set(userKey, stack);
      continue;
    }

    const stack = stacks.get(userKey);
    if (!stack || stack.length === 0) {
      console.warn('[calendar][pairing] unmatched OUT punch', userKey, log.id);
      continue;
    }
    const clockIn = stack.shift();
    if (!clockIn) {
      continue;
    }
    if (log.timestampMs <= clockIn.timestampMs) {
      console.warn('[calendar][pairing] non positive duration', userKey, log.id);
      continue;
    }
    const durationHours = (log.timestampMs - clockIn.timestampMs) / (1000 * 60 * 60);
    sessions.push({
      userName: clockIn.userName ?? log.userName ?? '未登録ユーザー',
      siteName: clockIn.siteName ?? log.siteName ?? null,
      clockInAt: formatJstTime(clockIn.timestampMs),
      clockOutAt: formatJstTime(log.timestampMs),
      hours: roundHours(durationHours),
    });
  }

  for (const [userKey, stack] of stacks) {
    if (stack.length > 0) {
      console.warn('[calendar][pairing] unmatched IN punch', userKey, stack[0]?.id);
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
    const hours = sessions.reduce((total, session) => total + session.hours, 0);
    const sites = Array.from(
      new Set(items.map((item) => item.siteName).filter((name): name is string => Boolean(name))),
    );
    summaries.push({
      date,
      sites,
      punches: items.length,
      sessions: sessions.length,
      hours: roundHours(hours),
    });
  }

  return summaries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildDayDetail(logs: NormalizedLog[]): { sessions: SessionDetail[] } {
  const sorted = [...logs].sort((a, b) => a.timestampMs - b.timestampMs);
  const sessions = buildSessionDetails(sorted);
  return { sessions };
}
