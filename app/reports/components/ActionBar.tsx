'use client';

import { useState } from 'react';
import { DownloadCsvButton } from './DownloadCsvButton';
import type { FiltersValue } from './Filters';

type ActionBarProps = {
  params: FiltersValue;
  hasData: boolean;
};

export default function ActionBar({ params, hasData }: ActionBarProps) {
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = String(params.month).padStart(2, '0');

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    const response = await fetch('/api/reports/export/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(data?.message ?? 'Excel出力に失敗しました');
    }
    const blob = await response.blob();
    triggerDownload(blob, `report-${params.year}${monthLabel}.xlsx`);
  };

  const downloadPdf = async () => {
    const response = await fetch('/api/reports/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'personal', ...params }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(data?.message ?? 'PDF出力に失敗しました');
    }
    const blob = await response.blob();
    triggerDownload(blob, `report-${params.year}${monthLabel}.pdf`);
  };

  const handlePrimaryDownload = async () => {
    if (!hasData || isDownloading) {
      return;
    }
    setIsDownloading(true);
    setError(null);
    try {
      if (format === 'pdf') {
        await downloadPdf();
      } else {
        await downloadExcel();
      }
    } catch (downloadError) {
      const message =
        downloadError instanceof Error
          ? downloadError.message
          : '出力に失敗しました';
      setError(message);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="report-format">
          <span className="sr-only">出力形式</span>
          <select
            id="report-format"
            aria-label="出力形式を選択"
            value={format}
            onChange={(event) => setFormat(event.target.value as 'pdf' | 'excel')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="pdf">PDF</option>
            <option value="excel">Excel（自由列）</option>
          </select>
        </label>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted"
          onClick={handlePrimaryDownload}
          disabled={!hasData || isDownloading}
          aria-live="polite"
        >
          {isDownloading ? 'ダウンロード中...' : format === 'pdf' ? 'PDF出力' : 'Excel出力'}
        </button>
        <DownloadCsvButton filters={params} disabled={isDownloading} />
        {!hasData ? (
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
            データがありません
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="status" aria-live="polite" className="text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
