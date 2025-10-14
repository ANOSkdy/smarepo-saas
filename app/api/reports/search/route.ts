import { NextRequest } from 'next/server';
import { buildSessionReport, getLogsBetween } from '@/lib/airtable/logs';

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

function resolveMonthRange(year: number, month: number) {
  const startUtc = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const endUtc = new Date(Date.UTC(nextMonth.year, nextMonth.month - 1, 1, -9, 0, 0));
  return { from: startUtc, to: endUtc };
}

function normalizeQuery(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function matchesFilter(value: string | null, query?: string): boolean {
  if (!query) {
    return true;
  }
  if (!value) {
    return false;
  }
  return value.toLocaleLowerCase('ja').includes(query.toLocaleLowerCase('ja'));
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
    const range = resolveMonthRange(params.year, params.month);
    const logs = await getLogsBetween(range);
    const rows = buildSessionReport(logs).filter((row) => {
      if (!matchesFilter(row.siteName ?? null, params.sitename)) {
        return false;
      }
      if (!matchesFilter(row.userName, params.username)) {
        return false;
      }
      const machineLabel = row.machineName ?? row.machineId ?? null;
      if (!matchesFilter(machineLabel, params.machinename)) {
        return false;
      }
      return true;
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
