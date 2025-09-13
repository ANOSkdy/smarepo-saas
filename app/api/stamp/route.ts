import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  logsTable,
  machinesTable,
  sitesTable,
} from '@/lib/airtable';
import { findNearestSiteDetailed } from '@/lib/geo';
import { LOGS_ALLOWED_FIELDS, filterFields } from '@/lib/airtableSchema';
import { LogFields } from '@/types';
import { validateStampRequest } from './validator';

export const runtime = 'nodejs';

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
    console.info('[sites:summary]', {
      count: activeSites.length,
      hasAcoru: activeSites.some((s) => s.fields.name === 'Acoru合同会社'),
      acoruActive:
        activeSites.find((s) => s.fields.name === 'Acoru合同会社')?.fields.active ?? null,
      acoruHasPoly: !!activeSites.find((s) => s.fields.name === 'Acoru合同会社')?.fields.polygon_geojson,
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

    await logsTable.create([{ fields }], { typecast: true });

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
    console.error('Failed to record stamp:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Internal Server Error',
      'Retry later',
      500,
    );
  }
}
