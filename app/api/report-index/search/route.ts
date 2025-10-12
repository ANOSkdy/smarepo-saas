import { NextRequest } from 'next/server';
import {
  listRecords,
  type AirtableRecord,
} from '../../../../src/lib/airtable/client';

export const runtime = 'nodejs';

type SearchParams = {
  year: number;
  month: number;
  sitename?: string;
  username?: string;
  machinename?: string;
};

type ReportIndexRecord = {
  date?: string;
  username?: string;
  sitename?: string;
  machinename?: string;
  workdescription?: string;
  hours?: number;
};

type CompletedReportIndexRecord = ReportIndexRecord & {
  date: string;
  workdescription: string;
  hours: number;
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
  const sitename = url.searchParams.get('sitename')?.trim();
  const username = url.searchParams.get('username')?.trim();
  const machinename = url.searchParams.get('machinename')?.trim();
  return {
    year,
    month,
    sitename: sitename ? sitename : undefined,
    username: username ? username : undefined,
    machinename: machinename ? machinename : undefined,
  };
}

function escapeFormulaValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

function buildFilterFormula(params: SearchParams): string {
  const clauses = [`({year}=${params.year})`, `({month}=${params.month})`];
  if (params.sitename) {
    clauses.push(
      `SEARCH(LOWER('${escapeFormulaValue(params.sitename)}'), LOWER({sitename}&''))`
    );
  }
  if (params.username) {
    clauses.push(
      `SEARCH(LOWER('${escapeFormulaValue(params.username)}'), LOWER({username}&''))`
    );
  }
  if (params.machinename) {
    clauses.push(
      `SEARCH(LOWER('${escapeFormulaValue(params.machinename)}'), LOWER({machinename}&''))`
    );
  }
  return `AND(${clauses.join(',')})`;
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
        'username',
        'sitename',
        'machinename',
        'workdescription',
        'hours',
      ],
      sort: [
        { field: 'sitename', direction: 'asc' },
        { field: 'username', direction: 'asc' },
        { field: 'machinename', direction: 'asc' },
        { field: 'date', direction: 'asc' },
      ],
    });

    return Response.json({
      ok: true,
      records: records.filter(isCompletedRecord).map((record) => ({
        id: record.id,
        date: record.fields.date,
        username: record.fields.username ?? '',
        sitename: record.fields.sitename ?? '',
        machinename: record.fields.machinename ?? '',
        workdescription: record.fields.workdescription,
        hours: record.fields.hours,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'search failed';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
function isCompletedRecord(
  record: AirtableRecord<ReportIndexRecord>
): record is AirtableRecord<CompletedReportIndexRecord> {
  const fields = record.fields;
  return (
    typeof fields.date === 'string' &&
    typeof fields.workdescription === 'string' &&
    typeof fields.hours === 'number'
  );
}
