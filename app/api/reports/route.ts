import { NextResponse } from 'next/server';

import { getReportRowsByFilters, type ReportFilters } from '@/lib/services/reports';

function parseNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseString(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filters: ReportFilters = {
    user: parseString(searchParams.get('user') ?? searchParams.get('userName')),
    site: parseString(searchParams.get('site')),
    year: parseNumber(searchParams.get('year')),
    month: parseNumber(searchParams.get('month')),
    day: parseNumber(searchParams.get('day')),
  };

  try {
    const result = await getReportRowsByFilters(filters);
    return NextResponse.json({ ok: true, rows: result.rows, options: result.options });
  } catch (error) {
    console.error('GET /api/reports failed', error);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', rows: [], options: { years: [], months: [], days: [], users: [], sites: [] } },
      { status: 500 },
    );
  }
}
