import { logsTable, usersTable } from '@/lib/airtable';
import {
  LOG_FIELDS,
  LOGS_FIELDS,
  buildLookupEqualsIgnoreCase,
  buildUserFilterById,
  buildUserFilterByName,
  escapeAirtable,
} from '@/lib/airtable/schema';
import { pairLogsByDay, type LogRecord, type ReportRow } from '@/lib/reports/pair';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

const LOG_SELECT_FIELDS = ['type', 'timestamp', 'date', 'siteName', 'clientName', 'user'] as const;

export async function getReportRowsByUserName(
  userName: string,
  sort?: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Promise<ReportRow[]> {
  const escapedUserName = escapeAirtable(userName);
  const users = await usersTable
    .select({ filterByFormula: `{name} = '${escapedUserName}'`, maxRecords: 1 })
    .firstPage();
  const userRec = users?.[0];
  if (!userRec) return [];

  const userFields = userRec.fields as Record<string, unknown>;
  const filterParts = new Set<string>();

  const recordId = userRec.id;
  filterParts.add(`FIND('${escapeAirtable(recordId)}', ARRAYJOIN({${LOG_FIELDS.user}}))`);

  const pushEqualityFilter = (builder: (value: string) => string, rawValue: unknown) => {
    if (typeof rawValue !== 'string') return;
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    filterParts.add(builder(trimmed));
  };

  const pushLookupFilter = (fieldName: string, rawValue: unknown) => {
    if (typeof rawValue !== 'string') return;
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    filterParts.add(buildLookupEqualsIgnoreCase(fieldName, trimmed));
  };

  pushEqualityFilter(buildUserFilterByName, userFields.name as string | undefined);
  pushEqualityFilter(buildUserFilterById, userFields.userId as string | undefined);

  pushLookupFilter(LOGS_FIELDS.userNameLookup, userFields.name as string | undefined);
  pushLookupFilter(LOGS_FIELDS.userIdLookup, userFields.userId as string | undefined);

  const filterExpressions = Array.from(filterParts);
  const filterByFormula =
    filterExpressions.length === 1 ? filterExpressions[0] : `OR(${filterExpressions.join(', ')})`;

  const selectFields = [...LOG_SELECT_FIELDS];

  const logRecords = await logsTable
    .select({
      filterByFormula,
      fields: selectFields,
    })
    .all()
    .catch((error) => {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? (error as { statusCode?: number }).statusCode
          : undefined;

      if (statusCode === 422) {
        console.error('reports.filter.invalid', {
          formula: filterByFormula,
          fields: LOG_SELECT_FIELDS,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : error,
        });
      }

      throw error;
    });

  const paired = pairLogsByDay(
    logRecords.map<LogRecord>((record) => ({
      id: record.id,
      fields: record.fields as unknown as LogRecord['fields'],
    })),
  );

  if (sort) {
    const dir = order === 'desc' ? -1 : 1;
    paired.sort((a, b) => {
      const aValue = a[sort];
      const bValue = b[sort];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const result = aValue.localeCompare(bValue, 'ja');
        return dir === 1 ? result : -result;
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        const result = aValue - bValue;
        return dir === 1 ? result : -result;
      }
      return 0;
    });
  }

  return paired;
}
