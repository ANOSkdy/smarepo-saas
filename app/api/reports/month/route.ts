import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { auth } from '@/lib/auth';
import { buildSessionReport, getLogsBetween } from '@/lib/airtable/logs';

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

function resolveMonthRange(year: number, month: number) {
  const startUtc = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const endUtc = new Date(Date.UTC(nextMonth.year, nextMonth.month - 1, 1, -9, 0, 0));
  return { from: startUtc, to: endUtc };
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

  let rows: SessionRecord[] = [];
  try {
    const range = resolveMonthRange(year, month);
    const logs = await getLogsBetween(range);
    const sessions = buildSessionReport(logs);
    const filtered = sessions.filter((session) => {
      if (userId && session.userId !== userId) {
        return false;
      }
      if (site && session.siteName !== site) {
        return false;
      }
      return true;
    });
    rows = filtered.map((session) => ({
      id: session.id,
      fields: {
        year,
        month,
        day: Number.parseInt(session.date.split('-')[2] ?? '0', 10) || undefined,
        userId: session.userId ?? undefined,
        username: session.userName,
        sitename: session.siteName ?? undefined,
        workdescription: session.workDescription ?? undefined,
        clockInAt: session.clockInAt,
        clockOutAt: session.clockOutAt,
        hours: session.hours,
      },
    }));
  } catch (error) {
    console.error('[reports][month] failed to build workbook', error);
    return NextResponse.json({ ok: false, error: 'FAILED_TO_BUILD_REPORT' }, { status: 500 });
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

  for (const record of rows) {
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
