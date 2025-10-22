import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCalendarDayDetail } from '@/src/lib/data/sessions';

export const runtime = 'nodejs';

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function isValidDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return false;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  return true;
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

    if (!isValidDate(date)) {
      return errorResponse('INVALID_DATE', 400);
    }

    const detail = await getCalendarDayDetail(date);
    return NextResponse.json(detail);
  } catch (error) {
    console.error('[calendar][day] failed to fetch day detail', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
