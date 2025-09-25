'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type PunchRecord = {
  timestamp: string;
  type: 'IN' | 'OUT';
  userName: string;
  siteName: string | null;
  workType: string | null;
  note: string | null;
};

type SessionRecord = {
  userName: string;
  siteName: string | null;
  clockInAt: string;
  clockOutAt: string;
  hours: number;
};

type DayDetailResponse = {
  date: string;
  punches: PunchRecord[];
  sessions: SessionRecord[];
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

type DayDetailDrawerProps = {
  date: string | null;
  open: boolean;
  onClose: () => void;
};

function formatDateLabel(date: string | null) {
  if (!date) return '';
  try {
    const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', {
      weekday: 'short',
      timeZone: 'Asia/Tokyo',
    });
    const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
    const parsed = new Date(`${date}T00:00:00+09:00`);
    return `${dateFormatter.format(parsed)} (${weekdayFormatter.format(parsed)})`;
  } catch {
    return date;
  }
}

function formatTimestamp(value: string) {
  if (!value) return '-';
  try {
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
    return formatter.format(new Date(value));
  } catch {
    return value;
  }
}

export default function DayDetailDrawer({ date, open, onClose }: DayDetailDrawerProps) {
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
    const load = async () => {
      setState('loading');
      setErrorMessage('');
      try {
        const response = await fetch(`/api/calendar/day?date=${date}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Day API error: ${response.status}`);
        }
        const payload = (await response.json()) as DayDetailResponse;
        setDetail(payload);
        setState('success');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Failed to load day detail', error);
        setErrorMessage('日次の打刻情報を取得できませんでした。時間を置いて再試行してください。');
        setState('error');
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [date, open]);

  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  const headerLabel = useMemo(() => formatDateLabel(detail?.date ?? date ?? null), [date, detail?.date]);

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
        aria-labelledby="day-detail-title"
        tabIndex={-1}
        className="w-full max-w-4xl rounded-3xl bg-white shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 id="day-detail-title" className="text-lg font-semibold text-gray-900">
              {headerLabel || '日次詳細'}
            </h3>
            <p className="text-sm text-gray-500">ユーザーごとのセッションと打刻明細を表示します。</p>
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
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
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
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : detail ? (
            <div className="space-y-6">
              <section>
                <h4 className="text-sm font-semibold text-gray-800">セッション概要</h4>
                {detail.sessions.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">この日にペアリングされたセッションはありません。</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {detail.sessions.map((session, index) => (
                      <li
                        key={`${session.userName}-${session.clockInAt}-${index}`}
                        className="rounded-2xl border border-gray-100 p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{session.userName}</p>
                            <p className="text-xs text-gray-500">{session.siteName ?? '現場未設定'}</p>
                          </div>
                          <div className="text-xs text-gray-500">
                            <p>
                              {session.clockInAt}
                              <span className="mx-1 text-gray-400">→</span>
                              {session.clockOutAt}
                            </p>
                            <p className="mt-1 text-sm font-medium text-blue-600">{session.hours.toFixed(2)}時間</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h4 className="text-sm font-semibold text-gray-800">打刻明細</h4>
                {detail.punches.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">この日に記録された打刻はありません。</p>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100">
                    <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            タイムスタンプ
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            種別
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            ユーザー
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            現場
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            作業種別
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            メモ
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detail.punches.map((punch, index) => (
                          <tr key={`${punch.timestamp}-${punch.type}-${index}`} className="hover:bg-blue-50/40">
                            <td className="px-4 py-3 text-sm text-gray-700">{formatTimestamp(punch.timestamp)}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{punch.type}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">{punch.userName}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{punch.siteName ?? '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{punch.workType ?? '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{punch.note ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <p className="text-sm text-gray-500">対象日の情報が見つかりませんでした。</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
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
