export const LOGS_TABLE = process.env.AIRTABLE_TABLE_LOGS ?? 'Logs';

export const LOG_FIELDS = {
  user: 'user',
  userName: 'userName',
  username: 'username',
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
