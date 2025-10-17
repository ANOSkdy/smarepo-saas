import type { FieldSet, Record as AirtableRecord, Table } from 'airtable';
import { auth } from '@/lib/auth';
import { getBase, withRetry } from '@/lib/airtable';
import ReportsClient from './ReportsClient';
import {
  pairLogsToSessions,
  type LogRec,
  type SessionRow,
} from '@/lib/reporting/pairLogsToSessions';

export const runtime = 'nodejs';

type SearchParams = Record<string, string | string[] | undefined>;

type UserOption = {
  id: string;
  name: string;
};

const USERS_TABLE = process.env.AIRTABLE_TABLE_USERS ?? 'Users';
const LOGS_TABLE = process.env.AIRTABLE_TABLE_LOGS ?? 'Logs';

const base = getBase();

function toSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function resolveLookbackDays(searchParams: SearchParams): number {
  const raw = Number.parseInt(toSingleValue(searchParams.days).trim(), 10);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(raw, 365);
  }
  return 90;
}

async function fetchUsers(): Promise<UserOption[]> {
  const table = base(USERS_TABLE) as Table<FieldSet>;
  const records = await withRetry(() =>
    table
      .select({
        fields: ['name', 'active'],
        filterByFormula: "OR({active}=1, {active}='1')",
        sort: [{ field: 'name', direction: 'asc' }],
      })
      .all(),
  );

  return records
    .map((record) => ({
      id: record.id,
      name: typeof record.fields.name === 'string' ? record.fields.name : '',
    }))
    .filter((user): user is UserOption => Boolean(user.name));
}

function mapLogRecord(record: AirtableRecord<FieldSet>): LogRec | null {
  const timestamp = record.get('timestamp');
  const type = record.get('type');
  if (typeof timestamp !== 'string' || (type !== 'IN' && type !== 'OUT')) {
    return null;
  }

  const siteNameRaw = record.get('siteName');
  const siteName =
    typeof siteNameRaw === 'string'
      ? siteNameRaw
      : Array.isArray(siteNameRaw)
        ? siteNameRaw.join(', ')
        : undefined;
  const workDescriptionRaw = record.get('workDescription');
  const workDescription =
    typeof workDescriptionRaw === 'string' ? workDescriptionRaw : undefined;

  const normalizedType = type as 'IN' | 'OUT';

  return {
    id: record.id,
    fields: {
      timestamp,
      type: normalizedType,
      siteName,
      workDescription,
    },
  };
}

async function fetchLogsByUserRecId(userRecId: string, days: number): Promise<LogRec[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const filter = `AND(
    FIND('${userRecId}', ARRAYJOIN({user})),
    IS_AFTER({timestamp}, '${sinceIso}')
  )`;
  const table = base(LOGS_TABLE) as Table<FieldSet>;
  const records = await withRetry(() =>
    table
      .select({
        filterByFormula: filter,
        sort: [{ field: 'timestamp', direction: 'asc' }],
        maxRecords: 5000,
        fields: ['timestamp', 'type', 'siteName', 'workDescription'],
      })
      .all(),
  );

  return records
    .map((record) => mapLogRecord(record))
    .filter((log): log is LogRec => Boolean(log));
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const users = await fetchUsers();
  const lookbackDays = resolveLookbackDays(searchParams);

  const requestedUser = toSingleValue(searchParams.user).trim();
  const sessionUserId = session?.user?.id ?? '';
  const fallbackUserId = users[0]?.id ?? '';
  const selectedUser =
    requestedUser && users.some((user) => user.id === requestedUser)
      ? requestedUser
      : users.some((user) => user.id === sessionUserId)
        ? sessionUserId
        : fallbackUserId;

  let rows: SessionRow[] = [];
  if (selectedUser) {
    const logs = await fetchLogsByUserRecId(selectedUser, lookbackDays);
    rows = pairLogsToSessions(logs);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">レポート</h1>
        <p className="text-sm text-gray-600">
          従業員ごとの IN/OUT ペアリングから稼働時間を算出します。
        </p>
      </header>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4" method="get">
        <div className="flex flex-col">
          <label htmlFor="user" className="text-sm font-medium text-gray-700">
            従業員名
          </label>
          <select
            id="user"
            name="user"
            defaultValue={selectedUser}
            className="mt-1 min-w-[200px] rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-describedby="user-helper"
          >
            <option value="">-- 選択してください --</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <span id="user-helper" className="mt-1 text-xs text-gray-500">
            対象の従業員を選ぶとグリッドが表示されます。
          </span>
        </div>
        <input type="hidden" name="days" value={String(lookbackDays)} />
        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          適用
        </button>
      </form>

      {selectedUser && <ReportsClient rows={rows} />}
    </main>
  );
}
