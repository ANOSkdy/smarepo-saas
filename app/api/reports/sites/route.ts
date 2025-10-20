export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logsTable, sitesTable, usersTable } from '@/lib/airtable';
import { resolveUserIdentity, resolveUserKey } from '@/lib/services/userIdentity';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';
import type { LogFields, SiteFields } from '@/types';

const DOW = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatYmd(year: number, month: number, day: number) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function parseTimestampMs(value: unknown) {
  if (typeof value !== 'string') {
    return Number.NaN;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? Number.NaN : ms;
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

  const filterByFormula = `AND({date} >= "${startYmd}", {date} <= "${endYmd}")`;
  const logRecords = await logsTable
    .select({
      filterByFormula,
      pageSize: 100,
    })
    .all();

  const userIds = new Set<string>();
  for (const record of logRecords) {
    const identity = resolveUserIdentity(record);
    if (identity.userRecId) {
      userIds.add(identity.userRecId);
    }
  }

  let usersById = new Map<string, string>();
  if (userIds.size > 0) {
    const conditions = Array.from(userIds)
      .map((id) => `RECORD_ID() = '${id}'`)
      .join(',');
    try {
      const records = await usersTable
        .select({
          filterByFormula: `OR(${conditions})`,
          fields: ['name'],
          pageSize: 100,
        })
        .all();
      usersById = new Map(records.map((record) => [record.id, record.fields.name ?? '']));
    } catch (error) {
      console.warn('[reports][sites] failed to resolve users', error);
    }
  }

  const workSet = new Set(workFilters);
  const filteredLogs = logRecords.filter((record) => {
    const fields = record.fields as LogFields & {
      site?: readonly string[];
      userId?: string;
    };
    const hitSite =
      (Array.isArray(fields.site) && fields.site.includes(siteId)) ||
      (!!siteName && fields.siteName === siteName);
    if (!hitSite) {
      return false;
    }
    if (workSet.size === 0) {
      return true;
    }
    return fields.workDescription ? workSet.has(fields.workDescription) : false;
  });

  const columnMap = new Map<string, ReportColumn>();
  type LogRecord = (typeof filteredLogs)[number];

  for (const record of filteredLogs) {
    const fields = record.fields as LogFields;
    const identity = resolveUserIdentity(record);
    const workDescription = fields.workDescription || '（未設定）';
    const userName =
      (identity.userRecId && usersById.get(identity.userRecId)) ||
      identity.displayName ||
      identity.username ||
      '不明ユーザー';
    const userKey = resolveUserKey(record);
    const key = `${userKey}__${workDescription}`;
    if (!columnMap.has(key)) {
      columnMap.set(key, { key, userRecId: identity.userRecId, userName, workDescription });
    }
  }

  const columns = Array.from(columnMap.values()).sort((a, b) => {
    if (a.userName !== b.userName) {
      return a.userName.localeCompare(b.userName, 'ja');
    }
    return a.workDescription.localeCompare(b.workDescription, 'ja');
  });

  const groups = new Map<string, LogRecord[]>();

  for (const record of filteredLogs) {
    const fields = record.fields as LogFields;
    const date = fields.date;
    if (!date) {
      continue;
    }
    const workDescription = fields.workDescription || '（未設定）';
    const userKey = resolveUserKey(record);
    const columnKey = `${userKey}__${workDescription}`;
    const groupKey = `${date}|${columnKey}`;
    const queue = groups.get(groupKey) ?? [];
    queue.push(record);
    groups.set(groupKey, queue);
  }

  const hoursByKey = new Map<string, number>();

  for (const [groupKey, records] of groups.entries()) {
    records.sort((a, b) => {
      const ta = parseTimestampMs(a.fields.timestamp);
      const tb = parseTimestampMs(b.fields.timestamp);
      return ta - tb;
    });
    let lastIn: number | null = null;
    let totalMinutes = 0;
    for (const record of records) {
      const type = record.fields.type;
      const timestampMs = parseTimestampMs(record.fields.timestamp);
      if (!Number.isFinite(timestampMs)) {
        continue;
      }
      if (type === 'IN') {
        lastIn = timestampMs;
      } else if (type === 'OUT' && lastIn !== null) {
        const diffMinutes = Math.round((timestampMs - lastIn) / 60000);
        if (diffMinutes > 0 && diffMinutes < 24 * 60) {
          totalMinutes += diffMinutes;
        }
        lastIn = null;
      }
    }
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
    works: workFilters,
    columns,
    days,
  });
}
