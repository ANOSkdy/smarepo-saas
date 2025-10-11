'use client';

import { useState } from 'react';

type DownloadPdfButtonProps = {
  type: 'personal' | 'site' | 'monthly';
  params: {
    year: number;
    month: number;
    sitename?: string;
    username?: string;
    machinename?: string;
  };
  disabled?: boolean;
  hasRecords?: boolean;
};

export function DownloadPdfButton({ type, params, disabled, hasRecords }: DownloadPdfButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!hasRecords) {
      setMessage('データがありません');
      return;
    }

    setIsDownloading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/reports/export/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          ...params,
        }),
        cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: 'PDFの取得に失敗しました' }));
        const errorMessage = typeof data.message === 'string' ? data.message : 'PDFの取得に失敗しました';
        throw new Error(errorMessage);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const month = String(params.month).padStart(2, '0');
      link.download = `report-${type}-${params.year}${month}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMessage('PDFをダウンロードしました');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PDFのダウンロードに失敗しました';
      setMessage(errorMessage);
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
        aria-label="PDFをダウンロード"
      >
        {isDownloading ? '生成中...' : 'PDF出力'}
      </button>
      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs ${message === 'PDFをダウンロードしました' ? 'text-emerald-600' : 'text-destructive'}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
