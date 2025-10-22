import { NextRequest } from 'next/server';
import { getSessionReportRows } from '@/src/lib/data/sessions';

export const runtime = 'nodejs';

type SearchParams = {
  year: number;
  month: number;
  sitename?: string;
  username?: string;
  machinename?: string;
};

function parseIntParam(value: string | null, name: string): number {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function resolveMonthBounds(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0));
  const endDate = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(
    lastDay.getUTCDate(),
  ).padStart(2, '0')}`;
  return { from: startDate, to: endDate };
}

function normalizeQuery(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseSearchParams(request: NextRequest): SearchParams {
  const url = request.nextUrl;
  const year = parseIntParam(url.searchParams.get('year'), 'year');
  const month = parseIntParam(url.searchParams.get('month'), 'month');
  if (month < 1 || month > 12) {
    throw new Error('month must be between 1 and 12');
  }
  return {
    year,
    month,
    sitename: normalizeQuery(url.searchParams.get('sitename')),
    username: normalizeQuery(url.searchParams.get('username')),
    machinename: normalizeQuery(url.searchParams.get('machinename')),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  let params: SearchParams;
  try {
    params = parseSearchParams(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid parameters';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  try {
    const range = resolveMonthBounds(params.year, params.month);
    const rows = await getSessionReportRows(range, {
      siteQuery: params.sitename,
      userQuery: params.username,
      machineQuery: params.machinename,
    });

    const records = rows.map((row) => ({
      id: row.id,
      date: row.date,
      username: row.userName,
      sitename: row.siteName ?? '',
      machinename: row.machineName ?? row.machineId ?? '',
      workdescription: row.workDescription ?? '',
      hours: row.hours,
    }));

    return Response.json({ ok: true, records });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'search failed';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
