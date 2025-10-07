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
  try {
    const { searchParams } = new URL(req.url);
    const yearValue = searchParams.get('year');
    const monthValue = searchParams.get('month');
    const yearRaw = yearValue ? Number.parseInt(yearValue, 10) : NaN;
    const monthRaw = monthValue ? Number.parseInt(monthValue, 10) : NaN;

    const year = Number.isFinite(yearRaw) ? yearRaw : null;
    const month = Number.isFinite(monthRaw) ? monthRaw : null;

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ year, month, days: [] });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ year, month, days: [] });
    }

    try {
      const range = resolveMonthRange(year, month);
      const logs = await getLogsBetween(range);
      const days = summariseMonth(logs);
      return NextResponse.json({ year, month, days });
    } catch (error) {
      console.error('[calendar][month] failed to build summary', error);
      return NextResponse.json({ year, month, days: [] });
    }
  } catch (error) {
    console.error('[calendar][month] unexpected error', error);
    return NextResponse.json({ year: null, month: null, days: [] });
  }
}
