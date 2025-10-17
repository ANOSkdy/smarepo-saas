import { NextResponse } from 'next/server';

import { logsTable, usersTable } from '@/lib/airtable';
import { pairLogsByDay, type LogRecord, type ReportRow } from '@/lib/reports/pair';

function escapeFormulaValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

type SortKey = 'year' | 'month' | 'day' | 'siteName';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userName = searchParams.get('userName')?.trim();
  const sort = (searchParams.get('sort') ?? '').trim() as SortKey | '';
  const orderParam = (searchParams.get('order') ?? 'asc').trim().toLowerCase();
  const order: 'asc' | 'desc' = orderParam === 'desc' ? 'desc' : 'asc';

  if (!userName) {
    return NextResponse.json(
      { ok: false, error: 'userName is required', rows: [] },
      { status: 400 }
    );
  }

  try {
    const escapedUserName = escapeFormulaValue(userName);
    const users = await usersTable
      .select({ filterByFormula: `{name} = "${escapedUserName}"`, maxRecords: 1 })
      .firstPage();
    const userRecord = users[0];

    if (!userRecord) {
      return NextResponse.json({ ok: true, rows: [] satisfies ReportRow[] });
    }

    const userId = userRecord.id;

    const logRecords = await logsTable
      .select({
        filterByFormula: `FIND("${userId}", ARRAYJOIN({user}))`,
        fields: ['type', 'timestamp', 'date', 'siteName', 'clientName', 'user'],
      })
      .all();

    const paired = pairLogsByDay(
      logRecords.map<LogRecord>((record) => ({
        id: record.id,
        fields: record.fields as LogRecord['fields'],
      }))
    );

    const sortKey = (sort && ['year', 'month', 'day', 'siteName'].includes(sort)
      ? (sort as SortKey)
      : undefined);

    const rows = sortKey
      ? [...paired].sort((a, b) => {
          const aValue = a[sortKey];
          const bValue = b[sortKey];
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            const result = aValue.localeCompare(bValue, 'ja');
            return order === 'asc' ? result : -result;
          }
          if (typeof aValue === 'number' && typeof bValue === 'number') {
            const result = aValue - bValue;
            return order === 'asc' ? result : -result;
          }
          return 0;
        })
      : paired;

    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    console.error('GET /api/reports failed', error);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', rows: [] },
      { status: 500 }
    );
  }
}
