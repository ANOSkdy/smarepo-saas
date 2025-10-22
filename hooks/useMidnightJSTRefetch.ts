'use client';

import { useEffect, useRef } from 'react';

/**
 * JST の翌日 00:00:30 に一度だけ refetch() を実行し、
 * その後も毎日スケジュールし直す軽量フック。
 * refetch が未指定の場合は location.reload() をフォールバック。
 */
export function useMidnightJSTRefetch(refetch?: () => void) {
  type TimeoutHandle = ReturnType<typeof setTimeout>;
  const timerRef = useRef<TimeoutHandle | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const scheduleNext = () => {
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
      const nowJst = new Date(utcMs + 9 * 60 * 60_000);

      const targetJst = new Date(nowJst);
      targetJst.setDate(nowJst.getDate() + 1);
      targetJst.setHours(0, 0, 30, 0);

      const delayMs = Math.max(0, targetJst.getTime() - nowJst.getTime());

      timerRef.current = setTimeout(() => {
        try {
          if (typeof refetch === 'function') {
            refetch();
          } else if (typeof window !== 'undefined') {
            window.location.reload();
          }
        } finally {
          scheduleNext();
        }
      }, delayMs);
    };

    scheduleNext();

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [refetch]);
}

