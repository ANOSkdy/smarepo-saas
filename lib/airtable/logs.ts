import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';
import { listSessions, type SessionRecord } from '@/src/lib/data/sessions';
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

function parseSessionTimestamp(value: unknown): { iso: string; ms: number } | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return null;
  }
  return { iso: trimmed, ms };
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitWorkDescriptions(source: unknown): string[] {
  if (typeof source !== 'string') {
    return [];
  }
  return source
    .split(/[\n,;/]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function createNormalizedLogFromSession(
  session: SessionRecord,
  type: LogType,
  stamp: { iso: string; ms: number },
  suffix: string,
): NormalizedLog {
  const userRaw = session.user;
  const userId = userRaw === null || userRaw === undefined ? null : String(userRaw).trim() || null;
  const userName = typeof session.user === 'string' && session.user.trim().length > 0 ? session.user.trim() : null;

  const machineIdRaw = session.machineId ?? session.machine ?? null;
  const machineId = machineIdRaw === null || machineIdRaw === undefined ? null : String(machineIdRaw).trim() || null;
  const machineName =
    typeof session.machineName === 'string' && session.machineName.trim().length > 0
      ? session.machineName.trim()
      : typeof session.machine === 'string' && session.machine.trim().length > 0
      ? session.machine.trim()
      : null;

  const workDesc = typeof session.workDescription === 'string' ? session.workDescription.trim() : null;
  const workDescriptions = workDesc ? splitWorkDescriptions(workDesc) : [];

  const lookupKeys = new Set<string>();
  if (userId) {
    lookupKeys.add(userId);
    lookupKeys.add(userId.toLowerCase());
  }
  if (userName) {
    lookupKeys.add(userName);
    lookupKeys.add(userName.toLowerCase());
  }
  if (typeof session.sessionId === 'string' && session.sessionId.trim()) {
    lookupKeys.add(session.sessionId.trim());
  }
  if (typeof session.uniqueKey === 'string' && session.uniqueKey.trim()) {
    lookupKeys.add(session.uniqueKey.trim());
  }

  const dateValue = session.date ?? stamp.iso.slice(0, 10);

  const rawFields: Record<string, unknown> = {
    [LOG_FIELDS.timestamp]: stamp.iso,
    [LOG_FIELDS.type]: type,
    date: dateValue,
    [LOG_FIELDS.siteName]: session.siteName ?? null,
    [LOG_FIELDS.workDescription]: workDesc ?? null,
    [LOG_FIELDS.workType]: workDesc ?? null,
    status: session.status ?? null,
    sessionId: session.sessionId ?? null,
    uniqueKey: session.uniqueKey ?? null,
    durationMin: session.durationMin ?? null,
  };

  if (userId) {
    rawFields[LOG_FIELDS.user] = [userId];
  }
  if (userName) {
    rawFields[LOG_FIELDS.userName] = userName;
    rawFields[LOG_FIELDS.username] = userName;
    rawFields[LOG_FIELDS.userNameFromUser] = userName;
    rawFields[LOG_FIELDS.nameFromUser] = userName;
  }
  if (machineId) {
    rawFields[LOG_FIELDS.machine] = [machineId];
    rawFields[LOG_FIELDS.machineId] = machineId;
    rawFields[LOG_FIELDS.machineid] = machineId;
    rawFields[LOG_FIELDS.machineIdFromMachine] = machineId;
    rawFields[LOG_FIELDS.machineidFromMachine] = machineId;
  }
  if (machineName) {
    rawFields[LOG_FIELDS.machineName] = machineName;
    rawFields[LOG_FIELDS.machinename] = machineName;
    rawFields[LOG_FIELDS.machineNameFromMachine] = machineName;
    rawFields[LOG_FIELDS.machinenameFromMachine] = machineName;
  }
  if (session.siteName) {
    rawFields[LOG_FIELDS.site] = [session.siteName];
  }

  return {
    id: `${session.id}-${suffix}`,
    type,
    timestamp: stamp.iso,
    timestampMs: stamp.ms,
    userId,
    userName,
    userLookupKeys: Array.from(lookupKeys),
    machineId,
    machineName,
    siteId: null,
    siteName: session.siteName ?? null,
    workType: workDesc ?? null,
    workDescriptions,
    note: null,
    rawFields,
  };
}

function expandSessionRecord(session: SessionRecord): NormalizedLog[] {
  const logs: NormalizedLog[] = [];
  const startStamp = parseSessionTimestamp(session.start ?? session.inLog);
  if (startStamp) {
    logs.push(createNormalizedLogFromSession(session, 'IN', startStamp, 'in'));
  }

  const status = typeof session.status === 'string' ? session.status.toLowerCase() : '';
  const isOpen = status === 'open' || !session.end;

  if (!isOpen) {
    let endStamp = parseSessionTimestamp(session.end ?? session.outLog);
    if (!endStamp && startStamp) {
      const duration = asNumber(session.durationMin);
      if (duration !== null) {
        const endMs = startStamp.ms + duration * 60000;
        endStamp = { iso: new Date(endMs).toISOString(), ms: endMs };
      }
    }
    if (endStamp && (!startStamp || endStamp.ms > startStamp.ms)) {
      logs.push(createNormalizedLogFromSession(session, 'OUT', endStamp, 'out'));
    }
  }

  return logs;
}

export async function getLogsBetween(params: { from: Date; to: Date }): Promise<NormalizedLog[]> {
  const { from, to } = params;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) {
    return [];
  }

  const startDate = formatJstDate(fromMs);
  const endDate = formatJstDate(toMs - 1);

  const sessions = await listSessions({
    dateFrom: startDate,
    dateTo: endDate,
    pageSize: AIRTABLE_PAGE_SIZE,
  });

  const logs = sessions
    .flatMap((session) => expandSessionRecord(session))
    .filter((log) => log.timestampMs >= fromMs && log.timestampMs < toMs);

  if (logs.length === 0) {
    return [];
  }

  const usersMap = await getUsersMap();
  const sorted = logs.sort((a, b) => a.timestampMs - b.timestampMs);

  return sorted.map((log) => {
    const candidates = new Set<string>();
    if (log.userId) {
      candidates.add(log.userId);
      candidates.add(log.userId.toLowerCase());
    }
    for (const key of log.userLookupKeys) {
      if (!key) continue;
      const value = String(key);
      candidates.add(value);
      candidates.add(value.toLowerCase());
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
