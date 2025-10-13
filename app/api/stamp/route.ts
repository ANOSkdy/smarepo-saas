// Ensure this route is built and executed on the Node.js runtime (NOT Edge)
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
// (intentionally no static import for the worker)
import { auth } from '@/lib/auth';
import {
  logsTable,
  machinesTable,
  sitesTable,
  withRetry,
} from '@/lib/airtable';
import { findNearestSiteDetailed } from '@/lib/geo';
import { LOGS_ALLOWED_FIELDS, filterFields } from '@/lib/airtableSchema';
import { LogFields } from '@/types';
import { validateStampRequest } from './validator';
import { logger } from '@/lib/logger';

function errorResponse(
  code: string,
  reason: string,
  hint: string,
  status: number,
) {
  return NextResponse.json({ ok: false, code, reason, hint }, { status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse(
      'UNAUTHORIZED',
      'Authentication required',
      'Sign in and retry',
      401,
    );
  }

  const parsed = validateStampRequest(await req.json());
  if (!parsed.success) {
    return errorResponse('INVALID_BODY', 'Invalid request body', parsed.hint, 400);
  }

  const {
    machineId,
    workDescription,
    lat,
    lon,
    accuracy,
    type,
  } = parsed.data;

  try {
    const machineRecords = await machinesTable
      .select({
        filterByFormula: `{machineid} = '${machineId}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (machineRecords.length === 0 || !machineRecords[0].fields.active) {
      return errorResponse(
        'INVALID_MACHINE',
        'Invalid or inactive machine ID',
        'Check machineId',
        400,
      );
    }
    const machineRecordId = machineRecords[0].id;

    const activeSites = await sitesTable.select({ filterByFormula: '{active} = 1' }).all();
    logger.info('stamp active sites summary', {
      count: activeSites.length,
      hasAcoru: activeSites.some((s) => s.fields.name === 'Acoru合同会社'),
    });
    const { site: nearestSite, method: decisionMethod, nearestDistanceM } =
      findNearestSiteDetailed(lat, lon, activeSites);

    const now = new Date();
    const timestamp = now.toISOString();
    const dateJST = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now).replace(/\//g, '-');

    const candidate = {
      timestamp,
      date: dateJST,
      user: [session.user.id], // AirtableのUsersテーブルのレコードID
      machine: [machineRecordId],
      siteName: nearestSite?.fields.name ?? null,
      lat,
      lon,
      accuracy,
      workDescription,
      type,
    };
    const fields = filterFields(candidate, LOGS_ALLOWED_FIELDS) as Partial<LogFields>;
    if (!fields.siteName && nearestSite?.fields?.name) {
      fields.siteName = nearestSite.fields.name;
    }
    if (!fields.timestamp) {
      fields.timestamp = timestamp;
    }

    const createdRecords = await withRetry(() =>
      logsTable.create([{ fields }], { typecast: true })
    );
    const created = createdRecords[0];

    if (created) {
      const outLogId = created.id;
      let triggerUrl: string | undefined;
      if (type === 'OUT') {
        try {
          const headers = req.headers;
          const protocol = headers.get('x-forwarded-proto') ?? 'https';
          const host =
            headers.get('x-forwarded-host') ?? headers.get('host') ?? '';
          if (!host) {
            console.warn('[auto-session-trigger:error]', {
              outLogId,
              reason: 'MISSING_HOST_HEADER',
            });
          } else {
            const baseUrl = `${protocol}://${host}`;
            triggerUrl = `${baseUrl}/api/out-to-session/from-logs`;

            console.info('[auto-session-trigger:start]', {
              url: triggerUrl,
              outLogId,
            });
            const response = await fetch(triggerUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ outLogId }),
            });
            const bodyText = await response.text().catch(() => '');
            console.info('[auto-session-trigger:done]', {
              outLogId,
              status: response.status,
              body: bodyText.slice(0, 200),
            });
          }
        } catch (error) {
          console.warn('[auto-session-trigger:error]', {
            outLogId,
            triggerUrl,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : error,
          });
        }
      }
      logger.info('stamp record created', {
        userId: session.user.id,
        recordId: outLogId,
        type,
      });
    }

    return NextResponse.json(
      {
        decidedSiteId: nearestSite?.fields.siteId ?? null,
        decidedSiteName: nearestSite?.fields.name ?? null,
        decision_method: decisionMethod,
        nearest_distance_m: nearestDistanceM ?? null,
        accuracy,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error('Failed to record stamp', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Internal Server Error',
      'Retry later',
      500,
    );
  }
}
