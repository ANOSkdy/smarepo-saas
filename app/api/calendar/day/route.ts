import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildDayDetail, getLogsBetween } from '@/lib/airtable/logs';

export const runtime = 'nodejs';

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function resolveDayRange(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const from = new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
  const to = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0));
  return { from, to };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 401);
  }

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    if (!date) {
      return errorResponse('MISSING_DATE', 400);
    }

    const range = resolveDayRange(date);
    if (!range) {
      return errorResponse('INVALID_DATE', 400);
    }

    const logs = await getLogsBetween(range);
    const { sessions } = buildDayDetail(logs);
    return NextResponse.json({ date, sessions });
  } catch (error) {
    console.error('[calendar][day] failed to fetch day detail', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
