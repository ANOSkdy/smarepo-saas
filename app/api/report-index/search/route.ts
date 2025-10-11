import { NextRequest } from 'next/server';
import { buildAndFormula, listRecords } from '../../../../src/lib/airtable/client';

export const runtime = 'nodejs';

type SearchParams = {
  year: number;
  month: number;
  siteId?: string;
  userId?: string;
  machineId?: string;
};

type ReportIndexRecord = {
  date: string;
  userId: string;
  username?: string;
  siteId: string;
  sitename?: string;
  machineId: string;
  machinename?: string;
  workdescription: string;
  hours: number;
  isComplete?: boolean;
};

const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';

function parseNumber(value: string | null, name: string): number {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function parseSearchParams(request: NextRequest): SearchParams {
  const url = request.nextUrl;
  const year = parseNumber(url.searchParams.get('year'), 'year');
  const month = parseNumber(url.searchParams.get('month'), 'month');
  if (month < 1 || month > 12) {
    throw new Error('month must be between 1 and 12');
  }
  const siteId = url.searchParams.get('siteId')?.trim();
  const userId = url.searchParams.get('userId')?.trim();
  const machineId = url.searchParams.get('machineId')?.trim();
  return {
    year,
    month,
    siteId: siteId ? siteId : undefined,
    userId: userId ? userId : undefined,
    machineId: machineId ? machineId : undefined,
  };
}

function buildFilterFormula(params: SearchParams): string {
  const baseConditions: Record<string, string | number> = {
    year: params.year,
    month: params.month,
  };
  if (params.siteId) {
    baseConditions.siteId = params.siteId;
  }
  if (params.userId) {
    baseConditions.userId = params.userId;
  }
  if (params.machineId) {
    baseConditions.machineId = params.machineId;
  }
  return buildAndFormula(baseConditions);
}

export async function GET(request: NextRequest): Promise<Response> {
  let parsed: SearchParams;
  try {
    parsed = parseSearchParams(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid parameters';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  try {
    const records = await listRecords<ReportIndexRecord>({
      table: REPORT_INDEX_TABLE,
      filterByFormula: buildFilterFormula(parsed),
      fields: [
        'date',
        'userId',
        'username',
        'siteId',
        'sitename',
        'machineId',
        'machinename',
        'workdescription',
        'hours',
        'isComplete',
      ],
      sort: [
        { field: 'sitename', direction: 'asc' },
        { field: 'username', direction: 'asc' },
        { field: 'date', direction: 'asc' },
      ],
    });

    return Response.json({
      ok: true,
      records: records.map((record) => ({
        id: record.id,
        date: record.fields.date,
        userId: record.fields.userId,
        username: record.fields.username ?? '',
        siteId: record.fields.siteId,
        sitename: record.fields.sitename ?? '',
        machineId: record.fields.machineId,
        machinename: record.fields.machinename ?? '',
        workdescription: record.fields.workdescription,
        hours: record.fields.hours,
        isComplete: record.fields.isComplete ?? true,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'search failed';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
