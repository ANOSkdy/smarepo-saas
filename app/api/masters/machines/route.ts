import { NextResponse } from 'next/server';
import { machinesTable } from '@/lib/airtable';

export async function GET() {
  try {
    const records = await machinesTable
      .select({
        filterByFormula: '{active} = 1',
        sort: [{ field: 'machineid', direction: 'asc' }],
      })
      .all();

    const machines = records.map((record) => ({
      id: record.id,
      fields: record.fields,
    }));

    return NextResponse.json(machines);
  } catch (error) {
    console.error('Failed to fetch machines:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
