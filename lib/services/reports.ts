import { logsTable, usersTable } from '@/lib/airtable';
import { pairLogsByDay, type LogRecord, type ReportRow } from '@/lib/reports/pair';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

function escapeFormulaValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

export async function getReportRowsByUserName(
  userName: string,
  sort?: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Promise<ReportRow[]> {
  const escapedUserName = escapeFormulaValue(userName);
  const users = await usersTable
    .select({ filterByFormula: `{name} = "${escapedUserName}"`, maxRecords: 1 })
    .firstPage();
  const userRec = users?.[0];
  if (!userRec) return [];

  const userFields = userRec.fields as Record<string, unknown>;
  const filterParts = new Set<string>();

  const recordId = userRec.id;
  filterParts.add(`FIND("${escapeFormulaValue(recordId)}", ARRAYJOIN({user}))`);

  const pushTextMatch = (fieldName: string, rawValue: unknown) => {
    if (typeof rawValue !== 'string') return;
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) return;
    const escaped = escapeFormulaValue(normalized);
    filterParts.add(`LOWER({${fieldName}} & "") = "${escaped}"`);
  };

  const pushLookupMatch = (fieldName: string, rawValue: unknown) => {
    if (typeof rawValue !== 'string') return;
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) return;
    const escaped = escapeFormulaValue(normalized);
    filterParts.add(`IFERROR(FIND("${escaped}", LOWER(CONCATENATE({${fieldName}}))), 0) > 0`);
  };

  pushTextMatch('userId', userFields.userId);
  pushTextMatch('username', userFields.username);
  pushTextMatch('userName', userFields.name);
  pushTextMatch('email', userFields.email);

  pushLookupMatch('userName (from user)', userFields.name ?? userFields.username);
  pushLookupMatch('name (from user)', userFields.name);

  const filterExpressions = Array.from(filterParts);
  const filterByFormula =
    filterExpressions.length === 1 ? filterExpressions[0] : `OR(${filterExpressions.join(', ')})`;

  const logRecords = await logsTable
    .select({
      filterByFormula,
      fields: ['type', 'timestamp', 'date', 'siteName', 'clientName', 'user'],
    })
    .all();

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
