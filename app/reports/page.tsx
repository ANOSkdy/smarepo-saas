import Link from 'next/link';

import {
  getReportRowsByFilters,
  type ReportFilters,
  type ReportFilterOptions,
  type ReportRowWithUser,
} from '@/lib/services/reports';

type SearchParams = Record<string, string | string[] | undefined>;

type FilterParams = ReportFilters;

function toNumber(value: string | string[] | undefined): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toStringValue(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function isFiltersEmpty(filters: FilterParams): boolean {
  return (
    filters.year === undefined &&
    filters.month === undefined &&
    filters.day === undefined &&
    filters.user === undefined &&
    filters.site === undefined
  );
}

function FiltersForm({ filters, options }: { filters: FilterParams; options: ReportFilterOptions }) {
  return (
    <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-user" className="text-sm font-medium text-gray-700">
          従業員
        </label>
        <select
          id="filter-user"
          name="user"
          defaultValue={filters.user ?? ''}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">すべて</option>
          {options.users.map((user) => (
            <option key={user} value={user}>
              {user}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-site" className="text-sm font-medium text-gray-700">
          現場名
        </label>
        <select
          id="filter-site"
          name="site"
          defaultValue={filters.site ?? ''}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">すべて</option>
          {options.sites.map((site) => (
            <option key={site} value={site}>
              {site}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-year" className="text-sm font-medium text-gray-700">
          年
        </label>
        <select
          id="filter-year"
          name="year"
          defaultValue={filters.year ?? ''}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">すべて</option>
          {options.years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-month" className="text-sm font-medium text-gray-700">
          月
        </label>
        <select
          id="filter-month"
          name="month"
          defaultValue={filters.month ?? ''}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">すべて</option>
          {options.months.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-day" className="text-sm font-medium text-gray-700">
          日
        </label>
        <select
          id="filter-day"
          name="day"
          defaultValue={filters.day ?? ''}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">すべて</option>
          {options.days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="w-full rounded border border-indigo-500 bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          絞り込み
        </button>
        <Link
          href="/reports"
          className="hidden rounded border border-transparent px-3 py-2 text-sm text-indigo-600 transition hover:border-indigo-100 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 lg:inline-flex"
        >
          クリア
        </Link>
      </div>
    </form>
  );
}

function ReportsTable({ rows }: { rows: ReportRowWithUser[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 text-sm">
        <thead className="bg-gray-50 text-left font-semibold text-gray-700">
          <tr>
            <th className="px-4 py-3">年</th>
            <th className="px-4 py-3">月</th>
            <th className="px-4 py-3">日</th>
            <th className="px-4 py-3">従業員</th>
            <th className="px-4 py-3">現場名</th>
            <th className="px-4 py-3">元請・代理人</th>
            <th className="px-4 py-3 text-right">稼働時間</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white text-gray-900">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                条件に一致するデータがありません。
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${row.userDisplayName}-${row.year}-${row.month}-${row.day}-${index}`} className="odd:bg-white even:bg-gray-50">
                <td className="px-4 py-3">{row.year}</td>
                <td className="px-4 py-3">{row.month}</td>
                <td className="px-4 py-3">{row.day}</td>
                <td className="px-4 py-3">{row.userDisplayName}</td>
                <td className="px-4 py-3">{row.siteName}</td>
                <td className="px-4 py-3">{row.clientName ?? ''}</td>
                <td className="px-4 py-3 font-mono text-right">{formatMinutes(row.minutes)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ?? {};
  const filters: FilterParams = {
    user: toStringValue(params.user ?? params.userName),
    site: toStringValue(params.site),
    year: toNumber(params.year),
    month: toNumber(params.month),
    day: toNumber(params.day),
  };

  const { rows, options } = await getReportRowsByFilters(filters);
  const hasFilters = !isFiltersEmpty(filters);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">稼働レポート</h1>
        <p className="text-sm text-gray-600">
          Airtable Logs を取得し、IN/OUT のペアリングから稼働時間を集計します。上部のフィルターで条件を指定してください。
        </p>
      </header>

      <section className="space-y-4">
        <FiltersForm filters={filters} options={options} />
        <div className="text-xs text-gray-500">
          <p>従業員リンク未設定でも name → username → userId の順で表示名を復元します。</p>
          <p>date が欠落しているログは JST(+09:00) に補正した timestamp から日付を復元します。</p>
          {!hasFilters && <p>フィルター未指定時は全レコードを対象にペアリングします。</p>}
        </div>
      </section>

      <ReportsTable rows={rows} />
    </main>
  );
}
