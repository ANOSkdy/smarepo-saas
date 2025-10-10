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

function normalizeLookupText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeLookupText(entry);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function normalizeMachineId(value: unknown): string | null {
  const trimmed = normalizeLookupText(value);
  if (!trimmed) {
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

    const logById = new Map(logs.map((log) => [log.id, log] as const));
    const userLookupCandidates = [
      'name (from user)',
      'userName (from user)',
      'userName',
      'username',
    ] as const;
    const machineLookupCandidates = [
      'machineId',
      'machineid',
      'machineId (from machine)',
      'machineid (from machine)',
    ] as const;

    const readLookup = (
      fields: Record<string, unknown> | undefined,
      candidates: readonly string[],
      normalizer: (value: unknown) => string | null,
    ): string | null => {
      if (!fields) {
        return null;
      }
      for (const key of candidates) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) {
          continue;
        }
        const normalized = normalizer(fields[key]);
        if (normalized) {
          return normalized;
        }
      }
      return null;
    };

    const sessionsWithLookup = sessions.map((session) => {
      const startLog = logById.get(session.startLogId);
      const endLog = session.endLogId ? logById.get(session.endLogId) : undefined;

      // Logs テーブルの Lookup で解決できる名称のみを利用する
      const userName =
        readLookup(startLog?.rawFields, userLookupCandidates, normalizeLookupText) ??
        readLookup(endLog?.rawFields, userLookupCandidates, normalizeLookupText) ??
        null;

      const machineId =
        readLookup(startLog?.rawFields, machineLookupCandidates, normalizeMachineId) ??
        readLookup(endLog?.rawFields, machineLookupCandidates, normalizeMachineId) ??
        null;

      return {
        ...session,
        userName,
        machineId,
      };
    });

    return NextResponse.json({ date, sessions: sessionsWithLookup });
  } catch (error) {
    console.error('[calendar][day] failed to fetch day detail', error);
    return errorResponse('INTERNAL_ERROR', 500);
  }
}
