import { NextResponse } from 'next/server';
import { workTypesTable } from '@/lib/airtable';

export async function GET() {
  try {
    const records = await workTypesTable
      .select({
        filterByFormula: '{active} = 1',
        sort: [{ field: 'sortOrder', direction: 'asc' }],
      })
      .all();

    const workTypes = records.map((record) => ({
      id: record.id,
      fields: record.fields,
    }));

    return NextResponse.json(workTypes);
  } catch (error) {
    console.error('Failed to fetch work types:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}