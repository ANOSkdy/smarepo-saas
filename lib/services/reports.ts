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
  const filterParts: string[] = [];

  const recordId = userRec.id;
  filterParts.push(`FIND("${escapeFormulaValue(recordId)}", ARRAYJOIN({user}))`);

  const userIdField = typeof userFields.userId === 'string' ? userFields.userId : null;
  if (userIdField && userIdField.trim().length > 0) {
    const escaped = escapeFormulaValue(userIdField.trim());
    filterParts.push(`{userId} = "${escaped}"`);
  }

  const usernameField = typeof userFields.username === 'string' ? userFields.username : null;
  if (usernameField && usernameField.trim().length > 0) {
    const escaped = escapeFormulaValue(usernameField.trim());
    filterParts.push(`{username} = "${escaped}"`);
  }

  const nameField = typeof userFields.name === 'string' ? userFields.name : null;
  if (nameField && nameField.trim().length > 0) {
    const escaped = escapeFormulaValue(nameField.trim());
    filterParts.push(`{userName} = "${escaped}"`);
  }

  const emailFieldRaw = userFields.email;
  if (typeof emailFieldRaw === 'string' && emailFieldRaw.trim().length > 0) {
    const emailLower = emailFieldRaw.trim().toLowerCase();
    const escapedLower = escapeFormulaValue(emailLower);
    filterParts.push(`LOWER({userEmail} & "") = "${escapedLower}"`);
    filterParts.push(`LOWER({email} & "") = "${escapedLower}"`);
  }

  const filterByFormula = filterParts.length === 1 ? filterParts[0] : `OR(${filterParts.join(', ')})`;

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
