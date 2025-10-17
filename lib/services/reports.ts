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

  const userId = userRec.id;
  const logRecords = await logsTable
    .select({
      filterByFormula: `FIND("${userId}", ARRAYJOIN({user}))`,
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
