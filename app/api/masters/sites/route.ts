import { NextResponse } from 'next/server';
import { sitesTable } from '@/lib/airtable';

export async function GET() {
  try {
    const records = await sitesTable
      .select({ filterByFormula: '{active} = 1' })
      .all();

    const sites = records.map((record) => ({
      id: record.id,
      fields: record.fields,
    }));

    return NextResponse.json(sites);
  } catch (error) {
    console.error('Failed to fetch sites:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

