import { logsTable } from '@/lib/airtable';
import { pairLogsByDay, type LogRecord, type ReportRow } from '@/lib/reports/pair';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

export type ReportFilters = {
  year?: number;
  month?: number;
  day?: number;
  user?: string;
  site?: string;
};

export type ReportRowWithUser = ReportRow & {
  userDisplayName: string;
};

export type ReportFilterOptions = {
  years: number[];
  months: number[];
  days: number[];
  users: string[];
  sites: string[];
};

export type ReportFilterResult = {
  rows: ReportRowWithUser[];
  options: ReportFilterOptions;
};

const REQUIRED_LOG_SELECT_FIELDS = [
  'type',
  'timestamp',
  'date',
  'siteName',
  'clientName',
  'user',
  'userId',
  'name (from user)',
] as const;

const OPTIONAL_LOG_SELECT_FIELDS = ['username'] as const;

const UNKNOWN_FIELD_STATUS_CODE = 422;

function isUnknownFieldError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode?: number }).statusCode === UNKNOWN_FIELD_STATUS_CODE
  );
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type DateParts = {
  year: number;
  month: number;
  day: number;
  isoDate: string;
};

function parseDateField(value: unknown): DateParts | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1] ?? '', 10);
  const month = Number.parseInt(match[2] ?? '', 10);
  const day = Number.parseInt(match[3] ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return {
    year,
    month,
    day,
    isoDate: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

function parseTimestampToJst(timestamp: string): DateParts | null {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const jst = new Date(parsed + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const isoDate = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return {
    year,
    month,
    day,
    isoDate,
  };
}

function resolveDisplayUserName(fields: Record<string, unknown>): string {
  const candidates = [
    fields['name (from user)'],
    fields.username,
    fields.userName,
    fields.user_id,
    fields.userId,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '未設定';
}

function coerceSiteName(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function coerceClientName(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function coerceUserLinks(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const names = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  return names.length > 0 ? names : undefined;
}

function extractDateParts(fields: Record<string, unknown>): DateParts | null {
  const fromDateField = parseDateField(fields.date);
  if (fromDateField) {
    return fromDateField;
  }
  if (typeof fields.timestamp !== 'string') {
    return null;
  }
  return parseTimestampToJst(fields.timestamp);
}

export async function getReportRowsByFilters(filters: ReportFilters): Promise<ReportFilterResult> {
  const selectFields = [
    ...REQUIRED_LOG_SELECT_FIELDS,
    ...OPTIONAL_LOG_SELECT_FIELDS,
  ];

  const records = await logsTable
    .select({
      fields: selectFields,
    })
    .all()
    .catch((error) => {
      if (!isUnknownFieldError(error)) {
        throw error;
      }

      return logsTable
        .select({
          fields: [...REQUIRED_LOG_SELECT_FIELDS],
        })
        .all();
    });

  const enriched: Array<{
    year: number;
    month: number;
    day: number;
    siteName: string;
    userDisplayName: string;
    logRecord: LogRecord;
  }> = [];

  for (const record of records) {
    const fields = record.fields as Record<string, unknown>;
    const typeRaw = typeof fields.type === 'string' ? fields.type.trim().toUpperCase() : undefined;
    if (typeRaw !== 'IN' && typeRaw !== 'OUT') {
      continue;
    }

    const timestamp = typeof fields.timestamp === 'string' ? fields.timestamp : undefined;
    if (!timestamp) {
      continue;
    }

    const dateParts = extractDateParts(fields);
    if (!dateParts) {
      continue;
    }

    const siteName = coerceSiteName(fields.siteName);
    const clientName = coerceClientName(fields.clientName);
    const userLinks = coerceUserLinks(fields.user);
    const userDisplayName = resolveDisplayUserName(fields);

    const logRecord: LogRecord = {
      id: record.id,
      fields: {
        type: typeRaw,
        timestamp,
        date: dateParts.isoDate,
        siteName: siteName || undefined,
        clientName,
        user: userLinks,
      },
    };

    enriched.push({
      year: dateParts.year,
      month: dateParts.month,
      day: dateParts.day,
      siteName,
      userDisplayName,
      logRecord,
    });
  }

  const yearSet = new Set<number>();
  const monthSet = new Set<number>();
  const daySet = new Set<number>();
  const userSet = new Set<string>();
  const siteSet = new Set<string>();

  for (const item of enriched) {
    yearSet.add(item.year);
    monthSet.add(item.month);
    daySet.add(item.day);
    userSet.add(item.userDisplayName);
    if (item.siteName) {
      siteSet.add(item.siteName);
    }
  }

  const filtered = enriched.filter((item) => {
    if (typeof filters.year === 'number' && item.year !== filters.year) {
      return false;
    }
    if (typeof filters.month === 'number' && item.month !== filters.month) {
      return false;
    }
    if (typeof filters.day === 'number' && item.day !== filters.day) {
      return false;
    }
    if (filters.user && item.userDisplayName !== filters.user) {
      return false;
    }
    if (filters.site && item.siteName !== filters.site) {
      return false;
    }
    return true;
  });

  const grouped = new Map<string, LogRecord[]>();
  for (const item of filtered) {
    const group = grouped.get(item.userDisplayName) ?? [];
    group.push(item.logRecord);
    grouped.set(item.userDisplayName, group);
  }

  const rows: ReportRowWithUser[] = [];
  for (const [userDisplayName, groupLogs] of grouped.entries()) {
    const pairedRows = pairLogsByDay(groupLogs);
    for (const row of pairedRows) {
      rows.push({
        ...row,
        userDisplayName,
      });
    }
  }

  rows.sort((a, b) => {
    const dateA = a.year * 10000 + a.month * 100 + a.day;
    const dateB = b.year * 10000 + b.month * 100 + b.day;
    if (dateA !== dateB) {
      return dateB - dateA;
    }
    const userCompare = a.userDisplayName.localeCompare(b.userDisplayName, 'ja');
    if (userCompare !== 0) {
      return userCompare;
    }
    return a.siteName.localeCompare(b.siteName, 'ja');
  });

  return {
    rows,
    options: {
      years: Array.from(yearSet).sort((a, b) => a - b),
      months: Array.from(monthSet).sort((a, b) => a - b),
      days: Array.from(daySet).sort((a, b) => a - b),
      users: Array.from(userSet).sort((a, b) => a.localeCompare(b, 'ja')),
      sites: Array.from(siteSet).sort((a, b) => a.localeCompare(b, 'ja')),
    },
  };
}

/**
 * @deprecated ユーザーリンク依存のため `getReportRowsByFilters` の使用を推奨します。
 */
export async function getReportRowsByUserName(
  userName: string,
  sort?: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Promise<ReportRow[]> {
  const { rows } = await getReportRowsByFilters({ user: userName });
  const baseRows = rows.map<ReportRow>((row) => ({
    year: row.year,
    month: row.month,
    day: row.day,
    siteName: row.siteName,
    clientName: row.clientName,
    minutes: row.minutes,
  }));

  if (!sort) {
    return baseRows;
  }

  const sortedRows = [...baseRows].sort((a, b) => {
    const aValue = a[sort];
    const bValue = b[sort];
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const result = aValue.localeCompare(bValue, 'ja');
      return order === 'desc' ? -result : result;
    }
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      const result = aValue - bValue;
      return order === 'desc' ? -result : result;
    }
    return 0;
  });

  return sortedRows;
}

/** @deprecated 互換用。`getReportRowsByUserName` を利用してください。 */
export async function getReportRowsByUserNameDeprecated(userName: string) {
  return getReportRowsByUserName(userName);
}
