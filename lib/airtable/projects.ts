import Airtable, { FieldSet, Record as AirtableRecord, Records } from 'airtable';
import { sitesTable } from '@/lib/airtable';
import type { SiteFields } from '@/types';

type AirtableSortDirection = 'asc' | 'desc';

export interface ProjectFields extends FieldSet {
  projectId?: string;
  name?: string;
  site?: readonly string[];
  status?: '準備中' | '進行中' | '保留' | '完了';
  startDate?: string;
  endDate?: string;
  progressPercent?: number;
  spreadsheetUrl?: string;
}

export interface DashboardProjectItem {
  projectId: string;
  name: string;
  siteName: string | null;
  status: ProjectFields['status'] | null;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  spreadsheetUrl: string | null;
}

export interface GetDashboardProjectsParams {
  search?: string;
  status?: ProjectFields['status'];
  sort?: 'progress' | 'startDate' | 'endDate';
  order?: AirtableSortDirection;
  page?: number;
  pageSize?: number;
}

export interface GetDashboardProjectsResult {
  items: DashboardProjectItem[];
  total: number;
}

const PROJECTS_TABLE = process.env.AIRTABLE_TABLE_PROJECTS || 'Projects';
const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

if (!apiKey || !baseId) {
  throw new Error('Airtable credentials are not configured');
}

const base = new Airtable({ apiKey }).base(baseId);

async function withRetry<T>(factory: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(factory, retries - 1, delay * 2);
  }
}

function escapeAirtableFormula(value: string): string {
  return value.replace(/'/g, "''");
}

function buildFilterFormula(params: GetDashboardProjectsParams): string | undefined {
  const filters: string[] = [];
  if (params.status) {
    filters.push(`{status}='${escapeAirtableFormula(params.status)}'`);
  }
  if (params.search) {
    const escaped = escapeAirtableFormula(params.search);
    filters.push(`FIND('${escaped}', LOWER({name}))`);
  }
  if (filters.length === 0) {
    return undefined;
  }
  if (filters.length === 1) {
    return filters[0];
  }
  return `AND(${filters.join(',')})`;
}

const sortMap: Record<NonNullable<GetDashboardProjectsParams['sort']>, keyof ProjectFields> = {
  progress: 'progressPercent',
  startDate: 'startDate',
  endDate: 'endDate',
};

function clampPageSize(pageSize?: number): number {
  if (!pageSize || Number.isNaN(pageSize)) {
    return 20;
  }
  return Math.max(1, Math.min(100, Math.trunc(pageSize)));
}

function normalisePage(page?: number): number {
  if (!page || Number.isNaN(page) || page < 1) {
    return 1;
  }
  return Math.trunc(page);
}

async function resolveSiteNames(siteIds: readonly string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(siteIds.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) {
    return {};
  }
  const filterFormula = `OR(${unique.map((id) => `RECORD_ID()='${escapeAirtableFormula(id)}'`).join(',')})`;
  const records = await withRetry(() =>
    sitesTable
      .select({ filterByFormula: filterFormula, fields: ['name'] })
      .all(),
  );
  return records.reduce<Record<string, string>>((acc, record) => {
    acc[record.id] = (record.fields as SiteFields).name;
    return acc;
  }, {});
}

function toProjectItem(
  record: AirtableRecord<ProjectFields>,
  siteMap: Record<string, string>,
): DashboardProjectItem {
  const { fields } = record;
  const siteIds = Array.isArray(fields.site) ? fields.site : [];
  const siteName = siteIds.length > 0 ? siteMap[siteIds[0]] ?? null : null;
  const progressValue = typeof fields.progressPercent === 'number' ? fields.progressPercent : 0;
  return {
    projectId: fields.projectId ?? record.id,
    name: fields.name ?? '名称未設定',
    siteName,
    status: fields.status ?? null,
    startDate: fields.startDate ?? null,
    endDate: fields.endDate ?? null,
    progressPercent: Math.max(0, Math.min(100, progressValue)),
    spreadsheetUrl: fields.spreadsheetUrl ?? null,
  };
}

export async function getDashboardProjects(
  params: GetDashboardProjectsParams,
): Promise<GetDashboardProjectsResult> {
  const page = normalisePage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const filterByFormula = buildFilterFormula(params);
  const sortField = params.sort ? sortMap[params.sort] : undefined;
  const sortDirection: AirtableSortDirection = params.order === 'asc' ? 'asc' : 'desc';

  const records = await withRetry(() =>
    base<ProjectFields>(PROJECTS_TABLE)
      .select({
        filterByFormula,
        sort: sortField ? [{ field: sortField, direction: sortDirection }] : undefined,
        pageSize: 100,
        cellFormat: 'json',
      })
      .all(),
  );

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginated = records.slice(start, end);

  const siteIds = paginated.flatMap((record) =>
    (Array.isArray(record.fields.site) ? record.fields.site : []).map((id) => id ?? ''),
  );
  const siteMap = await resolveSiteNames(siteIds);

  return {
    total: records.length,
    items: paginated.map((record) => toProjectItem(record, siteMap)),
  };
}

export async function getProjectsForSiteIds(siteIds: readonly string[]): Promise<Records<ProjectFields>> {
  if (siteIds.length === 0) {
    return [];
  }
  const filter = `OR(${siteIds
    .map((id) => `FIND('${escapeAirtableFormula(id)}', ARRAYJOIN({site}))`)
    .join(',')})`;
  return withRetry(() =>
    base<ProjectFields>(PROJECTS_TABLE)
      .select({
        filterByFormula: filter,
        pageSize: 100,
        cellFormat: 'json',
      })
      .all(),
  );
}

export function pickRepresentativeProject(
  records: Records<ProjectFields>,
  targetDate?: string,
): { name: string; spreadsheetUrl: string | null } | null {
  if (records.length === 0) {
    return null;
  }
  const referenceTime = targetDate ? Date.parse(targetDate) : null;
  const sorted = [...records].sort((a, b) => {
    const endA = a.fields.endDate ? Date.parse(a.fields.endDate) : 0;
    const endB = b.fields.endDate ? Date.parse(b.fields.endDate) : 0;
    if (endA !== endB) {
      return endB - endA;
    }
    if (referenceTime) {
      const startA = a.fields.startDate ? Math.abs(referenceTime - Date.parse(a.fields.startDate)) : Number.MAX_SAFE_INTEGER;
      const startB = b.fields.startDate ? Math.abs(referenceTime - Date.parse(b.fields.startDate)) : Number.MAX_SAFE_INTEGER;
      if (startA !== startB) {
        return startA - startB;
      }
    }
    const progressA = typeof a.fields.progressPercent === 'number' ? a.fields.progressPercent : 0;
    const progressB = typeof b.fields.progressPercent === 'number' ? b.fields.progressPercent : 0;
    return progressB - progressA;
  });
  const chosen = sorted[0];
  if (!chosen) {
    return null;
  }
  return {
    name: chosen.fields.name ?? chosen.fields.projectId ?? '未設定案件',
    spreadsheetUrl: chosen.fields.spreadsheetUrl ?? null,
  };
}
