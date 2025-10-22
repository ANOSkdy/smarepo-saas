export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sitesTable } from '@/lib/airtable';
import { findUserByAnyKey, getUsersMap, type UserLookupValue } from '@/lib/airtable/users';
import { listSessions, type SessionRecord } from '@/src/lib/data/sessions';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';
import type { SiteFields } from '@/types';

const DOW = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatYmd(year: number, month: number, day: number) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
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

function toWorkDescription(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return '（未設定）';
}

function toUserText(raw: unknown): string {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const text = toUserText(item);
      if (text) {
        return text;
      }
    }
    return '';
  }
  if (raw && typeof raw === 'object') {
    const maybeId = (raw as { id?: unknown }).id;
    if (maybeId) {
      return toUserText(maybeId);
    }
  }
  if (typeof raw === 'string') {
    return raw.trim();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return '';
}

function resolveUserDisplay(session: SessionRecord, usersMap: Map<string, UserLookupValue>) {
  const raw = session.user;
  const fallback = toUserText(raw);
  const matched = findUserByAnyKey(usersMap, raw);
  if (matched) {
    const name = matched.name || (fallback || '不明ユーザー');
    return { name, userRecId: matched.recordId };
  }
  if (fallback && !/^rec[a-z0-9]+$/i.test(fallback)) {
    return { name: fallback, userRecId: undefined };
  }
  return { name: '不明ユーザー', userRecId: undefined };
}

export type ReportColumn = {
  key: string;
  userRecId?: string;
  userName: string;
  workDescription: string;
};

export type DayRow = {
  date: string;
  day: number;
  dow: string;
  values: number[];
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year'));
  const month = Number(searchParams.get('month'));
  const siteId = searchParams.get('siteId') ?? '';
  const workFilters = searchParams.getAll('work').filter(Boolean);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !siteId) {
    return NextResponse.json({ error: 'year, month, siteId are required' }, { status: 400 });
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const startYmd = formatYmd(year, month, 1);
  const endYmd = formatYmd(year, month, daysInMonth);

  let siteName = '';
  let client = '';
  try {
    const siteRecord = await sitesTable.find(siteId);
    const fields = siteRecord?.fields as SiteFields | undefined;
    if (fields) {
      siteName = fields.name ?? '';
      client = fields.client ?? '';
    }
  } catch (error) {
    console.warn('[reports][sites] failed to load site', error);
  }

  const workSet = new Set(workFilters);

  let sessions: SessionRecord[] = [];
  try {
    sessions = await listSessions({ dateFrom: startYmd, dateTo: endYmd, status: 'close' });
  } catch (error) {
    console.error('[reports][sites] failed to load sessions', error);
    return NextResponse.json({ error: 'FAILED_TO_LOAD_SESSIONS' }, { status: 500 });
  }

  const normalizedSite = siteName.trim();
  const filteredSessions = sessions.filter((session) => {
    const sessionSite = typeof session.siteName === 'string' ? session.siteName.trim() : '';
    if (normalizedSite) {
      if (!sessionSite || sessionSite !== normalizedSite) {
        return false;
      }
    }
    if (workSet.size > 0) {
      if (typeof session.workDescription !== 'string') {
        return false;
      }
      const trimmed = session.workDescription.trim();
      if (!trimmed || !workSet.has(trimmed)) {
        return false;
      }
    }
    return true;
  });

  let usersMap = new Map<string, UserLookupValue>();
  if (filteredSessions.length > 0) {
    try {
      usersMap = await getUsersMap();
    } catch (error) {
      console.warn('[reports][sites] failed to resolve users', error);
    }
  }

  const columnMap = new Map<string, ReportColumn>();
  const dailyMinutes = new Map<string, Map<string, number>>();

  for (const sessionRecord of filteredSessions) {
    const date = typeof sessionRecord.date === 'string' ? sessionRecord.date : null;
    if (!date) {
      continue;
    }
    const minutes = parseSessionMinutes(sessionRecord);
    if (minutes === null || minutes <= 0) {
      continue;
    }
    const { name, userRecId } = resolveUserDisplay(sessionRecord, usersMap);
    const workDescription = toWorkDescription(sessionRecord.workDescription);
    const columnKey = `${name}__${workDescription}`;
    if (!columnMap.has(columnKey)) {
      columnMap.set(columnKey, { key: columnKey, userRecId, userName: name, workDescription });
    }
    const mapForDay = dailyMinutes.get(date) ?? new Map<string, number>();
    mapForDay.set(columnKey, (mapForDay.get(columnKey) ?? 0) + minutes);
    dailyMinutes.set(date, mapForDay);
  }

  const columns = Array.from(columnMap.values()).sort((a, b) => {
    if (a.userName !== b.userName) {
      return a.userName.localeCompare(b.userName, 'ja');
    }
    return a.workDescription.localeCompare(b.workDescription, 'ja');
  });

  const days: DayRow[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = formatYmd(year, month, day);
    const dow = DOW[new Date(`${date}T00:00:00+09:00`).getDay()];
    const minutesForDay = dailyMinutes.get(date) ?? new Map();
    const values = columns.map((column) => {
      const minutes = minutesForDay.get(column.key) ?? 0;
      if (minutes <= 0) {
        return 0;
      }
      return applyTimeCalcV2FromMinutes(minutes).hours;
    });
    days.push({ date, day, dow, values });
  }

  return NextResponse.json({
    year,
    month,
    site: { id: siteId, name: siteName, client },
    works: workFilters,
    columns,
    days,
  });
}
