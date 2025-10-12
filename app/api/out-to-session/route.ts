import { NextRequest } from 'next/server';
import { upsertByCompositeKey } from '../../../src/lib/airtable/upsert';
import { withRetry } from '@/lib/airtable';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || 'Sessions';
const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';

const JST_OFFSET_MINUTES = 9 * 60;

interface OutToSessionRequest {
  userId: string;
  siteId: string;
  machineId: string;
  workdescription: string;
  clockInAt: string;
  clockOutAt: string;
  username?: string;
  sitename?: string;
  machinename?: string;
}

interface UpsertFields extends Record<string, string | number | boolean> {
  date: string;
  year: number;
  month: number;
  day: number;
  weekday: string;
  userId: string;
  username: string;
  siteId: string;
  sitename: string;
  machineId: string;
  machinename: string;
  workdescription: string;
  clockInAt: string;
  clockOutAt: string;
  hours: number;
  isComplete: boolean;
}

function parseRequestBody(body: unknown): OutToSessionRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('invalid payload');
  }
  const {
    userId,
    siteId,
    machineId,
    workdescription,
    clockInAt,
    clockOutAt,
    username,
    sitename,
    machinename,
  } = body as Record<string, unknown>;

  const requiredStrings: [unknown, string][] = [
    [userId, 'userId'],
    [siteId, 'siteId'],
    [machineId, 'machineId'],
    [workdescription, 'workdescription'],
    [clockInAt, 'clockInAt'],
    [clockOutAt, 'clockOutAt'],
  ];

  requiredStrings.forEach(([value, field]) => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${field} is required`);
    }
  });

  const optionalString = (value: unknown): string | undefined => {
    if (typeof value === 'undefined') return undefined;
    return typeof value === 'string' ? value : undefined;
  };

  return {
    userId: String(userId),
    siteId: String(siteId),
    machineId: String(machineId),
    workdescription: String(workdescription),
    clockInAt: String(clockInAt),
    clockOutAt: String(clockOutAt),
    username: optionalString(username),
    sitename: optionalString(sitename),
    machinename: optionalString(machinename),
  };
}

function getJstDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  dateString: string;
  weekday: string;
} {
  const utcMillis = date.getTime() + JST_OFFSET_MINUTES * 60 * 1000;
  const jst = new Date(utcMillis);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
  return { year, month, day, dateString, weekday };
}

function validateTimeRange(clockInAt: string, clockOutAt: string): {
  clockIn: Date;
  hours: number;
} {
  const clockIn = new Date(clockInAt);
  const clockOut = new Date(clockOutAt);
  if (Number.isNaN(clockIn.getTime()) || Number.isNaN(clockOut.getTime())) {
    throw new Error('invalid datetime');
  }
  const diffMs = clockOut.getTime() - clockIn.getTime();
  if (diffMs <= 0) {
    throw new Error('clockOutAt must be after clockInAt');
  }
  const hours = Number((diffMs / 3_600_000).toFixed(2));
  if (hours <= 0) {
    throw new Error('duration must be positive');
  }
  return { clockIn, hours };
}

export async function POST(request: NextRequest): Promise<Response> {
  let payload: OutToSessionRequest;
  try {
    const json = await request.json();
    payload = parseRequestBody(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  let timing;
  try {
    timing = validateTimeRange(payload.clockInAt, payload.clockOutAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid time range';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  const { clockIn, hours } = timing;

  const { year, month, day, dateString, weekday } = getJstDateParts(clockIn);

  const key = {
    userId: payload.userId,
    siteId: payload.siteId,
    machineId: payload.machineId,
    date: dateString,
    workdescription: payload.workdescription,
  };

  const baseFields: UpsertFields = {
    date: dateString,
    year,
    month,
    day,
    weekday,
    userId: payload.userId,
    username: payload.username ?? '',
    siteId: payload.siteId,
    sitename: payload.sitename ?? '',
    machineId: payload.machineId,
    machinename: payload.machinename ?? '',
    workdescription: payload.workdescription,
    clockInAt: payload.clockInAt,
    clockOutAt: payload.clockOutAt,
    hours,
    isComplete: true,
  };

  try {
    logger.info('out-to-session upsert start', { key });
    const sessionResult = await withRetry(() =>
      upsertByCompositeKey<UpsertFields>({
        table: SESSIONS_TABLE,
        key,
        payload: baseFields,
      })
    );
    const reportResult = await withRetry(() =>
      upsertByCompositeKey<UpsertFields>({
        table: REPORT_INDEX_TABLE,
        key,
        payload: baseFields,
      })
    );
    logger.info('out-to-session upsert completed', {
      key,
      sessionRecordId: sessionResult.id,
      reportRecordId: reportResult.id,
    });
    return Response.json({ ok: true, hours, key });
  } catch (error) {
    logger.error('out-to-session upsert failed', error);
    const message = error instanceof Error ? error.message : 'internal error';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
