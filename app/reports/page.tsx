import Link from 'next/link';

import { usersTable } from '@/lib/airtable';
import type { ReportRow } from '@/lib/reports/pair';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

type SearchParams = Record<string, string | string[] | undefined>;

async function fetchUsers(): Promise<string[]> {
  const records = await usersTable
    .select({ fields: ['name'], sort: [{ field: 'name', direction: 'asc' }] })
    .all();
  const names = new Set<string>();
  for (const record of records) {
    const name = typeof record.fields.name === 'string' ? record.fields.name : null;
    if (name) {
      names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ja'));
}

function resolveBaseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

async function fetchReport(
  userName: string,
  sort?: SortKey,
  order?: 'asc' | 'desc'
): Promise<ReportRow[]> {
  const baseUrl = resolveBaseUrl();
  const url = new URL('/api/reports', baseUrl);
  url.searchParams.set('userName', userName);
  if (sort) {
    url.searchParams.set('sort', sort);
  }
  if (order) {
    url.searchParams.set('order', order);
  }
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as { rows?: ReportRow[] };
  return Array.isArray(data.rows) ? data.rows : [];
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function toSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function createSortLink(
  field: SortKey,
  userName: string,
  currentSort: SortKey | '',
  currentOrder: 'asc' | 'desc'
): string {
  const params = new URLSearchParams();
  if (userName) {
    params.set('userName', userName);
  }
  params.set('sort', field);
  const nextOrder = currentSort === field ? (currentOrder === 'asc' ? 'desc' : 'asc') : 'asc';
  params.set('order', nextOrder);
  return `?${params.toString()}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const users = await fetchUsers();
  const userName = toSingleValue(searchParams.userName).trim();
  const sortParam = toSingleValue(searchParams.sort).trim();
  const orderParam = toSingleValue(searchParams.order).trim().toLowerCase();
  const sort: SortKey | '' =
    sortParam === 'year' || sortParam === 'month' || sortParam === 'day' || sortParam === 'siteName'
      ? (sortParam as SortKey)
      : '';
  const order: 'asc' | 'desc' = orderParam === 'desc' ? 'desc' : 'asc';

  const rows = userName ? await fetchReport(userName, sort || undefined, order) : [];

  const sortLabel = (field: SortKey) => {
    if (sort !== field) return '↕';
    return order === 'asc' ? '↑' : '↓';
  };

  const headerLabels: Record<SortKey, string> = {
    year: '年',
    month: '月',
    day: '日',
    siteName: '現場名',
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">レポート</h1>
        <p className="text-sm text-gray-600">従業員ごとの IN/OUT ペアリングから稼働時間を算出します。</p>
      </header>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4" method="get">
        <div className="flex flex-col">
          <label htmlFor="userName" className="text-sm font-medium text-gray-700">
            従業員名
          </label>
          <select
            id="userName"
            name="userName"
            defaultValue={userName}
            className="mt-1 min-w-[200px] rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-describedby="userName-helper"
          >
            <option value="">-- 選択してください --</option>
            {users.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <span id="userName-helper" className="mt-1 text-xs text-gray-500">
            対象の従業員を選ぶとグリッドが表示されます。
          </span>
        </div>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="order" value={order} />
        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          適用
        </button>
      </form>

      {userName && (
        <section className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
            <thead className="bg-gray-50">
              <tr className="text-sm text-gray-700">
                {(['year', 'month', 'day', 'siteName'] as const).map((field) => (
                  <th key={field} scope="col" className="px-4 py-3 text-left font-semibold">
                    <div className="flex items-center gap-2">
                      <span>{headerLabels[field]}</span>
                      <Link
                        href={createSortLink(field, userName, sort, order)}
                        className="rounded border border-transparent px-1 py-0.5 text-xs text-indigo-600 transition hover:border-indigo-200 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        aria-label={`${headerLabels[field]}でソート`}
                      >
                        {sortLabel(field)}
                      </Link>
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  元請・代理人
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  稼働時間
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-900">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                    データがありません。
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.year}-${row.month}-${row.day}-${index}`} className="odd:bg-white even:bg-gray-50">
                    <td className="px-4 py-3">{row.year}</td>
                    <td className="px-4 py-3">{row.month}</td>
                    <td className="px-4 py-3">{row.day}</td>
                    <td className="px-4 py-3">{row.siteName}</td>
                    <td className="px-4 py-3">{row.clientName ?? ''}</td>
                    <td className="px-4 py-3 font-mono text-sm">{formatMinutes(row.minutes)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
