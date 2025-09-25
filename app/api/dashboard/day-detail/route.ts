import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionsByDay } from '@/lib/airtable/sessions';

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
    const date = searchParams.get('date');
    if (!date) {
      return errorResponse('MISSING_DATE', 400);
    }

    const data = await getSessionsByDay(date);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[dashboard/day-detail] failed to fetch', error);
    if (error instanceof Error && error.message === 'Invalid date format') {
      return errorResponse('INVALID_DATE', 400);
    }
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
