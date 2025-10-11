import { NextRequest } from 'next/server';
import { listRecords } from '../../../../src/lib/airtable/client';
import { upsertByCompositeKey } from '../../../../src/lib/airtable/upsert';

export const runtime = 'nodejs';

type SyncRequestBody = {
  year?: number;
  month?: number;
};

type SessionFields = {
  date: string;
  year: number;
  month: number;
  day?: number;
  weekday?: string;
  userId: string;
  username?: string;
  siteId: string;
  sitename?: string;
  machineId: string;
  machinename?: string;
  workdescription: string;
  clockInAt?: string;
  clockOutAt?: string;
  hours: number;
  isComplete?: boolean;
};

const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || 'Sessions';
const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';

function resolvePeriod(body: SyncRequestBody): { year: number; month: number } {
  const now = new Date();
  const year = body.year ?? now.getFullYear();
  const month = body.month ?? now.getMonth() + 1;
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error('year and month must be integers');
  }
  if (month < 1 || month > 12) {
    throw new Error('month must be between 1 and 12');
  }
  return { year, month };
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: SyncRequestBody = {};
  if (request.headers.get('content-length')) {
    try {
      body = await request.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON';
      return Response.json({ ok: false, message }, { status: 400 });
    }
  }

  let period;
  try {
    period = resolvePeriod(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid period';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  const filter = `AND({year}=${period.year},{month}=${period.month})`;

  try {
    const sessions = await listRecords<SessionFields>({
      table: SESSIONS_TABLE,
      filterByFormula: filter,
    });

    let upserted = 0;
    for (const session of sessions) {
      const fields = session.fields;
      if (!fields.date || !fields.userId || !fields.siteId || !fields.machineId) {
        continue;
      }
      await upsertByCompositeKey<SessionFields>({
        table: REPORT_INDEX_TABLE,
        key: {
          userId: fields.userId,
          siteId: fields.siteId,
          machineId: fields.machineId,
          date: fields.date,
          workdescription: fields.workdescription,
        },
        payload: {
          date: fields.date,
          year: fields.year,
          month: fields.month,
          day: fields.day ?? 0,
          weekday: fields.weekday ?? '',
          userId: fields.userId,
          username: fields.username ?? '',
          siteId: fields.siteId,
          sitename: fields.sitename ?? '',
          machineId: fields.machineId,
          machinename: fields.machinename ?? '',
          workdescription: fields.workdescription,
          clockInAt: fields.clockInAt ?? '',
          clockOutAt: fields.clockOutAt ?? '',
          hours: fields.hours,
          isComplete: fields.isComplete ?? true,
        },
      });
      upserted += 1;
    }

    return Response.json({ ok: true, upserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync failed';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
