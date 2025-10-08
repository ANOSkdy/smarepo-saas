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

function normalizeMachineId(
  value: string | readonly string[] | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeMachineId(entry);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') {
            const normalized = normalizeMachineId(item);
            if (normalized) {
              return normalized;
            }
          }
        }
      }
    } catch {
      // ignore JSON parse errors and fall back to raw string handling
    }
  }
  const [first] = trimmed.split(',');
  const normalized = first.trim();
  return normalized.length > 0 ? normalized : null;
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
    const normalizedSessions = sessions.map((session) => ({
      ...session,
      userName: session.userName ?? '未登録ユーザー',
      machineId: normalizeMachineId(session.machineId),
    }));
    return NextResponse.json({ date, sessions: normalizedSessions });
  } catch (error) {
    console.error('[calendar][day] failed to fetch day detail', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
