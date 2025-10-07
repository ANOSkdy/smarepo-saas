import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildDayDetail, getLogsBetween, resolveMachineIdForUserOnDate } from '@/lib/airtable/logs';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function formatJstDateFromMs(timestampMs: number) {
  return new Date(timestampMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

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
    const fallbackTargets = new Map<string, { userId: string; date: string }>();

    for (const log of logs) {
      if (log.machineId || !log.userId) {
        continue;
      }
      const dateKey = formatJstDateFromMs(log.timestampMs);
      const cacheKey = `${log.userId}:${dateKey}`;
      if (!fallbackTargets.has(cacheKey)) {
        fallbackTargets.set(cacheKey, { userId: log.userId, date: dateKey });
      }
    }

    const fallbackResults = new Map<string, string | null>();
    for (const [cacheKey, target] of fallbackTargets) {
      fallbackResults.set(cacheKey, await resolveMachineIdForUserOnDate(target.userId, target.date));
    }

    const enrichedLogs = logs.map((log) => {
      if (log.machineId || !log.userId) {
        return log;
      }
      const dateKey = formatJstDateFromMs(log.timestampMs);
      const cacheKey = `${log.userId}:${dateKey}`;
      const resolved = fallbackResults.get(cacheKey);
      if (!resolved) {
        return log;
      }
      return { ...log, machineId: resolved };
    });

    const { sessions } = buildDayDetail(enrichedLogs);
    return NextResponse.json({ date, sessions });
  } catch (error) {
    console.error('[calendar][day] failed to fetch day detail', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
