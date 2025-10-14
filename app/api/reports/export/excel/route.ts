import { NextResponse } from 'next/server';
import { buildSessionReport, getLogsBetween, type SessionReportRow } from '@/lib/airtable/logs';
import { buildFreeUserColumnsWorkbook, type ExcelRow } from '@/src/lib/excel/freeUserColumns';

export const runtime = 'nodejs';

type ExportRequest = {
  year?: number;
  month?: number;
  sitename?: string;
  username?: string;
  machinename?: string;
};

function resolveMonthRange(year: number, month: number) {
  const startUtc = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const endUtc = new Date(Date.UTC(nextMonth.year, nextMonth.month - 1, 1, -9, 0, 0));
  return { from: startUtc, to: endUtc };
}

function matchesFilter(value: string | null, query?: string): boolean {
  if (!query) {
    return true;
  }
  if (!value) {
    return false;
  }
  return value.toLocaleLowerCase('ja').includes(query.toLocaleLowerCase('ja'));
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
    const range = resolveMonthRange(yearNumber, monthNumber);
    const logs = await getLogsBetween(range);
    const records = buildSessionReport(logs).filter((record) => {
      const sitename = payload.sitename?.trim();
      const username = payload.username?.trim();
      const machinename = payload.machinename?.trim();
      if (!matchesFilter(record.siteName ?? null, sitename)) {
        return false;
      }
      if (!matchesFilter(record.userName, username)) {
        return false;
      }
      const machineLabel = record.machineName ?? record.machineId ?? null;
      if (!matchesFilter(machineLabel, machinename)) {
        return false;
      }
      return true;
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
