'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type ProjectItem = {
  projectId: string;
  name: string;
  siteName: string | null;
  status: '準備中' | '進行中' | '保留' | '完了' | null;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  spreadsheetUrl: string | null;
};

type ApiResponse = {
  items: ProjectItem[];
  total: number;
};

type FetchState = 'idle' | 'loading' | 'error' | 'success';

type SortKey = 'progress' | 'startDate' | 'endDate';

type StatusOption = NonNullable<ProjectItem['status']>;

const STATUS_OPTIONS: { label: string; value: StatusOption | 'all' }[] = [
  { label: 'すべて', value: 'all' },
  { label: '準備中', value: '準備中' },
  { label: '進行中', value: '進行中' },
  { label: '保留', value: '保留' },
  { label: '完了', value: '完了' },
];

function formatDate(value: string | null): string {
  if (!value) {
    return '-';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return value;
  }
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full rounded-full bg-gray-100" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default function ProjectsTable() {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [status, setStatus] = useState<StatusOption | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('endDate');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [state, setState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchProjects = useCallback(async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sort', sortKey);
      params.set('order', order);
      if (status !== 'all') {
        params.set('status', status);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }
      const response = await fetch(`/api/dashboard/projects?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      const data = (await response.json()) as ApiResponse;
      setItems(data.items);
      setTotal(data.total);
      setState('success');
    } catch (error) {
      console.error('Failed to load dashboard projects', error);
      setErrorMessage('案件情報の取得に失敗しました。再読み込みしてください。');
      setState('error');
    }
  }, [order, page, pageSize, search, sortKey, status]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <label className="flex flex-1 items-center gap-2 text-sm text-gray-600" htmlFor="project-search">
            <span className="shrink-0">検索</span>
            <input
              id="project-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="案件名や拠点名で検索"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600" htmlFor="project-status">
            <span className="shrink-0">状態</span>
            <select
              id="project-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusOption | 'all');
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600" htmlFor="project-sort">
            <span className="shrink-0">並び替え</span>
            <select
              id="project-sort"
              value={sortKey}
              onChange={(event) => {
                setSortKey(event.target.value as SortKey);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="endDate">終了日</option>
              <option value="startDate">開始日</option>
              <option value="progress">進捗率</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            }}
            className="self-start rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="並び順を切り替え"
          >
            {order === 'asc' ? '昇順' : '降順'}
          </button>
        </div>
      </div>
      {state === 'error' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {errorMessage}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                案件名
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                拠点
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                期間
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                進捗
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                状態
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                スプレッドシート
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state === 'loading' ? (
              Array.from({ length: pageSize }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="animate-pulse">
                  <td className="px-4 py-3">
                    <div className="h-4 w-32 rounded bg-gray-200" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 rounded bg-gray-200" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-28 rounded bg-gray-200" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-2 w-36 rounded bg-gray-200" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 rounded bg-gray-200" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 rounded bg-gray-200" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={6}>
                  表示できる案件がありません。
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.projectId} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.siteName ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(item.startDate)}
                    <span className="mx-1 text-gray-400">~</span>
                    {formatDate(item.endDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="flex items-center gap-3">
                      <span className="w-12 text-right tabular-nums">{Math.round(item.progressPercent)}%</span>
                      <ProgressBar value={item.progressPercent} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                      {item.status ?? '未設定'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {item.spreadsheetUrl ? (
                      <Link
                        href={item.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline-offset-4 transition hover:underline"
                      >
                        開く
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {items.length > 0
            ? `${(page - 1) * pageSize + 1} - ${(page - 1) * pageSize + items.length} / ${total}`
            : `0 / ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => canPrev && setPage((prev) => Math.max(prev - 1, 1))}
            disabled={!canPrev}
            className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="前のページ"
          >
            前へ
          </button>
          <button
            type="button"
            onClick={() => canNext && setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={!canNext}
            className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="次のページ"
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}
