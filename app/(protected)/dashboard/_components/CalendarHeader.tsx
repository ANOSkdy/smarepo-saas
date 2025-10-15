'use client';

import { useMemo } from 'react';

type CalendarHeaderProps = {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
};

function formatLabel(year: number, month: number) {
  return `${year}年${String(month).padStart(2, '0')}月`;
}

export default function CalendarHeader({ year, month, onPrev, onNext, onReset }: CalendarHeaderProps) {
  const label = useMemo(() => formatLabel(year, month), [year, month]);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">月次カレンダー</h2>
        <p className="text-sm text-gray-500">月単位で稼働状況を確認し、必要に応じて日次の詳細を開けます。</p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrev}
            className="tap-target rounded-lg border border-brand-border bg-brand-surface-alt px-3 py-2 text-sm font-semibold text-brand-text shadow-sm transition hover:bg-brand-surface"
          >
            前月
          </button>
          <div className="text-sm font-medium text-brand-text" aria-live="polite">
            {label}
          </div>
          <button
            type="button"
            onClick={onNext}
            className="tap-target rounded-lg border border-brand-border bg-brand-surface-alt px-3 py-2 text-sm font-semibold text-brand-text shadow-sm transition hover:bg-brand-surface"
          >
            次月
          </button>
          <button
            type="button"
            onClick={onReset}
            className="tap-target rounded-lg border border-brand-border bg-brand-primary/10 px-3 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/20"
          >
            今月
          </button>
        </div>
        {/* Excel 出力ボタンは非表示（要件により UI から撤去） */}
      </div>
    </div>
  );
}
