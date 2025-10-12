import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { base as airtableBase } from '@/lib/airtable';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

type SessionRecord = {
  id: string;
  fields: {
    year?: number;
    month?: number;
    day?: number;
    userId?: string;
    username?: string;
    sitename?: string;
    workdescription?: string;
    clockInAt?: string;
    clockOutAt?: string;
    hours?: number;
  };
};

function assertInt(name: string, value: string | null): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return parseInt(value, 10);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  let year: number;
  let month: number;
  try {
    year = assertInt('year', url.searchParams.get('year'));
    month = assertInt('month', url.searchParams.get('month'));
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }
  const userId = url.searchParams.get('userId') ?? undefined;
  const site = url.searchParams.get('site') ?? undefined;

  const base = airtableBase;
  const tableName = process.env.AIRTABLE_TABLE_SESSIONS ?? 'Session';

  const filters: string[] = [`{year} = ${year}`, `{month} = ${month}`];
  if (userId) {
    filters.push(`{userId} = "${userId}"`);
  }
  if (site) {
    filters.push(`{sitename} = "${site}"`);
  }
  const filterByFormula = `AND(${filters.join(',')})`;

  const records: SessionRecord[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      base(tableName)
        .select({
          filterByFormula,
          pageSize: 100,
          sort: [
            { field: 'day', direction: 'asc' },
            { field: 'userId', direction: 'asc' },
          ],
        })
        .eachPage(
          (rows, next) => {
            (rows as unknown as SessionRecord[]).forEach((row) => {
              records.push(row);
            });
            next();
          },
          (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          }
        );
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'FAILED_TO_FETCH_SESSIONS' }, { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  const rowsData: (string | number)[][] = [];

  const headerRow = [
    '日付(YYYY-MM-DD)',
    'ユーザー名',
    'ユーザーID',
    '現場名',
    '作業内容',
    '出勤(ISO)',
    '退勤(ISO)',
    '時間(h)',
  ];
  rowsData.push(headerRow);
  worksheet.addRow(headerRow);

  for (const record of records) {
    const fields = record.fields ?? {};
    const dateValue =
      fields.year && fields.month && fields.day
        ? `${String(fields.year)}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}`
        : '';

    const dataRow = [
      dateValue,
      fields.username ?? '',
      fields.userId ?? '',
      fields.sitename ?? '',
      fields.workdescription ?? '',
      fields.clockInAt ?? '',
      fields.clockOutAt ?? '',
      typeof fields.hours === 'number' ? fields.hours : '',
    ];
    rowsData.push(dataRow);
    worksheet.addRow(dataRow);
  }

  headerRow.forEach((_, index) => {
    let maxLength = 10;
    for (const row of rowsData) {
      const value = row[index];
      const normalized = value === undefined || value === null ? '' : String(value);
      if (normalized.length > maxLength) {
        maxLength = Math.min(normalized.length, 60);
      }
    }
    worksheet.getColumn(index + 1).width = maxLength + 2;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `report-${year}-${String(month).padStart(2, '0')}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
