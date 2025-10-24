import Link from 'next/link';
import ReportsTabs from '@/components/reports/ReportsTabs';
import { usersTable } from '@/lib/airtable';
import type { ReportRow } from '@/lib/reports/pair';
import { getReportRowsByUserName } from '@/lib/services/reports';

import PrintA4Button from '@/components/PrintA4Button';

import './print-a4.css';

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

function formatWorkingHours(minutes: number): string {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const capped = Math.min(safe, 450);
  const hours = capped / 60;
  return `${hours.toFixed(1)}h`;
}

function toSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function toNumberValue(value: string | string[] | undefined): number | undefined {
  const single = toSingleValue(value).trim();
  if (!single) return undefined;
  const parsed = Number.parseInt(single, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type Filters = {
  user: string;
  site: string;
  year?: number;
  month?: number;
  day?: number;
};

export default async function ReportsPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ?? {};
  const filters: Filters = {
    user: toSingleValue(params.user).trim(),
    site: toSingleValue(params.site).trim(),
    year: toNumberValue(params.year),
    month: toNumberValue(params.month),
    day: toNumberValue(params.day),
  };

  const users = await fetchUsers();
  const rowsRaw: ReportRow[] = filters.user ? await getReportRowsByUserName(filters.user) : [];

  const filteredRows = rowsRaw.filter((row) => {
    if (filters.year && row.year !== filters.year) return false;
    if (filters.month && row.month !== filters.month) return false;
    if (filters.day && row.day !== filters.day) return false;
    if (filters.site && row.siteName !== filters.site) return false;
    return true;
  });

  const availableYears = Array.from(new Set(rowsRaw.map((row) => row.year))).sort((a, b) => a - b);
  const availableMonths = Array.from(new Set(rowsRaw.map((row) => row.month))).sort((a, b) => a - b);
  const availableDays = Array.from(new Set(rowsRaw.map((row) => row.day))).sort((a, b) => a - b);
  const availableSites = Array.from(
    new Set(rowsRaw.map((row) => row.siteName).filter((name): name is string => Boolean(name && name.trim()))),
  ).sort((a, b) => a.localeCompare(b, 'ja'));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ReportsTabs />
      <div className="report-print space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900">個別集計</h1>
          <p className="text-sm text-gray-600">従業員ごとの IN/OUT ペアリングから稼働時間を算出します。</p>
        </header>

        <div className="_print-toolbar _print-hidden">
          <PrintA4Button />
        </div>

        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6" method="get">
          <div className="flex flex-col">
            <label htmlFor="user" className="text-sm font-medium text-gray-700">
              従業員名
            </label>
            <select
              id="user"
              name="user"
              defaultValue={filters.user}
              className="mt-1 min-w-[200px] rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-describedby="user-helper"
            >
              <option value="">-- 選択してください --</option>
              {users.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span id="user-helper" className="mt-1 text-xs text-gray-500">
              対象の従業員を選ぶとグリッドが表示されます。
            </span>
          </div>

          <div className="flex flex-col">
            <label htmlFor="site" className="text-sm font-medium text-gray-700">
              現場名
            </label>
            <select
              id="site"
              name="site"
              defaultValue={filters.site}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableSites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="year" className="text-sm font-medium text-gray-700">
              年
            </label>
            <select
              id="year"
              name="year"
              defaultValue={filters.year?.toString() ?? ''}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="month" className="text-sm font-medium text-gray-700">
              月
            </label>
            <select
              id="month"
              name="month"
              defaultValue={filters.month?.toString() ?? ''}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="day" className="text-sm font-medium text-gray-700">
              日
            </label>
            <select
              id="day"
              name="day"
              defaultValue={filters.day?.toString() ?? ''}
              disabled={!filters.user}
              className="mt-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="">-- すべて --</option>
              {availableDays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded border border-indigo-500 bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              絞り込み
            </button>
          </div>
        </form>

        <div className="flex items-center justify-between text-xs text-gray-500 _print-hidden">
          <span>※ ソート機能は提供していません。上部のフィルターで条件を指定してください。</span>
          <Link href="/reports" className="text-indigo-600 underline">
            条件をクリア
          </Link>
        </div>

        {filters.user && (
          <section className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-sm text-gray-700">
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    年
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    月
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    日
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    現場名
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    元請・代理人
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    始業時間
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    終業時間
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    稼働時間
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    超過
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-900">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
                      条件に一致するデータがありません。
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => (
                    <tr
                      key={`${row.year}-${row.month}-${row.day}-${row.siteName}-${index}`}
                      className="odd:bg-white even:bg-gray-50"
                    >
                      <td className="px-4 py-3">{row.year}</td>
                      <td className="px-4 py-3">{row.month}</td>
                      <td className="px-4 py-3">{row.day}</td>
                      <td className="px-4 py-3">{row.siteName}</td>
                      <td className="px-4 py-3">{row.clientName ?? '-'}</td>
                      <td className="px-4 py-3">{row.startJst ?? ''}</td>
                      <td className="px-4 py-3">{row.endJst ?? ''}</td>
                      <td className="px-4 py-3">{formatWorkingHours(row.minutes)}</td>
                      <td className="px-4 py-3">{row.overtimeHours ?? '0.0h'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
