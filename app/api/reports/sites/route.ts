export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sitesTable } from '@/lib/airtable';
import { fetchSessionReportRows, type SessionReportRow } from '@/src/lib/sessions-reports';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';
import type { SiteFields } from '@/types';

const DOW = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatYmd(year: number, month: number, day: number) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSameSiteName(a: string, b: string) {
  if (!a || !b) {
    return false;
  }
  return a.trim().localeCompare(b.trim(), 'ja', { sensitivity: 'base' }) === 0;
}

function normalizeMachineIdValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  return null;
}

function resolveSessionUserKey(session: SessionReportRow) {
  if (session.userRecordId) {
    return session.userRecordId;
  }
  if (session.userId != null) {
    return `user:${session.userId}`;
  }
  if (session.userName) {
    return `name:${session.userName}`;
  }
  return session.id;
}

export type ReportColumn = {
  key: string;
  userRecId?: string;
  userName: string;
  workDescription: string;
  machineIds: Array<string | number>;
  machineNames: string[];
};

export type DayRow = {
  date: string;
  day: number;
  dow: string;
  values: number[];
};

type ColumnAccumulator = {
  key: string;
  userRecId?: string;
  userName: string;
  workDescription: string;
  machineIds: Set<string | number>;
  machineNames: Set<string>;
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
  const machineIdsFilter = searchParams
    .getAll('machineIds')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !siteId) {
    return NextResponse.json({ error: 'year, month, siteId are required' }, { status: 400 });
  }

  const daysInMonth = new Date(year, month, 0).getDate();

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

  const machineIdSet = new Set(machineIdsFilter);
  const normalizedSiteName = normalizeText(siteName);
  const sessions = await fetchSessionReportRows({ year, month });

  const columnMap = new Map<string, ColumnAccumulator>();
  const minutesByKey = new Map<string, number>();

  for (const session of sessions) {
    if (!session.isCompleted || !session.date || session.year !== year || session.month !== month) {
      continue;
    }
    const matchesSite =
      (!!session.siteRecordId && session.siteRecordId === siteId) ||
      (!!normalizedSiteName && !!session.siteName && isSameSiteName(session.siteName, normalizedSiteName));
    if (!matchesSite) {
      continue;
    }

    if (machineIdSet.size > 0) {
      const matchesMachine = [session.machineId, session.machineRecordId].some((candidate) => {
        const normalized = normalizeMachineIdValue(candidate);
        return normalized != null && machineIdSet.has(normalized);
      });
      if (!matchesMachine) {
        continue;
      }
    }

    const workDescription = session.workDescription?.trim() || '（未設定）';

    const userName = session.userName?.trim() || '不明ユーザー';
    const userKey = resolveSessionUserKey(session);
    const columnKey = `${userKey}__${workDescription}`;
    if (!columnMap.has(columnKey)) {
      columnMap.set(columnKey, {
        key: columnKey,
        userRecId: session.userRecordId ?? undefined,
        userName,
        workDescription,
        machineIds: new Set(),
        machineNames: new Set(),
      });
    }

    const column = columnMap.get(columnKey);
    if (!column) {
      continue;
    }

    const machineId = session.machineId;
    if (machineId != null) {
      const machineIdText = typeof machineId === 'string' ? machineId.trim() : `${machineId}`.trim();
      if (machineIdText) {
        column.machineIds.add(typeof machineId === 'number' ? machineId : machineIdText);
      }
    }

    const machineName = session.machineName?.trim();
    if (machineName) {
      column.machineNames.add(machineName);
    }

    const rawMinutes =
      session.durationMin ?? (session.hours != null ? Math.round(session.hours * 60) : null);
    const minutes = typeof rawMinutes === 'number' ? Math.round(rawMinutes) : 0;
    if (minutes <= 0 || minutes >= 24 * 60) {
      continue;
    }

    const groupKey = `${session.date}|${columnKey}`;
    minutesByKey.set(groupKey, (minutesByKey.get(groupKey) ?? 0) + minutes);
  }

  const columns = Array.from(columnMap.values())
    .sort((a, b) => {
      if (a.userName !== b.userName) {
        return a.userName.localeCompare(b.userName, 'ja');
      }
      return a.workDescription.localeCompare(b.workDescription, 'ja');
    })
    .map<ReportColumn>((column) => ({
      key: column.key,
      userRecId: column.userRecId,
      userName: column.userName,
      workDescription: column.workDescription,
      machineIds: Array.from(column.machineIds),
      machineNames: Array.from(column.machineNames),
    }));

  const hoursByKey = new Map<string, number>();
  for (const [groupKey, totalMinutes] of minutesByKey.entries()) {
    const { hours } = applyTimeCalcV2FromMinutes(totalMinutes);
    hoursByKey.set(groupKey, hours);
  }

  const days: DayRow[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = formatYmd(year, month, day);
    const dow = DOW[new Date(`${date}T00:00:00+09:00`).getDay()];
    const values = columns.map((column) => hoursByKey.get(`${date}|${column.key}`) ?? 0);
    days.push({ date, day, dow, values });
  }

  return NextResponse.json({
    year,
    month,
    site: { id: siteId, name: siteName, client },
    columns,
    days,
  });
}
