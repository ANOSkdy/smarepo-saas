import type { FieldSet, Record as AirtableRecord, Table } from 'airtable';
import { auth } from '@/lib/auth';
import { getBase, withRetry } from '@/lib/airtable';
import ReportsClient from './ReportsClient';
import {
  pairLogsToSessions,
  type LogRec,
  type SessionRow,
} from '@/lib/reporting/pairLogsToSessions';
import {
  FIELD_ALIASES,
  buildUserIdFilter,
  buildUserNameFilter,
  firstField,
} from '@/lib/airtable/aliases';

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

const LOG_SELECT_FIELDS = Array.from(
  new Set([
    ...FIELD_ALIASES.timestamp,
    ...FIELD_ALIASES.type,
    ...FIELD_ALIASES.siteName,
    ...FIELD_ALIASES.userLink,
    ...FIELD_ALIASES.userName,
    'workDescription',
  ]),
);

function escapeForFormula(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function fetchLogsRobust(
  userRecId: string,
  userName: string,
  days: number,
): Promise<LogRec[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const table = base(LOGS_TABLE) as Table<FieldSet>;

  async function trySelect(filter: string, sortField: string) {
    try {
      return await withRetry(() =>
        table
          .select({
            filterByFormula: filter,
            sort: [{ field: sortField, direction: 'asc' }],
            maxRecords: 5000,
            fields: LOG_SELECT_FIELDS,
          })
          .all(),
      );
    } catch {
      return null;
    }
  }

  // 1) userリンク名を推測してID検索
  for (const userField of FIELD_ALIASES.userLink) {
    for (const timestampField of FIELD_ALIASES.timestamp) {
      const filter = `AND(${buildUserIdFilter(
        userRecId,
        userField,
      )}, IS_AFTER({${timestampField}}, '${sinceIso}'))`;
      const records = await trySelect(filter, timestampField);
      if (records?.length) {
        const mapped = mapLogs(records);
        if (mapped.length) {
          return mapped;
        }
      }
    }
  }

  // 2) user名lookupで検索
  if (userName) {
    const safeName = escapeForFormula(userName);
    for (const nameField of FIELD_ALIASES.userName) {
      for (const timestampField of FIELD_ALIASES.timestamp) {
        const filter = `AND(${buildUserNameFilter(
          safeName,
          nameField,
        )}, IS_AFTER({${timestampField}}, '${sinceIso}'))`;
        const records = await trySelect(filter, timestampField);
        if (records?.length) {
          const mapped = mapLogs(records);
          if (mapped.length) {
            return mapped;
          }
        }
      }
    }
  }

  // 3) 期間のみ取得→サーバ側でリンクID/氏名で絞り込み
  for (const timestampField of FIELD_ALIASES.timestamp) {
    const filter = `IS_AFTER({${timestampField}}, '${sinceIso}')`;
    const records = await trySelect(filter, timestampField);
    if (!records?.length) {
      continue;
    }

    const filtered = records.filter((record) => {
      const linkHit = FIELD_ALIASES.userLink.some((field) => {
        const value = record.get(field);
        if (Array.isArray(value)) {
          return value.includes(userRecId);
        }
        if (typeof value === 'string') {
          return value === userRecId;
        }
        return false;
      });

      const nameHit = userName
        ? FIELD_ALIASES.userName.some((field) => {
            const value = record.get(field);
            if (Array.isArray(value)) {
              return value.includes(userName);
            }
            if (typeof value === 'string') {
              const candidates = value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
              return candidates.includes(userName) || value === userName;
            }
            return false;
          })
        : false;

      return linkHit || nameHit;
    });

    if (filtered.length) {
      const mapped = mapLogs(filtered);
      if (mapped.length) {
        return mapped;
      }
    }
  }

  return [];
}

// Airtableのselect().all()は readonly 配列(Records<FieldSet>)を返すため、
// 受け口を readonly で受けつつ、必須フィールド欠落行はスキップして LogRec[] のみ返す。
function mapLogs(records: readonly AirtableRecord<FieldSet>[]): LogRec[] {
  const logs: LogRec[] = [];
  for (const record of records) {
    const getValue = (key: string) => record.get(key);
    const timestampRaw = firstField<unknown>(getValue, FIELD_ALIASES.timestamp);
    const typeRaw = firstField<unknown>(getValue, FIELD_ALIASES.type);

    if (!timestampRaw || typeRaw == null) {
      continue;
    }

    const normalizedType = String(typeRaw).toUpperCase();
    if (normalizedType !== 'IN' && normalizedType !== 'OUT') {
      continue;
    }

    let timestamp: string;
    if (typeof timestampRaw === 'string') {
      timestamp = timestampRaw;
    } else if (timestampRaw instanceof Date) {
      timestamp = timestampRaw.toISOString();
    } else {
      timestamp = String(timestampRaw);
    }

    if (!timestamp) {
      continue;
    }

    const siteNameRaw = firstField<unknown>(getValue, FIELD_ALIASES.siteName);
    let siteName = '';
    if (Array.isArray(siteNameRaw)) {
      siteName = siteNameRaw.join(', ');
    } else if (typeof siteNameRaw === 'string') {
      siteName = siteNameRaw;
    } else if (siteNameRaw != null) {
      siteName = String(siteNameRaw);
    }

    const workDescriptionRaw = record.get('workDescription');
    const workDescription =
      typeof workDescriptionRaw === 'string' ? workDescriptionRaw : undefined;

    logs.push({
      id: record.id,
      fields: {
        timestamp,
        type: normalizedType as 'IN' | 'OUT',
        siteName,
        workDescription,
      },
    });
  }

  return logs;
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
    const selectedUserName =
      users.find((user) => user.id === selectedUser)?.name ??
      session?.user?.name ??
      '';
    const logs = await fetchLogsRobust(selectedUser, selectedUserName, lookbackDays);
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
