'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import NavTabs from '@/components/NavTabs';

type DayRow = {
  day: string;
  totalMins: number;
  breakdown: Record<string, number>;
};

type ReportRow = {
  userKey: string;
  days: DayRow[];
  unmatchedCount: number;
};

type ApiResponse = {
  result: ReportRow[];
};

function formatHours(mins: number): string {
  return (mins / 60).toFixed(2);
}

function toCsv(rows: ReportRow[]): string {
  const header = ['userKey', 'day', 'totalMins', 'totalHours', 'breakdown(site/machine:mins)'];
  const lines = [header.join(',')];
  for (const row of rows) {
    if (row.days.length === 0) {
      lines.push([row.userKey, '', '0', '0.00', ''].join(','));
      continue;
    }
    for (const day of row.days) {
      const breakdown = Object.entries(day.breakdown)
        .map(([key, value]) => `${key}:${value}`)
        .join(' | ');
      lines.push(
        [row.userKey, day.day, String(day.totalMins), formatHours(day.totalMins), `"${breakdown}"`].join(',')
      );
    }
  }
  return lines.join('\n');
}

type SortKey = 'user-asc' | 'total-desc';

export default function WorkReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [user, setUser] = useState('');
  const [site, setSite] = useState('');
  const [machine, setMachine] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('user-asc');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('year', String(year));
    params.set('month', String(month));
    if (user.trim()) params.set('user', user.trim());
    if (site.trim()) params.set('site', site.trim());
    if (machine.trim()) params.set('machine', machine.trim());
    return params.toString();
  }, [year, month, user, site, machine]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/work?${queryString}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? 'fetch failed');
      }
      setData(json as ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedRows = useMemo<ReportRow[]>(() => {
    if (!data?.result) {
      return [];
    }
    const rows = [...data.result];
    if (sortKey === 'user-asc') {
      rows.sort((a, b) => (a.userKey ?? '').localeCompare(b.userKey ?? ''));
    } else if (sortKey === 'total-desc') {
      const getTotal = (row: ReportRow) =>
        row.days.reduce((sum, day) => sum + day.totalMins, 0);
      rows.sort((a, b) => getTotal(b) - getTotal(a));
    }
    return rows;
  }, [data, sortKey]);

  const csvContent = useMemo(() => (sortedRows.length ? toCsv(sortedRows) : ''), [sortedRows]);
  const hasData = sortedRows.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <NavTabs />
      <header className="space-y-1">
        <p className="text-sm font-medium text-primary">稼働ログ分析</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">月次稼働集計（Logsのみ）</h1>
        <p className="text-sm text-muted-foreground">
          月次の打刻ログからユーザー別・日別の稼働時間を集計し、現場と機械の内訳を確認できます。
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded border border-border bg-card p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="work-report-year">
            年
          </label>
          <input
            type="number"
            className="mt-1 w-24 rounded border border-input px-2 py-1 text-sm"
            value={year}
            min={2000}
            id="work-report-year"
            onChange={(event) => setYear(Number(event.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="work-report-month">
            月
          </label>
          <input
            type="number"
            className="mt-1 w-20 rounded border border-input px-2 py-1 text-sm"
            value={month}
            min={1}
            max={12}
            id="work-report-month"
            onChange={(event) => setMonth(Number(event.target.value))}
          />
        </div>
        <div className="flex flex-col">
          <label
            className="block text-xs font-medium text-muted-foreground"
            htmlFor="work-report-user"
          >
            ユーザー（employeeCode / レコードID）
          </label>
          <input
            className="mt-1 w-64 rounded border border-input px-2 py-1 text-sm"
            value={user}
            onChange={(event) => setUser(event.target.value)}
            placeholder="例: EMP001"
            id="work-report-user"
          />
        </div>
        <div className="flex flex-col">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="work-report-site">
            サイト名
          </label>
          <input
            className="mt-1 w-56 rounded border border-input px-2 py-1 text-sm"
            value={site}
            onChange={(event) => setSite(event.target.value)}
            placeholder="例: 東京第一工区"
            id="work-report-site"
          />
        </div>
        <div className="flex flex-col">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="work-report-machine">
            機械ID
          </label>
          <input
            className="mt-1 w-48 rounded border border-input px-2 py-1 text-sm"
            value={machine}
            onChange={(event) => setMachine(event.target.value)}
            placeholder="例: MC-001"
            id="work-report-machine"
          />
        </div>
        <div className="flex flex-col">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="work-report-sort">
            ソート
          </label>
          <select
            id="work-report-sort"
            className="mt-1 w-48 rounded border border-input px-2 py-1 text-sm"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
          >
            <option value="user-asc">ユーザー昇順</option>
            <option value="total-desc">合計時間降順</option>
          </select>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          disabled={loading}
        >
          {loading ? '取得中…' : '再取得'}
        </button>
        {hasData && (
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`}
            download={`work_${year}-${String(month).padStart(2, '0')}.csv`}
            className="rounded border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            CSVダウンロード
          </a>
        )}
        <Link
          href={`/reports/work/print?${queryString}`}
          className="rounded border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          PDF出力（印刷）
        </Link>
      </section>

      {error && <p className="text-sm text-destructive">エラー: {error}</p>}

      <section className="overflow-x-auto rounded border border-border bg-card">
        <table className="min-w-[880px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-medium text-muted-foreground">ユーザー</th>
              <th className="border-b border-border px-3 py-2 text-left font-medium text-muted-foreground">日付</th>
              <th className="border-b border-border px-3 py-2 text-right font-medium text-muted-foreground">合計(分)</th>
              <th className="border-b border-border px-3 py-2 text-right font-medium text-muted-foreground">合計(時間)</th>
              <th className="border-b border-border px-3 py-2 text-left font-medium text-muted-foreground">内訳 (現場 / 機械:分)</th>
              <th className="border-b border-border px-3 py-2 text-right font-medium text-muted-foreground">unmatched</th>
            </tr>
          </thead>
          <tbody>
            {hasData ? (
              sortedRows.flatMap((row) => {
                if (row.days.length === 0) {
                  return (
                    <tr key={`${row.userKey}-empty`} className="odd:bg-background">
                      <td className="border-b border-border px-3 py-2">{row.userKey}</td>
                      <td className="border-b border-border px-3 py-2 text-muted-foreground">-</td>
                      <td className="border-b border-border px-3 py-2 text-right">0</td>
                      <td className="border-b border-border px-3 py-2 text-right">0.00</td>
                      <td className="border-b border-border px-3 py-2 text-muted-foreground">-</td>
                      <td className="border-b border-border px-3 py-2 text-right">{row.unmatchedCount}</td>
                    </tr>
                  );
                }
                return row.days.map((day, index) => (
                  <tr key={`${row.userKey}-${day.day}-${index}`} className={index % 2 === 0 ? 'bg-background' : ''}>
                    <td className="border-b border-border px-3 py-2">{row.userKey}</td>
                    <td className="border-b border-border px-3 py-2">{day.day}</td>
                    <td className="border-b border-border px-3 py-2 text-right">{day.totalMins}</td>
                    <td className="border-b border-border px-3 py-2 text-right">{formatHours(day.totalMins)}</td>
                    <td className="border-b border-border px-3 py-2">
                      {Object.entries(day.breakdown)
                        .map(([label, value]) => `${label}:${value}`)
                        .join(' | ')}
                    </td>
                    <td className="border-b border-border px-3 py-2 text-right">
                      {index === 0 ? row.unmatchedCount : ''}
                    </td>
                  </tr>
                ));
              })
            ) : (
              <tr>
                <td className="px-3 py-4 text-center text-muted-foreground" colSpan={6}>
                  {loading ? '読込中…' : 'データがありません'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
