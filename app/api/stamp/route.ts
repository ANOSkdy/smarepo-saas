import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  logsTable,
  machinesTable,
  sitesTable,
  usersTable,
} from '@/lib/airtable';
import { findNearestSite } from '@/lib/geo';
import { LogFields } from '@/types';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
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
    // 1. 有効な機械IDか確認
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

    // 2. 最近傍の現場を特定
    const activeSites = await sitesTable.select({ filterByFormula: '{active} = 1' }).all();
    const nearestSite = findNearestSite(lat, lon, activeSites);

    // 3. タイムスタンプと日付を生成
    const now = new Date();
    const timestamp = now.toISOString();
    const dateJST = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now).replace(/\//g, '-');


    // 4. 保存するデータを作成
    const dataToCreate: Omit<LogFields, 'user' | 'machine'> & {
      user: readonly string[];
      machine: readonly string[];
    } = {
      timestamp,
      date: dateJST,
      user: [session.user.id],
      machine: [machineRecordId],
      lat,
      lon,
      accuracy,
      siteName: nearestSite?.fields.name ?? '特定不能',
      workDescription,
      type,
    };

    // 5. Airtableにレコードを作成
    await logsTable.create([{ fields: dataToCreate }]);

    return NextResponse.json({ message: 'Stamp recorded successfully' }, { status: 201 });
  } catch (error) {
    console.error('Failed to record stamp:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}