import Airtable, { FieldSet, Table } from 'airtable';
import {
  UserFields,
  MachineFields,
  SiteFields,
  WorkTypeFields,
  LogFields,
} from '@/types';

// 環境変数が設定されていない場合にエラーを投げる
if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  throw new Error('Airtable API Key or Base ID is not defined in .env.local');
}

// Airtableの基本設定を初期化
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

// 型付けされたテーブルを返すヘルパー関数
const getTypedTable = <T extends FieldSet>(tableName: string): Table<T> => {
  return base(tableName);
};

// 各テーブルをエクスポート
export const usersTable = getTypedTable<UserFields>('Users');
export const machinesTable = getTypedTable<MachineFields>('Machines');
export const sitesTable = getTypedTable<SiteFields>('Sites');
export const workTypesTable = getTypedTable<WorkTypeFields>('WorkTypes');
export const logsTable = getTypedTable<LogFields>('Logs');