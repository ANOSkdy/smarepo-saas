import { NextRequest } from 'next/server';
import { buildAndFormula, listRecords } from '../../../../src/lib/airtable/client';

export const runtime = 'nodejs';

const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';

type OptionsFields = {
  sitename?: string;
  username?: string;
  machinename?: string;
};

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

function normalizeAndSort(values: Array<string | undefined>): string[] {
  const set = new Set<string>();
  values.forEach((value) => {
    const trimmed = value?.trim();
    if (trimmed) {
      set.add(trimmed);
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
}

export async function GET(request: NextRequest): Promise<Response> {
  let year: number;
  let month: number;
  try {
    const url = request.nextUrl;
    year = parseNumber(url.searchParams.get('year'), 'year');
    month = parseNumber(url.searchParams.get('month'), 'month');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid parameters';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  try {
    const records = await listRecords<OptionsFields>({
      table: REPORT_INDEX_TABLE,
      filterByFormula: buildAndFormula({ year, month }),
      fields: ['sitename', 'username', 'machinename'],
      maxRecords: 10000,
    });

    return Response.json({
      ok: true,
      siteNames: normalizeAndSort(records.map((record) => record.fields.sitename)),
      userNames: normalizeAndSort(records.map((record) => record.fields.username)),
      machineNames: normalizeAndSort(records.map((record) => record.fields.machinename)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'options fetch failed';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
