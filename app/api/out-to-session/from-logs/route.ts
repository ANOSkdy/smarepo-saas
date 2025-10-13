import { NextResponse } from 'next/server';

import { sessionWorkerCreateFromOutLog } from '@/lib/services/sessionWorker';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    console.warn('[from-logs] invalid json body', {
      error: error instanceof Error ? { name: error.name, message: error.message } : error,
    });
    return NextResponse.json({ ok: false, reason: 'INVALID_JSON' }, { status: 200 });
  }

  const outLogIdRaw = (body as { outLogId?: unknown } | null)?.outLogId;
  if (typeof outLogIdRaw !== 'string' || outLogIdRaw.trim() === '') {
    console.warn('[from-logs] missing outLogId', body);
    return NextResponse.json({ ok: false, reason: 'MISSING_OUT_LOG_ID' }, { status: 200 });
  }

  const outLogId = outLogIdRaw.trim();
  console.info('[from-logs] start', { outLogId });

  const result = await sessionWorkerCreateFromOutLog(outLogId);
  if (!result.ok) {
    console.info('[from-logs] no-session', { outLogId, reason: result.reason });
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  }

  console.info('[from-logs] session-created', {
    outLogId,
    sessionId: result.sessionId,
    reportId: result.reportId,
    hours: result.hours,
    date: result.date,
  });
  return NextResponse.json(
    {
      ok: true,
      sessionId: result.sessionId ?? null,
      reportId: result.reportId ?? null,
      hours: result.hours,
      date: result.date,
    },
    { status: 200 },
  );
}
