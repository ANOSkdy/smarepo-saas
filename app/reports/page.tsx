import Link from 'next/link';

import ReportsTabs from '@/components/reports/ReportsTabs';
import { usersTable } from '@/lib/airtable';
import type { ReportRow } from '@/lib/reports/pair';
import { getReportRowsByUserName } from '@/lib/services/reports';

import './print.css';

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

  const reportTitle = filters.user ? `${filters.user}さんの個別集計レポート` : '個別集計レポート';
  const printedAt = new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 print:m-0 print:max-w-none print:space-y-4 print:bg-white print:p-0">
      <div className="print:hidden">
        <ReportsTabs />
      </div>
      <header className="space-y-2 print:space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">個別集計</h1>
        <p className="text-sm text-gray-600">従業員ごとの IN/OUT ペアリングから稼働時間を算出します。</p>
      </header>

      <section className="hidden border-b border-gray-200 pb-4 print:block">
        <div className="flex flex-col justify-between gap-1 text-xs text-gray-600 print:flex-row print:items-end print:text-[11pt]">
          <span className="font-semibold text-gray-800 print:text-[12pt]">{reportTitle}</span>
          <span>出力日時: {printedAt}</span>
        </div>
        {filters.user && (
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[10pt] text-gray-600">
            <div>
              <dt className="font-medium text-gray-700">従業員</dt>
              <dd>{filters.user}</dd>
            </div>
            {filters.site && (
              <div>
                <dt className="font-medium text-gray-700">現場名</dt>
                <dd>{filters.site}</dd>
              </div>
            )}
            {filters.year && (
              <div>
                <dt className="font-medium text-gray-700">年</dt>
                <dd>{filters.year}</dd>
              </div>
            )}
            {filters.month && (
              <div>
                <dt className="font-medium text-gray-700">月</dt>
                <dd>{filters.month}</dd>
              </div>
            )}
            {filters.day && (
              <div>
                <dt className="font-medium text-gray-700">日</dt>
                <dd>{filters.day}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 print:hidden" method="get">
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

      <div className="flex items-center justify-between text-xs text-gray-500 print:hidden">
        <span>※ ソート機能は提供していません。上部のフィルターで条件を指定してください。</span>
        <Link href="/reports" className="text-indigo-600 underline">
          条件をクリア
        </Link>
      </div>

      {filters.user && (
        <section className="overflow-x-auto print:overflow-visible">
          <table className="min-w-full divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 print:min-w-0 print:border print:text-[11pt]">
            <thead className="bg-gray-50 print:bg-white">
              <tr className="text-sm text-gray-700 print:text-[11pt]">
                <th scope="col" className="px-4 py-3 text-left font-semibold print:px-3 print:py-2">
                  年
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold print:px-3 print:py-2">
                  月
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold print:px-3 print:py-2">
                  日
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold print:px-3 print:py-2">
                  現場名
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold print:px-3 print:py-2">
                  元請・代理人
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold print:px-3 print:py-2">
                  稼働時間
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-900 print:text-[10pt]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500 print:px-3 print:py-4">
                    条件に一致するデータがありません。
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr
                    key={`${row.year}-${row.month}-${row.day}-${row.siteName}-${index}`}
                    className="odd:bg-white even:bg-gray-50 print:break-inside-avoid"
                  >
                    <td className="px-4 py-3 print:px-3 print:py-2">{row.year}</td>
                    <td className="px-4 py-3 print:px-3 print:py-2">{row.month}</td>
                    <td className="px-4 py-3 print:px-3 print:py-2">{row.day}</td>
                    <td className="px-4 py-3 print:px-3 print:py-2">{row.siteName}</td>
                    <td className="px-4 py-3 print:px-3 print:py-2">{row.clientName ?? ''}</td>
                    <td className="px-4 py-3 font-mono text-sm print:px-3 print:py-2 print:text-[10pt]">
                      {formatMinutes(row.minutes)}
                    </td>
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
