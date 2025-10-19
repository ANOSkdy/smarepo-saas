'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SessionRecord = {
  userName: string;
  siteName: string | null;
  clockInAt: string;
  clockOutAt?: string | null;
  hours?: number | null;
  status: '正常' | '稼働中';
  machineId: string | null | undefined;
  workDescription?: string | null;
};

type SessionGroup = {
  userName: string;
  items: SessionRecord[];
};

type DayDetailResponse = {
  date: string;
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

export default function DayDetailDrawer({ date, open, onClose }: DayDetailDrawerProps) {
  const [state, setState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [detail, setDetail] = useState<DayDetailResponse | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

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
      previouslyFocusedElement.current = document.activeElement as HTMLElement | null;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const initialTarget = closeButtonRef.current ?? focusable.item(0) ?? dialogRef.current;
      initialTarget.focus();
    }

    if (!open && previouslyFocusedElement.current) {
      previouslyFocusedElement.current.focus({ preventScroll: true });
      previouslyFocusedElement.current = null;
    }
  }, [open]);

  const headerLabel = useMemo(() => formatDateLabel(detail?.date ?? date ?? null), [date, detail?.date]);
  const sessionGroups = useMemo<SessionGroup[]>(() => {
    if (!detail?.sessions) {
      return [];
    }
    const grouped = new Map<string, SessionGroup>();
    for (const session of detail.sessions) {
      const key = session.userName || '未登録ユーザー';
      const current = grouped.get(key);
      if (current) {
        current.items.push(session);
      } else {
        grouped.set(key, { userName: key, items: [session] });
      }
    }
    return Array.from(grouped.values());
  }, [detail?.sessions]);

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
          return;
        }
        if (event.key === 'Tab' && dialogRef.current) {
          const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          if (focusable.length === 0) {
            return;
          }
          const first = focusable.item(0);
          const last = focusable.item(focusable.length - 1);
          const active = document.activeElement as HTMLElement | null;
          if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
          }
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-detail-title"
        tabIndex={-1}
        className="w-full max-w-4xl rounded-3xl border border-brand-border bg-brand-surface-alt shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-brand-border px-6 py-4">
          <div>
            <h3 id="day-detail-title" className="text-lg font-semibold text-brand-text">
              {headerLabel || '日次詳細'}
            </h3>
            <p className="text-sm text-brand-muted">ユーザーごとのセッション概要を表示します。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            className="tap-target rounded-full border border-brand-border bg-brand-surface-alt p-2 text-sm text-brand-text transition hover:bg-brand-surface"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5" aria-live="polite">
          {state === 'loading' ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-2xl border border-brand-border bg-brand-surface p-4">
                  <div className="h-4 w-32 rounded bg-brand-border" />
                  <div className="mt-2 h-4 w-48 rounded bg-brand-border/80" />
                </div>
              ))}
            </div>
          ) : state === 'error' ? (
            <div
              className="rounded-lg border border-brand-border bg-brand-surface-alt px-4 py-3 text-sm text-brand-error"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <section>
                <h4 className="text-sm font-semibold text-brand-text">稼働状況</h4>
                {sessionGroups.length === 0 ? (
                  <p className="mt-2 text-sm text-brand-muted">この日にペアリングされたセッションはありません。</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {sessionGroups.map((group) => (
                      <div
                        key={group.userName}
                        className="rounded-2xl border border-brand-border bg-brand-surface-alt p-4 shadow-sm sm:p-5"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-[15px] font-semibold text-brand-text !text-black !opacity-100 sm:text-base">
                            {group.userName}
                          </p>
                        </div>
                        <div className="mt-2 divide-y divide-brand-border/60">
                          {group.items.map((session, index) => {
                            const statusClass =
                              session.status === '稼働中' ? 'text-amber-600' : 'text-brand-primary';
                            const machineIdLabel =
                              typeof session.machineId === 'string' ? session.machineId.trim() : '';
                            return (
                              <div
                                key={`${session.userName}-${session.clockInAt}-${index}`}
                                className="py-2 first:pt-0 last:pb-0"
                              >
                                <p className="text-xs text-brand-muted sm:text-sm">
                                  {session.siteName ?? '現場未設定'}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-brand-text">
                                  <span>
                                    {session.clockInAt}
                                    {session.clockOutAt ? ` → ${session.clockOutAt}` : ''}
                                  </span>
                                  {typeof session.hours === 'number' ? <span>（{session.hours}時間）</span> : null}
                                  <span className={`text-xs sm:text-sm ${statusClass}`}>{session.status}</span>
                                </div>
                                <div className="mt-1 text-sm text-brand-text">
                                  <span className="mr-2 opacity-70">機械</span>
                                  <span className="tabular-nums">
                                    {machineIdLabel.length > 0 ? machineIdLabel : '-'}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-brand-muted">
                                  業務内容 {session.workDescription ?? '—'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <p className="text-sm text-gray-500">対象日の情報が見つかりませんでした。</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-brand-border px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="tap-target rounded-xl border border-brand-border bg-brand-surface-alt px-4 py-2 text-sm font-semibold text-brand-text shadow-sm transition hover:bg-brand-surface"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
