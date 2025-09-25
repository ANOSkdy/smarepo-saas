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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          aria-label="前の月へ"
        >
          前月
        </button>
        <div className="text-sm font-medium text-gray-700" aria-live="polite">
          {label}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          aria-label="次の月へ"
        >
          次月
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          今月
        </button>
      </div>
    </div>
  );
}
