import Airtable, { FieldSet, Table } from 'airtable';
import {
  UserFields,
  MachineFields,
  SiteFields,
  WorkTypeFields,
  LogFields,
} from '@/types';
import { logger } from './logger';

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    logger.warn('withRetry retrying after error', {
      retriesLeft: retries,
      delay,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : error,
    });
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

export const LOGS_TABLE = 'Logs';
export const MACHINES_TABLE = 'Machines';
export const WORKTYPES_TABLE = 'WorkTypes';

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID;

if (!apiKey || !baseId) {
  throw new Error(
    [
      'Airtable env missing.',
      `AIRTABLE_API_KEY=${apiKey ? '[set]' : '[missing]'}`,
      `AIRTABLE_BASE_ID=${baseId ? '[set]' : '[missing]'}`,
    ].join(' ')
  );
}

export const base = new Airtable({ apiKey }).base(baseId);

export function getBase() {
  return base;
}

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

export const getFirstMachine = async () => {
  try {
    const records = await machinesTable
      .select({
        maxRecords: 1,
        sort: [{ field: 'machineid', direction: 'asc' }],
      })
      .firstPage();
    return records[0] || null;
  } catch (error) {
    console.error('Error fetching first machine:', error);
    throw error;
  }
};
// ... (既存の airtable, tables, getMachineById などの定義) ...

// ユーザーのレコードIDとJSTでの今日の日付を元に、当日のログを取得する関数
export const getTodayLogs = async (userRecordId: string) => {
  // JSTで今日の日付 (YYYY-MM-DD) を取得
  const todayJST = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-');

  try {
    const records = await logsTable
      .select({
        // まず日付で絞り込む
        filterByFormula: `{date} = '${todayJST}'`,
        // 時刻順で並び替え
        sort: [{ field: 'timestamp', direction: 'asc' }],
      })
      .all();

    // Airtableのuser(Link to Record)フィールドはレコードIDの配列なので、
    // 取得したレコードから、さらに対象ユーザーのログのみを絞り込む
    return records.filter(
      (record) =>
        record.fields.user && record.fields.user.includes(userRecordId)
    );
  } catch (error) {
    console.error('Error fetching today logs:', error);
    throw error;
  }
};
