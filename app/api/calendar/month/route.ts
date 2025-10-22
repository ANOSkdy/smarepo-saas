import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCalendarMonthSummary } from '@/src/lib/data/sessions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const yearValue = searchParams.get('year');
  const monthValue = searchParams.get('month');
  const year = yearValue ? Number.parseInt(yearValue, 10) : NaN;
  const month = monthValue ? Number.parseInt(monthValue, 10) : NaN;

  if (!Number.isFinite(year) || !Number.isFinite(month) || year === 0 || month === 0) {
    const normalizedYear = !Number.isFinite(year) || year === 0 ? null : year;
    const normalizedMonth = !Number.isFinite(month) || month === 0 ? null : month;
    return NextResponse.json({ year: normalizedYear, month: normalizedMonth, days: [] });
  }

  try {
    const summary = await getCalendarMonthSummary({ year, month });
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[calendar][month] error', error);
    return NextResponse.json({ year: null, month: null, days: [] });
  }
}
