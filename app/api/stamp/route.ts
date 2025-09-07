import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  logsTable,
  machinesTable,
  sitesTable,
  // ### 修正点: 未使用のため削除 ###
  // usersTable, 
} from '@/lib/airtable';
import { findNearestSite } from '@/lib/geo';
import { LogFields } from '@/types';

export async function POST(req: NextRequest) {
  const session = await auth();
  // session.user.userId を使用する場合は session.user.id を userId に変更してください
  if (!session?.user?.id) { 
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const {
    machineId,
    workDescription,
    lat,
    lon,
    accuracy,
    type,
  }: {
    machineId: string;
    workDescription: string;
    lat: number;
    lon: number;
    accuracy: number;
    type: 'IN' | 'OUT';
  } = await req.json();

  if (!machineId || !workDescription || !lat || !lon || !type) {
    return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
  }

  try {
    const machineRecords = await machinesTable
      .select({
        filterByFormula: `{machineid} = '${machineId}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (machineRecords.length === 0 || !machineRecords[0].fields.active) {
      return NextResponse.json({ message: 'Invalid or inactive machine ID' }, { status: 400 });
    }
    const machineRecordId = machineRecords[0].id;

    const activeSites = await sitesTable.select({ filterByFormula: '{active} = 1' }).all();
    const nearestSite = findNearestSite(lat, lon, activeSites);

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
      siteName: nearestSite?.fields.name ?? '特定不能',
      workDescription,
      type,
    };

    await logsTable.create([{ fields: dataToCreate }]);

    return NextResponse.json({ message: 'Stamp recorded successfully' }, { status: 201 });
  } catch (error) {
    console.error('Failed to record stamp:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}