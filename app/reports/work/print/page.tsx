'use client';

import { useEffect, useMemo, useState } from 'react';
import NavTabs from '@/components/NavTabs';

type DayRow = {
  day: string;
  totalMins: number;
  breakdown: Record<string, number>;
};

type ReportRow = {
  userKey: string;
  days: DayRow[];
};

type ApiResponse = {
  result: ReportRow[];
};

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

function toQueryString(params: Props['searchParams']): string {
  const search = new URLSearchParams();
  const getString = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  };
  const year = getString(params.year);
  const month = getString(params.month);
  if (year) search.set('year', year);
  if (month) search.set('month', month);
  const user = getString(params.user);
  if (user) search.set('user', user);
  const site = getString(params.site);
  if (site) search.set('site', site);
  const machine = getString(params.machine);
  if (machine) search.set('machine', machine);
  return search.toString();
}

export default function WorkReportPrintPage({ searchParams }: Props) {
  const query = useMemo(() => toQueryString(searchParams), [searchParams]);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoPrintReady, setAutoPrintReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setAutoPrintReady(false);
    const load = async () => {
      try {
        const response = await fetch(`/api/reports/work?${query}`);
        const json = (await response.json()) as ApiResponse & { error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? 'fetch failed');
        }
        if (!cancelled) {
          setData(json);
          setAutoPrintReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'unknown error';
          setError(message);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    if (!autoPrintReady) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.print();
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [autoPrintReady]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6 print:max-w-none print:p-4">
      <NavTabs />
      <header className="space-y-2 print:hidden">
        <h1 className="text-2xl font-bold text-foreground">月次稼働集計（印刷用）</h1>
        <p className="text-sm text-muted-foreground">
          ブラウザの印刷（PDF出力）機能をご利用ください。自動的にダイアログが開かない場合は下のボタンを使用できます。
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-border px-3 py-1 font-medium text-foreground transition-colors hover:bg-muted"
          >
            印刷ダイアログを開く
          </button>
          {autoPrintReady ? (
            <span className="text-xs text-muted-foreground">最新データを読み込みました。</span>
          ) : (
            <span className="text-xs text-muted-foreground">データ取得中...</span>
          )}
        </div>
      </header>
      {error && <p className="text-sm text-destructive">エラー: {error}</p>}
      {!error && !data && <p className="text-sm text-muted-foreground">読み込み中...</p>}
      {data && (
        <table className="w-full border border-border text-sm print:text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="border border-border px-2 py-1 text-left">ユーザー</th>
              <th className="border border-border px-2 py-1 text-left">日付</th>
              <th className="border border-border px-2 py-1 text-right">合計(分)</th>
              <th className="border border-border px-2 py-1 text-right">合計(時間)</th>
              <th className="border border-border px-2 py-1 text-left">内訳</th>
            </tr>
          </thead>
          <tbody>
            {data.result.flatMap((row) =>
              row.days.map((day, index) => (
                <tr key={`${row.userKey}-${day.day}-${index}`}>
                  <td className="border border-border px-2 py-1">{row.userKey}</td>
                  <td className="border border-border px-2 py-1">{day.day}</td>
                  <td className="border border-border px-2 py-1 text-right">{day.totalMins}</td>
                  <td className="border border-border px-2 py-1 text-right">{(day.totalMins / 60).toFixed(2)}</td>
                  <td className="border border-border px-2 py-1">
                    {Object.entries(day.breakdown)
                      .map(([key, value]) => `${key}:${value}`)
                      .join(' | ')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
