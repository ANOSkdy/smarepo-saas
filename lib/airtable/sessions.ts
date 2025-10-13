import Airtable, { FieldSet, Record as AirtableRecord } from 'airtable';
import { sitesTable } from '@/lib/airtable';
import type { SiteFields } from '@/types';
import {
  getProjectsForSiteIds,
  pickRepresentativeProject,
  ProjectFields,
} from './projects';

type AirtableSortDirection = 'asc' | 'desc';

interface SessionFields extends FieldSet {
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
}

const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS ?? 'Sessions';
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

function formatDate(year: number, month: number, day: number): string {
  const m = `${month}`.padStart(2, '0');
  const d = `${day}`.padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function roundHours(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

export interface CalendarDaySummary {
  date: string;
  hours: number;
  sessions: number;
}

export interface CalendarMonthResult {
  year: number;
  month: number;
  days: CalendarDaySummary[];
}

export async function getSessionsByMonth(params: {
  year: number;
  month: number;
}): Promise<CalendarMonthResult> {
  const { year, month } = params;
  const filterByFormula = `AND({year}=${year},{month}=${month})`;
  const records = await withRetry(() =>
    base<SessionFields>(SESSIONS_TABLE)
      .select({
        filterByFormula,
        fields: ['year', 'month', 'day', 'hours'],
        pageSize: 100,
        sort: [{ field: 'day', direction: 'asc' satisfies AirtableSortDirection }],
      })
      .all(),
  );

  const buckets = new Map<string, { hours: number; sessions: number }>();
  for (const record of records) {
    const fields = record.fields;
    if (!fields.day || !fields.year || !fields.month) {
      continue;
    }
    const date = formatDate(fields.year, fields.month, fields.day);
    const bucket = buckets.get(date);
    if (!bucket) {
      buckets.set(date, {
        hours: typeof fields.hours === 'number' ? fields.hours : 0,
        sessions: 1,
      });
    } else {
      bucket.hours += typeof fields.hours === 'number' ? fields.hours : 0;
      bucket.sessions += 1;
    }
  }

  const days = Array.from(buckets.entries())
    .map(([date, value]) => ({ date, hours: roundHours(value.hours), sessions: value.sessions }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { year, month, days };
}

export interface DaySessionDetail {
  username: string;
  sitename: string;
  workdescription: string;
  clockInAt: string;
  clockOutAt: string;
  hours: number;
  projectName: string | null;
}

export interface DayDetailResult {
  date: string;
  sessions: DaySessionDetail[];
  spreadsheetUrl: string | null;
}

function normaliseSessionField(value: string | undefined, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

async function fetchSitesByNames(siteNames: readonly string[]): Promise<Record<string, AirtableRecord<SiteFields>>> {
  const unique = Array.from(new Set(siteNames.filter((name): name is string => Boolean(name))));
  if (unique.length === 0) {
    return {};
  }
  const filterFormula = `OR(${unique
    .map((name) => `{name}='${name.replace(/'/g, "''")}'`)
    .join(',')})`;
  const records = await withRetry(() =>
    sitesTable
      .select({ filterByFormula: filterFormula, fields: ['name'] })
      .all(),
  );
  return records.reduce<Record<string, AirtableRecord<SiteFields>>>((acc, record) => {
    acc[(record.fields as SiteFields).name] = record;
    return acc;
  }, {});
}

export async function getSessionsByDay(date: string): Promise<DayDetailResult> {
  const [yearStr, monthStr, dayStr] = date.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  if (!year || !month || !day) {
    throw new Error('Invalid date format');
  }

  const records = await withRetry(() =>
    base<SessionFields>(SESSIONS_TABLE)
      .select({
        filterByFormula: `AND({year}=${year},{month}=${month},{day}=${day})`,
        pageSize: 100,
        sort: [{ field: 'clockInAt', direction: 'asc' as AirtableSortDirection }],
      })
      .all(),
  );

  const sessions = records.map((record) => {
    const fields = record.fields;
    return {
      username: normaliseSessionField(fields.username, '未登録ユーザー'),
      sitename: normaliseSessionField(fields.sitename, '未設定拠点'),
      workdescription: normaliseSessionField(fields.workdescription, ''),
      clockInAt: normaliseSessionField(fields.clockInAt, ''),
      clockOutAt: normaliseSessionField(fields.clockOutAt, ''),
      hours: roundHours(fields.hours),
      projectName: null,
    } satisfies DaySessionDetail;
  });

  const siteNames = sessions.map((item) => item.sitename);
  const siteRecords = await fetchSitesByNames(siteNames);
  const projectRecords = await getProjectsForSiteIds(
    Object.values(siteRecords).map((record) => record.id),
  );
  const representative = pickRepresentativeProject(projectRecords, date);

  const projectBySiteId = new Map<string, ProjectFields>();
  for (const record of projectRecords) {
    const linkedSiteIds = Array.isArray(record.fields.site) ? record.fields.site : [];
    for (const siteId of linkedSiteIds) {
      if (typeof siteId === 'string' && !projectBySiteId.has(siteId)) {
        projectBySiteId.set(siteId, record.fields);
      }
    }
  }

  const enrichedSessions = sessions.map((session) => {
    const siteRecord = siteRecords[session.sitename];
    if (!siteRecord) {
      return session;
    }
    const projectFields = projectBySiteId.get(siteRecord.id);
    return {
      ...session,
      projectName: projectFields?.name ?? session.projectName,
    };
  });

  return {
    date,
    sessions: enrichedSessions,
    spreadsheetUrl: representative?.spreadsheetUrl ?? null,
  };
}
