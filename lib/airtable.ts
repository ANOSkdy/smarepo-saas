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
// ... (既存のコード) ...

// machineid(URLのパラメータ)を使って機械レコードを1件取得する関数
export const getMachineById = async (machineId: string) => {
  try {
    const records = await machinesTable
      .select({
        filterByFormula: `{machineid} = '${machineId}'`,
        maxRecords: 1,
      })
      .firstPage();
    return records[0] || null;
  } catch (error) {
    console.error('Error fetching machine by ID:', error);
    throw error;
  }
};