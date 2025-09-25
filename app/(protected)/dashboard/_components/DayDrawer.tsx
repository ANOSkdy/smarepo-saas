'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type DaySession = {
  username: string;
  sitename: string;
  workdescription: string;
  clockInAt: string;
  clockOutAt: string;
  hours: number;
  projectName: string | null;
};

type DayDetailResponse = {
  date: string;
  sessions: DaySession[];
  spreadsheetUrl: string | null;
};

type FetchState = 'idle' | 'loading' | 'error' | 'success';

type DayDrawerProps = {
  date: string | null;
  open: boolean;
  onClose: () => void;
};

function formatDateTime(value: string) {
  if (!value) {
    return '-';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

export default function DayDrawer({ date, open, onClose }: DayDrawerProps) {
  const [state, setState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [detail, setDetail] = useState<DayDetailResponse | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !date) {
      setDetail(null);
      setState('idle');
      return;
    }
    const controller = new AbortController();
    const fetchDetail = async () => {
      setState('loading');
      setErrorMessage('');
      try {
        const response = await fetch(`/api/dashboard/day-detail?date=${date}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Day detail API error ${response.status}`);
        }
        const payload = (await response.json()) as DayDetailResponse;
        setDetail(payload);
        setState('success');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load day detail', error);
        setErrorMessage('日次の稼働情報を取得できませんでした。時間をおいて再実行してください。');
        setState('error');
      }
    };
    void fetchDetail();
    return () => {
      controller.abort();
    };
  }, [date, open]);

  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-10"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-drawer-title"
        tabIndex={-1}
        className="w-full max-w-3xl rounded-3xl bg-white shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 id="day-drawer-title" className="text-lg font-semibold text-gray-900">
              {detail?.date ?? date}
            </h3>
            <p className="text-sm text-gray-500">選択した日のセッション詳細です。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-200 p-2 text-sm text-gray-600 transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {state === 'loading' ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="mt-2 h-4 w-48 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : state === 'error' ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {errorMessage}
            </div>
          ) : detail && detail.sessions.length > 0 ? (
            <ul className="space-y-3">
              {detail.sessions.map((session, index) => (
                <li key={`${session.username}-${session.clockInAt}-${index}`} className="rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{session.username}</p>
                      <p className="text-xs text-gray-500">{session.sitename}</p>
                    </div>
                    <div className="text-xs text-gray-500">
                      <p>
                        {formatDateTime(session.clockInAt)}
                        <span className="mx-1 text-gray-400">→</span>
                        {formatDateTime(session.clockOutAt)}
                      </p>
                      <p className="mt-1 text-sm font-medium text-blue-600">{session.hours.toFixed(2)}時間</p>
                    </div>
                  </div>
                  {session.workdescription ? (
                    <p className="mt-3 text-sm text-gray-600">{session.workdescription}</p>
                  ) : null}
                  {session.projectName ? (
                    <p className="mt-2 text-xs text-gray-500">案件: {session.projectName}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">この日に登録されたセッションはありません。</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          {detail?.spreadsheetUrl ? (
            <Link
              href={detail.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              スプレッドシートを開く
            </Link>
          ) : (
            <span className="text-sm text-gray-400">紐付くスプレッドシートはありません。</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
