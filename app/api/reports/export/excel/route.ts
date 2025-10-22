import { NextResponse } from 'next/server';
import { getSessionReportRows, type SessionReportRow } from '@/src/lib/data/sessions';
import { buildFreeUserColumnsWorkbook, type ExcelRow } from '@/src/lib/excel/freeUserColumns';

export const runtime = 'nodejs';

type ExportRequest = {
  year?: number;
  month?: number;
  sitename?: string;
  username?: string;
  machinename?: string;
};

function resolveMonthBounds(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0));
  const endDate = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, '0')}-${String(
    lastDay.getUTCDate(),
  ).padStart(2, '0')}`;
  return { from: startDate, to: endDate };
}

function toExcelRows(records: SessionReportRow[]): ExcelRow[] {
  return records.map((record) => ({
    date: record.date,
    sitename: record.siteName ?? '',
    username: record.userName,
    machinename: record.machineName ?? record.machineId ?? '',
    workdescription: record.workDescription ?? '',
    hours: Number(record.hours ?? 0),
  } satisfies ExcelRow));
}

export async function POST(request: Request) {
  let payload: ExportRequest;
  try {
    payload = (await request.json()) as ExportRequest;
  } catch {
    return NextResponse.json(
      { ok: false, message: 'invalid payload' },
      { status: 400 }
    );
  }

  const yearNumber = typeof payload.year === 'number' ? payload.year : Number(payload.year);
  const monthNumber = typeof payload.month === 'number' ? payload.month : Number(payload.month);

  if (!Number.isInteger(yearNumber) || !Number.isInteger(monthNumber)) {
    return NextResponse.json(
      { ok: false, message: 'year/month required' },
      { status: 400 }
    );
  }
  if (monthNumber < 1 || monthNumber > 12) {
    return NextResponse.json(
      { ok: false, message: 'month must be between 1 and 12' },
      { status: 400 }
    );
  }

  try {
    const range = resolveMonthBounds(yearNumber, monthNumber);
    const records = await getSessionReportRows(range, {
      siteQuery: payload.sitename,
      userQuery: payload.username,
      machineQuery: payload.machinename,
    });

    const workbook = await buildFreeUserColumnsWorkbook(
      toExcelRows(records),
      yearNumber,
      monthNumber
    );
    const buffer = await workbook.xlsx.writeBuffer();
    const downloadName = `${yearNumber}${String(monthNumber).padStart(2, '0')}`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report-${downloadName}.xlsx"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'excel export failed';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
