import { NextResponse } from 'next/server';
import { getWorkReportByMonth } from '@/lib/services/aggregation/workReport';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');
  const userKey = searchParams.get('user') || undefined;
  const siteName = searchParams.get('site') || undefined;
  const machineId = searchParams.get('machine') || undefined;

  const year = yearParam ? Number(yearParam) : NaN;
  const month = monthParam ? Number(monthParam) : NaN;

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return NextResponse.json({ error: 'year and month are required' }, { status: 400 });
  }

  try {
    const data = await getWorkReportByMonth({
      year,
      month,
      userKey,
      siteName,
      machineId,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[/api/reports/work] error', error);
    const message = error instanceof Error ? error.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
