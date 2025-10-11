'use client';

import { FormEvent } from 'react';

export type FiltersValue = {
  year: number;
  month: number;
  siteId?: string;
  userId?: string;
  machineId?: string;
};

type FiltersProps = {
  value: FiltersValue;
  onChange: (value: FiltersValue) => void;
  onSearch: () => void;
  disabled?: boolean;
};

function formatMonth({ year, month }: { year: number; month: number }): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function Filters({ value, onChange, onSearch, disabled }: FiltersProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-4 rounded-md border border-border bg-card p-4 shadow-sm md:grid-cols-5"
      aria-label="レポート検索フィルター"
    >
      <div className="flex flex-col gap-1 md:col-span-2">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="month">
          年月
        </label>
        <input
          id="month"
          type="month"
          value={formatMonth(value)}
          onChange={(event) => {
            const [nextYear, nextMonth] = event.target.value.split('-').map(Number);
            if (Number.isFinite(nextYear) && Number.isFinite(nextMonth)) {
              onChange({ ...value, year: nextYear, month: nextMonth });
            }
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-required="true"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="siteId">
          現場ID
        </label>
        <input
          id="siteId"
          type="text"
          value={value.siteId ?? ''}
          onChange={(event) => onChange({ ...value, siteId: event.target.value || undefined })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="S001"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="userId">
          作業員ID
        </label>
        <input
          id="userId"
          type="text"
          value={value.userId ?? ''}
          onChange={(event) => onChange({ ...value, userId: event.target.value || undefined })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="U001"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="machineId">
          機械ID
        </label>
        <input
          id="machineId"
          type="text"
          value={value.machineId ?? ''}
          onChange={(event) => onChange({ ...value, machineId: event.target.value || undefined })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="M001"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col justify-end">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted"
          disabled={disabled}
          aria-label="検索"
        >
          検索
        </button>
      </div>
    </form>
  );
}
