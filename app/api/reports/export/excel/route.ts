import { NextResponse } from 'next/server';
import {
  listRecords,
  type AirtableRecord,
} from '@/src/lib/airtable/client';
import {
  buildFreeUserColumnsWorkbook,
  type ExcelRow,
} from '@/src/lib/excel/freeUserColumns';

export const runtime = 'nodejs';

type ReportIndexFields = {
  date?: string;
  sitename?: string;
  username?: string;
  machinename?: string;
  workdescription?: string;
  hours?: number;
};

type ExportRequest = {
  year?: number;
  month?: number;
  sitename?: string;
  username?: string;
  machinename?: string;
};

const REPORT_INDEX_TABLE =
  process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';

function escapeFormulaValue(value: string): string {
  return value.replaceAll("'", "\\'");
}

function buildFilterFormula({
  year,
  month,
  sitename,
  username,
  machinename,
}: Required<Pick<ExportRequest, 'year' | 'month'>> &
  Omit<ExportRequest, 'year' | 'month'>): string {
  const conditions = [
    `({year}=${year})`,
    `({month}=${month})`,
  ];
  if (sitename) {
    conditions.push(
      `SEARCH(LOWER('${escapeFormulaValue(sitename)}'), LOWER({sitename}&''))`
    );
  }
  if (username) {
    conditions.push(
      `SEARCH(LOWER('${escapeFormulaValue(username)}'), LOWER({username}&''))`
    );
  }
  if (machinename) {
    conditions.push(
      `SEARCH(LOWER('${escapeFormulaValue(machinename)}'), LOWER({machinename}&''))`
    );
  }
  return `AND(${conditions.join(',')})`;
}

function toExcelRows(records: AirtableRecord<ReportIndexFields>[]): ExcelRow[] {
  return records.map((record) => {
    const fields = record.fields;
    return {
      date: fields.date ?? '',
      sitename: fields.sitename ?? '',
      username: fields.username ?? '',
      machinename: fields.machinename ?? '',
      workdescription: fields.workdescription ?? '',
      hours: Number(fields.hours ?? 0),
    } satisfies ExcelRow;
  });
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

  const filterByFormula = buildFilterFormula({
    year: yearNumber,
    month: monthNumber,
    sitename: payload.sitename?.trim() || undefined,
    username: payload.username?.trim() || undefined,
    machinename: payload.machinename?.trim() || undefined,
  });

  try {
    const records = await listRecords<ReportIndexFields>({
      table: REPORT_INDEX_TABLE,
      filterByFormula,
      fields: [
        'date',
        'sitename',
        'username',
        'machinename',
        'workdescription',
        'hours',
      ],
      sort: [
        { field: 'sitename', direction: 'asc' },
        { field: 'username', direction: 'asc' },
        { field: 'machinename', direction: 'asc' },
        { field: 'date', direction: 'asc' },
      ],
      maxRecords: 20000,
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
