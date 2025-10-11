import { NextRequest } from 'next/server';
import { buildAndFormula, listRecords, type AirtableRecord } from '../../../../../src/lib/airtable/client';
import {
  htmlToPdfBuffer,
  type HeaderInfo,
  type ReportRow,
} from '../../../../../src/lib/pdf/render';
import { renderPersonalList } from '../../../../../src/app/reports/_templates/personal-list';
import { renderSiteList } from '../../../../../src/app/reports/_templates/site-list';
import { renderMonthlyMatrix } from '../../../../../src/app/reports/_templates/monthly-matrix';

export const runtime = 'nodejs';

type ReportType = 'personal' | 'site' | 'monthly';

type ExportRequest = {
  type: ReportType;
  year: number;
  month: number;
  siteId?: string;
  userId?: string;
  machineId?: string;
  filters?: Record<string, unknown>;
};

type ReportIndexFields = {
  date?: string;
  username?: string;
  sitename?: string;
  machinename?: string;
  workdescription?: string;
  hours?: number;
  isComplete?: boolean;
};

const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';
const JST_OFFSET_MINUTES = 9 * 60;

function getGeneratedAt(): string {
  const now = new Date();
  const jstMillis = now.getTime() + JST_OFFSET_MINUTES * 60 * 1000;
  const jst = new Date(jstMillis);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

function parseRequest(body: unknown): ExportRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('invalid payload');
  }
  const { type, year, month, siteId, userId, machineId, filters } = body as Partial<ExportRequest>;
  if (type !== 'personal' && type !== 'site' && type !== 'monthly') {
    throw new Error('type is required');
  }
  if (typeof year !== 'number' || !Number.isInteger(year)) {
    throw new Error('year must be an integer');
  }
  if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('month must be between 1 and 12');
  }
  return {
    type,
    year,
    month,
    siteId: siteId?.trim() || undefined,
    userId: userId?.trim() || undefined,
    machineId: machineId?.trim() || undefined,
    filters: filters && typeof filters === 'object' ? filters : undefined,
  };
}

function toReportRow(record: AirtableRecord<ReportIndexFields>): ReportRow | null {
  const { date, hours, username, sitename, machinename, workdescription } = record.fields;
  if (typeof date !== 'string' || typeof hours !== 'number') {
    return null;
  }
  return {
    date,
    username: username ?? '',
    sitename: sitename ?? '',
    machinename: machinename ?? '',
    workdescription: workdescription ?? '',
    hours,
  };
}

function buildFilterFormula(request: ExportRequest): string {
  const base: Record<string, string | number> = { year: request.year, month: request.month };
  if (request.siteId) {
    base.siteId = request.siteId;
  }
  if (request.userId) {
    base.userId = request.userId;
  }
  if (request.machineId) {
    base.machineId = request.machineId;
  }
  return buildAndFormula(base);
}

function selectTemplate(type: ReportType) {
  switch (type) {
    case 'personal':
      return renderPersonalList;
    case 'site':
      return renderSiteList;
    case 'monthly':
      return renderMonthlyMatrix;
  }
}

function createHeaderInfo(request: ExportRequest, rows: ReportRow[]): HeaderInfo {
  const base: HeaderInfo = {
    title:
      request.type === 'personal'
        ? '個人別 勤務実績'
        : request.type === 'site'
        ? '現場別 勤務実績'
        : '月次稼働マトリクス',
    year: request.year,
    month: request.month,
    generatedAt: getGeneratedAt(),
  };
  if (request.type === 'personal') {
    base.userName = rows[0]?.username || undefined;
  }
  if (request.type === 'site') {
    base.siteName = rows[0]?.sitename || undefined;
  }
  if (request.type === 'monthly' && request.siteId) {
    base.siteName = rows.find((row) => row.sitename)?.sitename;
  }
  return base;
}

export async function POST(request: NextRequest): Promise<Response> {
  let payload: ExportRequest;
  try {
    const json = await request.json();
    payload = parseRequest(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid payload';
    return Response.json({ ok: false, message }, { status: 400 });
  }

  let records: AirtableRecord<ReportIndexFields>[];
  try {
    records = await listRecords<ReportIndexFields>({
      table: REPORT_INDEX_TABLE,
      filterByFormula: buildFilterFormula(payload),
      fields: ['date', 'username', 'sitename', 'machinename', 'workdescription', 'hours', 'isComplete'],
      sort: [
        { field: 'sitename', direction: 'asc' },
        { field: 'username', direction: 'asc' },
        { field: 'date', direction: 'asc' },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to load records';
    return Response.json({ ok: false, message }, { status: 500 });
  }

  const rows = records
    .map(toReportRow)
    .filter((row): row is ReportRow => row !== null);

  if (rows.length === 0) {
    return Response.json({ ok: false, message: 'データがありません' }, { status: 404 });
  }

  const header = createHeaderInfo(payload, rows);
  const template = selectTemplate(payload.type);
  const html = template(header, rows);

  try {
    const buffer = await htmlToPdfBuffer(html, { landscape: true, marginMM: 8 });
    const bytes: Uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const cloned = bytes.slice();
    const arrayBuffer = new ArrayBuffer(cloned.byteLength);
    new Uint8Array(arrayBuffer).set(cloned);
    const month = String(payload.month).padStart(2, '0');
    const filename = `report-${payload.type}-${payload.year}${month}.pdf`;
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to render pdf';
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
