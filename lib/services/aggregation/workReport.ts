import { listSessions, type SessionRecord } from '@/src/lib/data/sessions';
import { findUserByAnyKey, getUsersMap, type UserLookupValue } from '@/lib/airtable/users';
import { normalizeDailyMinutes } from '@/src/lib/timecalc';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type SessionBucket = {
  totalMins: number;
  breakdown: Map<string, number>;
};

type UserBuckets = Map<string, SessionBucket>;

type ReportEntry = {
  userKey: string;
  userName: string;
  days: { day: string; totalMins: number; breakdown: Record<string, number> }[];
  unmatchedCount: number;
};

type ReportWarning = { kind: 'IN' | 'OUT'; recId: string; userKey: string };

function toUtcRangeOfJstMonth(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0, 0));
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1, -9, 0, 0, 0));
  return { startUtcIso: start.toISOString(), endUtcIso: end.toISOString() };
}

function parseSessionDate(session: SessionRecord): string | null {
  if (typeof session.date === 'string' && session.date.trim().length > 0) {
    return session.date.trim();
  }
  if (typeof session.start === 'string') {
    const ms = Date.parse(session.start);
    if (Number.isFinite(ms)) {
      const date = new Date(ms + JST_OFFSET_MS);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

function parseSessionMinutes(session: SessionRecord): number | null {
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

function matchesFilter(value: unknown, expected?: string | number): boolean {
  if (!expected) {
    return true;
  }
  if (value === null || value === undefined) {
    return false;
  }
  const normalized = String(value).trim();
  return normalized === String(expected).trim();
}

function buildBreakdownLabel(session: SessionRecord): string {
  const site = typeof session.siteName === 'string' && session.siteName.trim().length > 0 ? session.siteName.trim() : '-';
  const machineId = session.machineId ?? session.machine;
  const machine = machineId !== null && machineId !== undefined ? String(machineId).trim() : session.machineName?.trim();
  const machineLabel = machine && machine.length > 0 ? machine : '-';
  return `${site} / ${machineLabel}`;
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

  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const dateTo = new Date(Date.UTC(year, month, 0, 0, 0, 0));
  const endDate = `${dateTo.getUTCFullYear()}-${String(dateTo.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dateTo.getUTCDate(),
  ).padStart(2, '0')}`;

  const sessions = await listSessions({ dateFrom, dateTo: endDate, status: 'close' });

  let usersMap = new Map<string, UserLookupValue>();
  if (sessions.length > 0) {
    try {
      usersMap = await getUsersMap();
    } catch (error) {
      console.warn('[work-report] failed to load users map', error);
    }
  }

  const userBuckets = new Map<string, UserBuckets>();
  const displayNameMap = new Map<string, string>();

  const toUserText = (raw: unknown): string => {
    if (typeof raw === 'string') {
      return raw.trim();
    }
    if (typeof raw === 'number') {
      return String(raw);
    }
    return '';
  };

  for (const session of sessions) {
    const date = parseSessionDate(session);
    if (!date) {
      continue;
    }
    const minutes = parseSessionMinutes(session);
    if (minutes === null || minutes <= 0) {
      continue;
    }
    if (!matchesFilter(session.siteName, siteName)) {
      continue;
    }
    if (!matchesFilter(session.machineId ?? session.machine, machineId)) {
      continue;
    }
    const rawUser = session.user;
    const fallbackUser = toUserText(rawUser);
    const resolvedUserKey = fallbackUser || 'unknown-user';
    if (userKey && resolvedUserKey !== userKey) {
      continue;
    }

    const matched = findUserByAnyKey(usersMap, rawUser);
    const displayName = matched?.name ?? (fallbackUser || '未登録ユーザー');
    if (!displayNameMap.has(resolvedUserKey)) {
      displayNameMap.set(resolvedUserKey, displayName);
    }

    const buckets = userBuckets.get(resolvedUserKey) ?? new Map<string, SessionBucket>();
    const bucket = buckets.get(date) ?? { totalMins: 0, breakdown: new Map<string, number>() };
    bucket.totalMins += minutes;
    const label = buildBreakdownLabel(session);
    bucket.breakdown.set(label, (bucket.breakdown.get(label) ?? 0) + minutes);
    buckets.set(date, bucket);
    userBuckets.set(resolvedUserKey, buckets);
  }

  const result: ReportEntry[] = [];
  for (const [user, buckets] of userBuckets) {
    const days = Array.from(buckets.entries())
      .map(([day, value]) => ({
        day,
        totalMins: normalizeDailyMinutes(value.totalMins),
        breakdown: Object.fromEntries(value.breakdown.entries()),
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const userName = displayNameMap.get(user) ?? (user === 'unknown-user' ? '未登録ユーザー' : user);
    result.push({ userKey: user, userName, days, unmatchedCount: 0 });
  }

  result.sort((a, b) => {
    const nameCompare = a.userName.localeCompare(b.userName, 'ja');
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return a.userKey.localeCompare(b.userKey, 'ja');
  });

  const warnings: ReportWarning[] = [];

  return { range: { startUtcIso, endUtcIso }, result, warnings };
}
