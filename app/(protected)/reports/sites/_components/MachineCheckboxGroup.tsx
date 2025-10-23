'use client';

import { useMemo } from 'react';

export type Option = { id: string | number; name: string };
type Props = {
  title?: string;
  options: Option[];
  value: (string | number)[];
  onChange: (next: string[]) => void;
};

export default function MachineCheckboxGroup({ title = '機械（チェック可）', options, value, onChange }: Props) {
  const normalized = useMemo(
    () => options.map((option) => ({ id: String(option.id), name: option.name ?? String(option.id) })),
    [options],
  );
  const selected = useMemo(() => new Set(value.map((item) => String(item))), [value]);
  const allIds = useMemo(() => normalized.map((option) => option.id), [normalized]);
  const hasOptions = normalized.length > 0;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(Array.from(next));
  };

  const selectAll = () => {
    if (!hasOptions) {
      return;
    }
    onChange(allIds);
  };

  const clearAll = () => {
    if (value.length === 0) {
      return;
    }
    onChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <button
          type="button"
          onClick={selectAll}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!hasOptions}
        >
          全選択
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={value.length === 0}
        >
          全解除
        </button>
      </div>
      {hasOptions ? (
        <div className="max-h-72 overflow-y-auto rounded border border-gray-200 p-3">
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
            {normalized.map((option) => (
              <li key={option.id} className="flex items-center gap-2">
                <input
                  id={`machine-filter-${option.id}`}
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={selected.has(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <label htmlFor={`machine-filter-${option.id}`} className="text-sm">
                  {option.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-500">選択可能な機械がありません</p>
      )}
    </div>
  );
}
