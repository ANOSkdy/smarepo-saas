import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionsByMonth } from '@/lib/airtable/sessions';

export const runtime = 'nodejs';

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code, code }, { status });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 401);
  }

  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const year = yearParam ? Number.parseInt(yearParam, 10) : NaN;
    const month = monthParam ? Number.parseInt(monthParam, 10) : NaN;

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return errorResponse('INVALID_RANGE', 400);
    }

    const data = await getSessionsByMonth({ year, month });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[dashboard/calendar] failed to fetch', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
