import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  logsTable,
  machinesTable,
  sitesTable,
} from '@/lib/airtable';
import { findNearestSite } from '@/lib/geo';
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
    positionTimestamp,
    decisionThreshold,
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
    const nearestSite = findNearestSite(lat, lon, activeSites);
    const haversineDistance = (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number,
    ) => {
      const R = 6371e3;
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    const distanceToSite = nearestSite
      ? haversineDistance(lat, lon, nearestSite.fields.lat, nearestSite.fields.lon)
      : Number.POSITIVE_INFINITY;
    const threshold = decisionThreshold ?? 300;
    const fresh =
      typeof positionTimestamp === 'number'
        ? Date.now() - positionTimestamp <= 30_000
        : false;
    const accurate = typeof accuracy === 'number' ? accuracy <= 100 : false;
    const within = distanceToSite <= threshold;
    const needsReview = !fresh || !accurate || !within;

    const now = new Date();
    const timestamp = now.toISOString();
    const dateJST = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now).replace(/\//g, '-');

    const dataToCreate: Omit<LogFields, 'user' | 'machine'> & {
      user: readonly string[];
      machine: readonly string[];
    } = {
      timestamp,
      date: dateJST,
      user: [session.user.id], // AirtableのUsersテーブルのレコードID
      machine: [machineRecordId],
      lat,
      lon,
      accuracy,
      positionTimestamp,
      distanceToSite,
      decisionThreshold: threshold,
      siteName: nearestSite?.fields.name ?? '特定不能',
      workDescription,
      type,
      serverDecision: needsReview ? 'needs_review' : 'accepted',
      status: needsReview ? 'needs_review' : 'accepted',
    };

    await logsTable.create([{ fields: dataToCreate }]);

    return NextResponse.json(
      {
        ok: true,
        message: 'Stamp recorded successfully',
        serverDecision: needsReview ? 'needs_review' : 'accepted',
      },
      { status: 201 },
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