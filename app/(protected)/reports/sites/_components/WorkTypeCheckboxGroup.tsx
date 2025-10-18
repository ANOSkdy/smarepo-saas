'use client';

import { useCallback, useMemo } from 'react';

type Option = {
  id: string;
  name: string;
};

type Props = {
  className?: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
};

export default function WorkTypeCheckboxGroup({ className, options, value, onChange }: Props) {
  const selected = useMemo(() => new Set(value), [value]);
  const containerClassName = useMemo(() => ['space-y-3', className].filter(Boolean).join(' '), [className]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      const ordered = options.filter((option) => next.has(option.id)).map((option) => option.id);
      onChange(ordered);
    },
    [onChange, options, selected],
  );

  const selectAll = useCallback(() => {
    onChange(options.map((option) => option.id));
  }, [onChange, options]);

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const hasOptions = options.length > 0;

  return (
    <div className={containerClassName}>
      <div className="flex flex-wrap gap-2">
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
        <div className="max-h-56 overflow-y-auto pr-1">
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
            {options.map((option) => {
              const checked = selected.has(option.id);
              return (
                <li key={option.id} className="flex items-center gap-2">
                  <input
                    id={`work-type-${option.id}`}
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    value={option.id}
                    checked={checked}
                    onChange={() => toggle(option.id)}
                  />
                  <label htmlFor={`work-type-${option.id}`} className="text-sm">
                    {option.name || '(no name)'}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-500">業務内容がありません</p>
      )}
    </div>
  );
}
