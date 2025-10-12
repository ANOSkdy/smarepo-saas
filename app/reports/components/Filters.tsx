'use client';

import { FormEvent } from 'react';

export type FiltersValue = {
  year: number;
  month: number;
  sitename?: string;
  username?: string;
  machinename?: string;
};

export type FiltersOptions = {
  sitenames: string[];
  usernames: string[];
  machinenames: string[];
};

type FiltersProps = {
  value: FiltersValue;
  onChange: (value: FiltersValue) => void;
  onSearch: () => void;
  disabled?: boolean;
  options: FiltersOptions;
};

function formatMonth({ year, month }: { year: number; month: number }): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function Filters({ value, onChange, onSearch, disabled, options }: FiltersProps) {
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
        <label className="text-sm font-medium text-muted-foreground" htmlFor="sitename">
          現場名
        </label>
        <input
          id="sitename"
          type="text"
          list="report-sitenames"
          value={value.sitename ?? ''}
          onChange={(event) =>
            onChange({ ...value, sitename: event.target.value || undefined })
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="例: 東京第一現場"
          disabled={disabled}
          aria-describedby="sitename-hint"
        />
        <datalist id="report-sitenames">
          {options.sitenames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <span id="sitename-hint" className="sr-only">
          現場名を入力すると候補が表示されます
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="username">
          作業員名
        </label>
        <input
          id="username"
          type="text"
          list="report-usernames"
          value={value.username ?? ''}
          onChange={(event) =>
            onChange({ ...value, username: event.target.value || undefined })
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="例: 山田太郎"
          disabled={disabled}
          aria-describedby="username-hint"
        />
        <datalist id="report-usernames">
          {options.usernames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <span id="username-hint" className="sr-only">
          作業員名を入力すると候補が表示されます
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="machinename">
          機械名
        </label>
        <input
          id="machinename"
          type="text"
          list="report-machinenames"
          value={value.machinename ?? ''}
          onChange={(event) =>
            onChange({ ...value, machinename: event.target.value || undefined })
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="例: クレーンA"
          disabled={disabled}
          aria-describedby="machinename-hint"
        />
        <datalist id="report-machinenames">
          {options.machinenames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <span id="machinename-hint" className="sr-only">
          機械名を入力すると候補が表示されます
        </span>
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
