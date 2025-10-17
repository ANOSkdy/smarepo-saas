'use client';

import { useMemo, useState } from 'react';

import type { ReportRow } from '@/lib/reporting/fromLogs';

type SortKey = 'year' | 'month' | 'day' | 'sitename';

type Props = {
  allRows: ReportRow[];
  users: string[];
  defaultUser: string;
};

export default function ReportsClient({ allRows, users, defaultUser }: Props) {
  const [user, setUser] = useState(defaultUser);
  const [sortKey, setSortKey] = useState<SortKey>('year');
  const [ascending, setAscending] = useState(true);

  const rows = useMemo(() => {
    const filtered = user
      ? allRows.filter((row) => row.username === user)
      : allRows;

    return [...filtered].sort((a, b) => {
      const valueA = a[sortKey];
      const valueB = b[sortKey];

      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return ascending
          ? valueA.localeCompare(valueB, 'ja')
          : valueB.localeCompare(valueA, 'ja');
      }

      if (valueA < valueB) {
        return ascending ? -1 : 1;
      }
      if (valueA > valueB) {
        return ascending ? 1 : -1;
      }
      return 0;
    });
  }, [allRows, user, sortKey, ascending]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setAscending((prev) => !prev);
      return;
    }

    setSortKey(key);
    setAscending(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Logsレポート
        </h1>
        <p className="text-sm text-muted-foreground">
          従業員を選択し、日次の稼働時間を並べ替えて確認できます。
        </p>
      </header>

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="reports-user-select">
          従業員名
        </label>
        <select
          id="reports-user-select"
          className="border rounded px-2 py-1"
          value={user}
          onChange={(event) => setUser(event.target.value)}
        >
          {users.length === 0 ? (
            <option value="">従業員が見つかりません</option>
          ) : (
            users.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-border rounded-lg">
          <thead className="bg-muted/60">
            <tr>
              <SortableHeader
                label="年"
                active={sortKey === 'year'}
                ascending={ascending}
                onClick={() => handleSort('year')}
              />
              <SortableHeader
                label="月"
                active={sortKey === 'month'}
                ascending={ascending}
                onClick={() => handleSort('month')}
              />
              <SortableHeader
                label="日"
                active={sortKey === 'day'}
                ascending={ascending}
                onClick={() => handleSort('day')}
              />
              <SortableHeader
                label="現場名"
                active={sortKey === 'sitename'}
                ascending={ascending}
                onClick={() => handleSort('sitename')}
              />
              <th className="text-left text-sm font-medium text-muted-foreground px-3 py-2">
                稼働時間 (h)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.userKey}-${row.date}-${row.sitename}-${index}`}
                className="odd:bg-background even:bg-muted/30 border-t"
              >
                <td className="px-3 py-2 text-sm text-foreground">{row.year}</td>
                <td className="px-3 py-2 text-sm text-foreground">{row.month}</td>
                <td className="px-3 py-2 text-sm text-foreground">{row.day}</td>
                <td className="px-3 py-2 text-sm text-foreground">{row.sitename || '-'}</td>
                <td className="px-3 py-2 text-sm text-foreground">{row.hours.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  className="px-3 py-4 text-sm text-muted-foreground"
                  colSpan={5}
                >
                  該当データがありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SortableHeaderProps = {
  label: string;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
};

function SortableHeader({ label, active, ascending, onClick }: SortableHeaderProps) {
  return (
    <th className="text-left text-sm font-medium text-muted-foreground px-3 py-2" scope="col">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={onClick}
        title="クリックで並び替え"
      >
        <span>{label}</span>
        <span className="text-gray-400 text-xs">{active ? (ascending ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}
