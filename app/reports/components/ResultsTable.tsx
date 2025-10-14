'use client';

import { useEffect, useMemo, useState } from 'react';
import { Filters, type FiltersOptions, type FiltersValue } from './Filters';
import ActionBar from './ActionBar';

export type ReportRecord = {
  id: string;
  username: string;
  sitename: string;
  machinename: string;
  workdescription: string;
  hours: number;
  date: string;
};

type ResultsTableProps = {
  records: ReportRecord[];
  isLoading?: boolean;
};

type ReportsContentProps = {
  initialRecords: ReportRecord[];
  initialFilter: FiltersValue;
};

export function ResultsTable({ records, isLoading }: ResultsTableProps) {
  const totalHours = useMemo(
    () => records.reduce((sum, record) => sum + record.hours, 0),
    [records]
  );

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-border bg-card">
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
          読み込み中...
        </span>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-muted/20">
        <p className="text-sm text-muted-foreground">該当するレコードがありません。</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="min-w-full divide-y divide-border" aria-label="検索結果">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              作業員
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              現場
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              機械
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              作業内容
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              時間
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              日付
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {records.map((record) => (
            <tr key={record.id} className="hover:bg-muted/40">
              <td className="px-4 py-3 text-sm text-foreground">{record.username}</td>
              <td className="px-4 py-3 text-sm text-foreground">{record.sitename}</td>
              <td className="px-4 py-3 text-sm text-foreground">{record.machinename}</td>
              <td className="px-4 py-3 text-sm text-foreground">{record.workdescription}</td>
              <td className="px-4 py-3 text-right text-sm text-foreground">{record.hours.toFixed(2)}</td>
              <td className="px-4 py-3 text-sm text-foreground">{record.date}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/50">
          <tr>
            <td className="px-4 py-3 text-sm font-semibold text-foreground" colSpan={4}>
              合計
            </td>
            <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
              {totalHours.toFixed(2)}
            </td>
            <td className="px-4 py-3 text-sm text-foreground">&nbsp;</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ReportsContent({ initialRecords, initialFilter }: ReportsContentProps) {
  const [filters, setFilters] = useState<FiltersValue>(initialFilter);
  const [records, setRecords] = useState<ReportRecord[]>(initialRecords);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecords(initialRecords);
    setFilters(initialFilter);
  }, [initialFilter, initialRecords]);

  const options = useMemo<FiltersOptions>(() => {
    const unique = (values: string[]) =>
      Array.from(
        new Set(
          values
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b, 'ja'));
    return {
      sitenames: unique(records.map((record) => record.sitename)),
      usernames: unique(records.map((record) => record.username)),
      machinenames: unique(records.map((record) => record.machinename)),
    };
  }, [records]);

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(filters.year),
        month: String(filters.month),
      });
      if (filters.sitename) params.set('sitename', filters.sitename);
      if (filters.username) params.set('username', filters.username);
      if (filters.machinename) params.set('machinename', filters.machinename);

      const response = await fetch(`/api/reports/search?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? '検索に失敗しました');
      }
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '検索に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <Filters
        value={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        disabled={isLoading}
        options={options}
      />
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      <ResultsTable records={records} isLoading={isLoading} />
      <div className="mt-4">
        <ActionBar params={filters} hasData={records.length > 0} />
      </div>
    </section>
  );
}

export type { ReportsContentProps };
