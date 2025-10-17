// Logs テーブルのみを利用し、旧 Session / ReportIndex テーブルは廃止済み。
export const LOGS_TABLE = process.env.AIRTABLE_TABLE_LOGS ?? 'Logs';

export const LOG_FIELDS = {
  user: 'user',
  userName: 'userName',
  username: 'username',
  userId: 'userId',
  userNameFromUser: 'userName (from user)',
  nameFromUser: 'name (from user)',
  userIdFromUser: 'userId (from user)',
  machine: 'machine',
  machineId: 'machineId',
  machineid: 'machineid',
  machineIdFromMachine: 'machineId (from machine)',
  machineidFromMachine: 'machineid (from machine)',
  machineName: 'machineName',
  machinename: 'machinename',
  machineNameFromMachine: 'machineName (from machine)',
  machinenameFromMachine: 'machinename (from machine)',
  site: 'site',
  siteName: 'siteName',
  type: 'type',
  timestamp: 'timestamp',
  workType: 'workType',
  workDescription: 'workDescription',
  note: 'note',
} as const;

export type LogFieldName = (typeof LOG_FIELDS)[keyof typeof LOG_FIELDS];

export const AIRTABLE_PAGE_SIZE = 100;

export const JST_OFFSET = 9 * 60 * 60 * 1000;

export const LOGS_FIELDS = {
  userNameLookup: LOG_FIELDS.nameFromUser,
  userIdLookup: LOG_FIELDS.userIdFromUser,
  machineIdLookup: LOG_FIELDS.machineIdFromMachine,
} as const;

export const escapeAirtable = (value: string): string => value.replace(/'/g, "\\'");

const wrapWithAnd = (expression: string) => `AND(${expression})`;

export function buildUserFilterByName(name: string): string {
  return wrapWithAnd(`{${LOGS_FIELDS.userNameLookup}}='${escapeAirtable(name)}'`);
}

export function buildUserFilterById(userId: string): string {
  return wrapWithAnd(`{${LOGS_FIELDS.userIdLookup}}='${escapeAirtable(userId)}'`);
}

export function buildMachineFilter(machineId: string): string {
  return wrapWithAnd(`{${LOGS_FIELDS.machineIdLookup}}='${escapeAirtable(machineId)}'`);
}

export function buildLookupEqualsIgnoreCase(field: string, value: string): string {
  const lowered = value.trim().toLowerCase();
  return wrapWithAnd(`LOWER(CONCATENATE({${field}}))='${escapeAirtable(lowered)}'`);
}
