'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DayDrawer from './DayDrawer';

type CalendarDay = {
  date: string;
  hours: number;
  sessions: number;
};

type CalendarResponse = {
  year: number;
  month: number;
  days: CalendarDay[];
};

type FetchState = 'idle' | 'loading' | 'error' | 'success';

function formatMonthLabel(year: number, month: number) {
  return `${year}年${month.toString().padStart(2, '0')}月`;
}

function getTodayInfo(): { year: number; month: number; date: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const formatted = `${year}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
  return { year, month, date: formatted };
}

function createCalendarMatrix(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks: (string | null)[][] = [];
  let currentDay = 1;
  while (currentDay <= daysInMonth) {
    const week: (string | null)[] = Array.from({ length: 7 }, () => null);
    for (let i = 0; i < 7; i += 1) {
      if (weeks.length === 0 && i < startDay) {
        continue;
      }
      if (currentDay > daysInMonth) {
        break;
      }
      const date = `${year}-${month.toString().padStart(2, '0')}-${currentDay
        .toString()
        .padStart(2, '0')}`;
      week[i] = date;
      currentDay += 1;
    }
    weeks.push(week);
  }
  return weeks;
}

export default function CalendarMonth() {
  const today = useMemo(() => getTodayInfo(), []);
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [state, setState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchCalendar = useCallback(async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const response = await fetch(`/api/dashboard/calendar?year=${year}&month=${month}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`Calendar API error ${response.status}`);
      }
      const payload = (await response.json()) as CalendarResponse;
      setData(payload);
      setState('success');
    } catch (error) {
      console.error('Failed to load calendar summary', error);
      setErrorMessage('稼働カレンダーの取得に失敗しました。再読み込みしてください。');
      setState('error');
    }
  }, [month, year]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  const matrix = useMemo(() => createCalendarMatrix(year, month), [month, year]);
  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    if (data?.days) {
      for (const day of data.days) {
        map.set(day.date, day);
      }
    }
    return map;
  }, [data]);

  const navigateMonth = (offset: number) => {
    setData(null);
    const base = new Date(year, month - 1 + offset, 1);
    setYear(base.getFullYear());
    setMonth(base.getMonth() + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">月次カレンダー</h2>
          <p className="text-sm text-gray-500">1日の稼働時間とセッション数を確認できます。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="前の月へ"
          >
            前月
          </button>
          <span className="text-sm font-medium text-gray-700">{formatMonthLabel(year, month)}</span>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="次の月へ"
          >
            次月
          </button>
        </div>
      </div>
      {state === 'error' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {errorMessage}
        </div>
      ) : state === 'loading' ? (
        <p className="text-sm text-gray-500">カレンダーを読み込み中です...</p>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-gray-100">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {['日', '月', '火', '水', '木', '金', '土'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((week, index) => (
              <tr key={`week-${index}`} className="divide-x divide-gray-100">
                {week.map((date, dayIndex) => {
                  const summary = date ? dayMap.get(date) : null;
                  const isToday = date === today.date;
                  return (
                    <td
                      key={dayIndex}
                      className={`h-28 align-top ${
                        date
                          ? 'cursor-pointer bg-white hover:bg-blue-50/60'
                          : 'bg-gray-50'
                      }`}
                      onClick={() => date && setSelectedDate(date)}
                      role={date ? 'button' : undefined}
                      tabIndex={date ? 0 : undefined}
                      onKeyDown={(event) => {
                        if (!date) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedDate(date);
                        }
                      }}
                    >
                      {date ? (
                        <div className={`flex h-full flex-col gap-2 p-3 ${isToday ? 'rounded-xl border border-blue-200' : ''}`}>
                          <div className="flex items-center justify-between text-xs font-medium text-gray-700">
                            <span>{Number.parseInt(date.split('-')[2] ?? '0', 10)}</span>
                            {summary ? (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                                {summary.sessions}件
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-auto text-xs text-gray-500">
                            {summary ? `${summary.hours.toFixed(2)}h` : '0.00h'}
                          </div>
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DayDrawer date={selectedDate} open={Boolean(selectedDate)} onClose={() => setSelectedDate(null)} />
    </div>
  );
}
