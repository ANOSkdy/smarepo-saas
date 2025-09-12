import Airtable, { FieldSet } from 'airtable';

export const runtime = 'nodejs';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID || ''
);
const LOGS_TABLE = process.env.AIRTABLE_TABLE_LOGS || 'Logs';
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || 'Session';

interface LogFields extends FieldSet {
  timestamp: string;
  user: string;
  username: string;
  siteName: string;
  workDescription: string;
  type: 'IN' | 'OUT';
}

interface SessionFields extends FieldSet {
  year: number;
  month: number;
  day: number;
  userId: string;
  username: string;
  sitename: string;
  workdescription: string;
  clockInAt: string;
  clockOutAt: string;
  hours: number;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((r) => setTimeout(r, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

function jstParts(date: Date): { year: number; month: number; day: number } {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
  };
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const outLogId = (body as { outLogId?: unknown }).outLogId;
  if (typeof outLogId !== 'string') {
    return Response.json({ ok: false, error: 'outLogId required' }, { status: 400 });
  }

  try {
    const outLog = await withRetry(() => base<LogFields>(LOGS_TABLE).find(outLogId));
    if (outLog.fields.type !== 'OUT') {
      return Response.json({ ok: false, error: 'log is not OUT' }, { status: 400 });
    }
    const outTs = new Date(outLog.fields.timestamp);
    const { user, username, siteName, workDescription } = outLog.fields;

    const candidates = await withRetry(() =>
      base<LogFields>(LOGS_TABLE)
        .select({
          filterByFormula: `AND({type}='IN',{user}='${user}',{siteName}='${siteName}',{workDescription}='${workDescription}')`,
          sort: [{ field: 'timestamp', direction: 'desc' }],
          maxRecords: 50,
        })
        .all()
    );

    const inRecord = candidates.find((r) => new Date(r.fields.timestamp) < outTs);
    if (!inRecord) {
      return Response.json({ ok: true, skipped: true, reason: 'no IN match' });
    }
    const inTs = new Date(inRecord.fields.timestamp);
    const { year, month, day } = jstParts(inTs);
    const hours = Math.max((outTs.getTime() - inTs.getTime()) / 3600000, 0);
    const roundedHours = Math.round(hours * 100) / 100;

    const session: SessionFields = {
      year,
      month,
      day,
      userId: String(user),
      username: String(username),
      sitename: String(siteName),
      workdescription: String(workDescription),
      clockInAt: inRecord.fields.timestamp,
      clockOutAt: outLog.fields.timestamp,
      hours: roundedHours,
    };

    const exists = await withRetry(() =>
      base<SessionFields>(SESSIONS_TABLE)
        .select({
          filterByFormula: `AND({userId}='${session.userId}',{sitename}='${session.sitename}',{workdescription}='${session.workdescription}',{clockInAt}='${session.clockInAt}',{clockOutAt}='${session.clockOutAt}')`,
          maxRecords: 1,
        })
        .all()
    );
    if (exists.length > 0) {
      return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
    }

    const created = await withRetry(() =>
      base<SessionFields>(SESSIONS_TABLE).create(session)
    );
    return Response.json({ ok: true, createdId: created.id, fields: created.fields });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}
