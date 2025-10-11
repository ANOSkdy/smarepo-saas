import { NextRequest } from 'next/server';
import type { Record as AirtableRecord } from 'airtable';
import { logsTable } from '@/lib/airtable';
import type { LogFields } from '@/types';
import { LOG_FIELDS } from '@/lib/airtable/schema';
import { upsertByCompositeKey } from '@/src/lib/airtable/upsert';

export const runtime = 'nodejs';

const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || 'Sessions';
const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';

type OutToSessionRequest = {
  outLogId: string;
};

type UpsertFields = {
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
};

function parseRequestBody(body: unknown): OutToSessionRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('invalid payload');
  }
  const value = body as Record<string, unknown>;
  const rawId = value.outLogId;
  if (typeof rawId !== 'string' || rawId.trim() === '') {
    throw new Error('outLogId is required');
  }
  return { outLogId: rawId.trim() };
}

function escapeFormulaValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry)).filter((entry) => entry.length > 0);
}

function firstOrNull(values: readonly string[]): string | null {
  return values.length > 0 ? values[0] : null;
}

function ensureString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function preferString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return '';
}

function parseDateParts(date: string): {
  year: number;
  month: number;
  day: number;
  weekday: string;
} {
  const parts = date.split('-');
  if (parts.length !== 3) {
    throw new Error('invalid date');
  }
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  if (!year || !month || !day) {
    throw new Error('invalid date');
  }
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(`${date}T00:00:00+09:00`));
  return { year, month, day, weekday };
}

function calculateHours(clockInAt: string, clockOutAt: string): number {
  const clockIn = new Date(clockInAt);
  const clockOut = new Date(clockOutAt);
  const diffMs = clockOut.getTime() - clockIn.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    throw new Error('invalid duration');
  }
  return Number((diffMs / 3_600_000).toFixed(2));
}

function buildInLogFormula(params: {
  timestamp: string;
  date: string;
  userId: string | null;
  siteId: string | null;
  machineId: string | null;
  workdescription: string;
}): string {
  const clauses = [`{${LOG_FIELDS.type}}='IN'`, `{date}='${escapeFormulaValue(params.date)}'`];
  if (params.userId) {
    clauses.push(
      `FIND('${escapeFormulaValue(params.userId)}', ARRAYJOIN({${LOG_FIELDS.user}}))>0`,
    );
  }
  if (params.siteId) {
    clauses.push(
      `FIND('${escapeFormulaValue(params.siteId)}', ARRAYJOIN({${LOG_FIELDS.site}}))>0`,
    );
  }
  if (params.machineId) {
    clauses.push(
      `FIND('${escapeFormulaValue(params.machineId)}', ARRAYJOIN({${LOG_FIELDS.machine}}))>0`,
    );
  }
  if (params.workdescription.trim().length > 0) {
    clauses.push(`{${LOG_FIELDS.workDescription}}='${escapeFormulaValue(params.workdescription)}'`);
  }
  clauses.push(`{${LOG_FIELDS.timestamp}}<'${escapeFormulaValue(params.timestamp)}'`);
  return clauses.length === 1 ? clauses[0] : `AND(${clauses.join(',')})`;
}

function createUpsertPayload(params: {
  date: string;
  userId: string;
  siteId: string;
  machineId: string;
  workdescription: string;
  clockInAt: string;
  clockOutAt: string;
  username: string;
  sitename: string;
  machinename: string;
  hours: number;
}): UpsertFields {
  const { year, month, day, weekday } = parseDateParts(params.date);
  return {
    date: params.date,
    year,
    month,
    day,
    weekday,
    userId: params.userId,
    username: params.username,
    siteId: params.siteId,
    sitename: params.sitename,
    machineId: params.machineId,
    machinename: params.machinename,
    workdescription: params.workdescription,
    clockInAt: params.clockInAt,
    clockOutAt: params.clockOutAt,
    hours: params.hours,
    isComplete: true,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let payload: OutToSessionRequest;
  try {
    payload = parseRequestBody(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid payload';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  let outRecord: AirtableRecord<LogFields>;
  try {
    outRecord = await logsTable.find(payload.outLogId);
  } catch (error) {
    console.error('[out-to-session][from-logs] failed to load OUT log', error);
    return Response.json({ ok: false, message: 'out log not found' }, { status: 404 });
  }

  const outFields = outRecord.fields as Record<string, unknown>;
  if (outFields[LOG_FIELDS.type] !== 'OUT') {
    return Response.json({ ok: false, message: 'log must be OUT type' }, { status: 400 });
  }

  const timestamp = ensureString(outFields[LOG_FIELDS.timestamp]);
  const date = ensureString(outFields['date']);
  const workdescription = ensureString(outFields[LOG_FIELDS.workDescription]);
  const userId = firstOrNull(toStringArray(outFields[LOG_FIELDS.user]));
  const siteId = firstOrNull(toStringArray(outFields[LOG_FIELDS.site]));
  const machineId = firstOrNull(toStringArray(outFields[LOG_FIELDS.machine]));

  if (!timestamp || !date || !userId || !siteId || !machineId) {
    return Response.json({ ok: false, message: 'missing fields' }, { status: 400 });
  }

  const formula = buildInLogFormula({
    timestamp,
    date,
    userId,
    siteId,
    machineId,
    workdescription,
  });

  let inRecord: AirtableRecord<LogFields> | null = null;
  try {
    const records = await logsTable
      .select({
        filterByFormula: formula,
        sort: [{ field: LOG_FIELDS.timestamp, direction: 'desc' }],
        maxRecords: 1,
      })
      .firstPage();
    if (records.length > 0) {
      [inRecord] = records;
    }
  } catch (error) {
    console.error('[out-to-session][from-logs] failed to search IN logs', error);
    return Response.json({ ok: false, message: 'failed to search IN log' }, { status: 500 });
  }

  if (!inRecord) {
    return Response.json({ ok: false, message: 'IN log not found' }, { status: 200 });
  }

  const inFields = inRecord.fields as Record<string, unknown>;
  const clockInAt = ensureString(inFields[LOG_FIELDS.timestamp]);
  const clockOutAt = timestamp;

  let hours: number;
  try {
    hours = calculateHours(clockInAt, clockOutAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid duration';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  const username = preferString(
    outFields[LOG_FIELDS.userName],
    outFields[LOG_FIELDS.username],
    inFields[LOG_FIELDS.userName],
  );
  const sitename = preferString(
    outFields[LOG_FIELDS.siteName],
    outFields['sitename'],
    inFields[LOG_FIELDS.siteName],
  );
  const machinename = preferString(
    outFields['machinename'],
    outFields['machineName'],
    inFields['machinename'],
    inFields['machineName'],
  );

  const workdescriptionForSession = workdescription.trim().length
    ? workdescription
    : ensureString(inFields[LOG_FIELDS.workDescription]);

  const upsertPayload = createUpsertPayload({
    date,
    userId,
    siteId,
    machineId,
    workdescription: workdescriptionForSession,
    clockInAt,
    clockOutAt,
    username,
    sitename,
    machinename,
    hours,
  });

  const key = {
    userId,
    siteId,
    machineId,
    date,
    workdescription: workdescriptionForSession,
  };

  try {
    await upsertByCompositeKey<UpsertFields>({
      table: SESSIONS_TABLE,
      key,
      payload: upsertPayload,
    });
    await upsertByCompositeKey<UpsertFields>({
      table: REPORT_INDEX_TABLE,
      key,
      payload: upsertPayload,
    });
  } catch (error) {
    console.error('[out-to-session][from-logs] upsert failed', error);
    return Response.json({ ok: false, message: 'upsert failed' }, { status: 500 });
  }

  return Response.json({ ok: true, hours, key });
}
