'use client';

import { useState } from 'react';
import type { FiltersValue } from './Filters';
import type { ReportRecord } from './ResultsTable';
import { toCsv } from '../_utils/csv';

type DownloadCsvButtonProps = {
  filters: FiltersValue;
  disabled?: boolean;
};

export function DownloadCsvButton({ filters, disabled }: DownloadCsvButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
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
        throw new Error(data.message ?? 'CSVの取得に失敗しました');
      }
      const records: ReportRecord[] = Array.isArray(data.records) ? data.records : [];
      const headers = [
        'sitename',
        'username',
        'machinename',
        'workdescription',
        'hours',
        'date',
      ];
      const rows = records.map((record) => [
        record.sitename,
        record.username,
        record.machinename,
        record.workdescription,
        record.hours.toFixed(2),
        record.date,
      ]);
      const csv = toCsv({ headers, rows, includeBom: true });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const month = String(filters.month).padStart(2, '0');
      link.download = `reports-${filters.year}-${month}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSVのダウンロードに失敗しました';
      setError(message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        onClick={handleDownload}
        disabled={disabled || isDownloading}
        aria-label="CSVをダウンロード"
      >
        {isDownloading ? 'ダウンロード中...' : 'CSVダウンロード'}
      </button>
      {error ? (
        <p role="status" aria-live="polite" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
