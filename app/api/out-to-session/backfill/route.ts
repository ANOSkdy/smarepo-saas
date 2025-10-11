import { setTimeout as delay } from 'node:timers/promises';
import { NextRequest } from 'next/server';
import type { LogFields } from '@/types';
import { LOG_FIELDS, LOGS_TABLE } from '@/lib/airtable/schema';
import { listRecords } from '@/src/lib/airtable/client';

export const runtime = 'nodejs';

type BackfillRequest = {
  from?: string;
  to?: string;
};

type BackfillResult = {
  ok: true;
  processed: number;
  created: number;
  skipped: number;
};

const CALL_DELAY_MS = 100;

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseBody(body: unknown): BackfillRequest {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const record = body as Record<string, unknown>;
  const result: BackfillRequest = {};
  if (typeof record.from === 'string' && isValidDate(record.from)) {
    result.from = record.from;
  }
  if (typeof record.to === 'string' && isValidDate(record.to)) {
    result.to = record.to;
  }
  return result;
}

function escapeFormulaValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

function buildFilterFormula(range: BackfillRequest): string {
  const clauses = [`{${LOG_FIELDS.type}}='OUT'`];
  if (range.from) {
    clauses.push(`{date}>='${escapeFormulaValue(range.from)}'`);
  }
  if (range.to) {
    clauses.push(`{date}<='${escapeFormulaValue(range.to)}'`);
  }
  return clauses.length === 1 ? clauses[0] : `AND(${clauses.join(',')})`;
}

function withinRange(date: string | undefined, range: BackfillRequest): boolean {
  if (!date) {
    return false;
  }
  if (range.from && date < range.from) {
    return false;
  }
  if (range.to && date > range.to) {
    return false;
  }
  return true;
}

async function invokeConversion(baseUrl: string, outLogId: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/out-to-session/from-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outLogId }),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.warn('[backfill] conversion request failed', {
        outLogId,
        status: response.status,
      });
      return false;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return false;
    }
    const data = (await response.json()) as { ok?: boolean } | null;
    return Boolean(data?.ok);
  } catch (error) {
    console.warn('[backfill] conversion request error', { outLogId, error });
    return false;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const range = parseBody(body);
  if (range.from && range.to && range.from > range.to) {
    return Response.json(
      { ok: false, message: 'invalid range' },
      { status: 400 },
    );
  }

  const filterByFormula = buildFilterFormula(range);

  let records: { id: string; fields: LogFields }[];
  try {
    records = await listRecords<LogFields>({
      table: LOGS_TABLE,
      filterByFormula,
      sort: [{ field: LOG_FIELDS.timestamp, direction: 'asc' }],
    });
  } catch (error) {
    console.error('[backfill] failed to list OUT logs', error);
    return Response.json({ ok: false, message: 'failed to load logs' }, { status: 500 });
  }

  const filtered = records.filter((record) =>
    withinRange(record.fields.date, range),
  );

  const baseUrl = request.nextUrl.origin;
  let created = 0;
  let skipped = 0;

  for (const record of filtered) {
    const success = await invokeConversion(baseUrl, record.id);
    if (success) {
      created += 1;
    } else {
      skipped += 1;
    }
    await delay(CALL_DELAY_MS);
  }

  const result: BackfillResult = {
    ok: true,
    processed: filtered.length,
    created,
    skipped,
  };

  return Response.json(result);
}
