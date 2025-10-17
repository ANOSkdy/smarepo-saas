'use client';

import { useMemo, useState } from 'react';
import type { SessionRow } from '@/lib/reporting/pairLogsToSessions';

type SortKey = 'year' | 'month' | 'day' | 'siteName' | 'hours';

type Props = {
  rows: SessionRow[];
};

export default function ReportsClient({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('year');
  const [asc, setAsc] = useState<boolean>(true);

  const data = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        const comparison = av.localeCompare(bv, 'ja');
        return asc ? comparison : -comparison;
      }
      const diff = (av as number) - (bv as number);
      if (diff === 0) {
        return 0;
      }
      return asc ? diff : -diff;
    });
    return sorted;
  }, [rows, sortKey, asc]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) {
      setAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  };

  if (!rows.length) {
    return (
      <div className="mt-6 rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        データがありません。
      </div>
    );
  }

  const headerLabels: Record<SortKey, string> = {
    year: '年',
    month: '月',
    day: '日',
    siteName: '現場名',
    hours: '稼働時間',
  };

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="text-left text-sm text-gray-600">
            {(Object.keys(headerLabels) as SortKey[]).map((key) => (
              <th key={key} className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-label={`${headerLabels[key]}でソート`}
                  className="flex items-center gap-1 rounded text-left text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  <span>{headerLabels[key]}</span>
                  <span aria-hidden="true">{sortKey === key ? (asc ? '↑' : '↓') : '↕'}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={`${r.year}-${r.month}-${r.day}-${r.siteName}-${i}`} className="border-t">
              <td className="px-3 py-2">{r.year}</td>
              <td className="px-3 py-2">{r.month}</td>
              <td className="px-3 py-2">{r.day}</td>
              <td className="px-3 py-2">{r.siteName}</td>
              <td className="px-3 py-2">{r.hours.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
