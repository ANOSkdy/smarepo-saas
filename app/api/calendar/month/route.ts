import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getLogsBetween, summariseMonth } from '@/lib/airtable/logs';

export const runtime = 'nodejs';

function resolveMonthRange(year: number, month: number) {
  const startUtc = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const endUtc = new Date(Date.UTC(nextMonth.year, nextMonth.month - 1, 1, -9, 0, 0));
  return { from: startUtc, to: endUtc };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const yearValue = searchParams.get('year');
  const monthValue = searchParams.get('month');
  const year = yearValue ? Number.parseInt(yearValue, 10) : NaN;
  const month = monthValue ? Number.parseInt(monthValue, 10) : NaN;

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ message: 'invalid params' }, { status: 400 });
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
    }

    const range = resolveMonthRange(year, month);
    const logs = await getLogsBetween(range);
    const days = summariseMonth(logs);
    return NextResponse.json({ year, month, days: days ?? [] });
  } catch (error) {
    console.error('[calendar][month] error', error);
    return NextResponse.json({ message: 'calendar fetch failed' }, { status: 500 });
  }
}
