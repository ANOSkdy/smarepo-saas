'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CalendarHeader from './CalendarHeader';
import DayDetailDrawer from './DayDetailDrawer';

type CalendarDay = {
  date: string;
  sites: string[];
  punches: number;
  sessions: number;
  hours: number;
};

type CalendarResponse = {
  year: number;
  month: number;
  days: CalendarDay[];
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

const JST_OFFSET = 9 * 60 * 60 * 1000;

function getTodayInfo() {
  const now = new Date();
  const jst = new Date(now.getTime() + JST_OFFSET);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    date: `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(
      jst.getUTCDate(),
    ).padStart(2, '0')}`,
  };
}

function createCalendarMatrix(year: number, month: number) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks: (string | null)[][] = [];
  let currentDay = 1;

  while (currentDay <= daysInMonth) {
    const week: (string | null)[] = Array.from({ length: 7 }, () => null);
    for (let day = 0; day < 7 && currentDay <= daysInMonth; day += 1) {
      if (weeks.length === 0 && day < startWeekday) {
        continue;
      }
      const date = `${year}-${String(month).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
      week[day] = date;
      currentDay += 1;
    }
    weeks.push(week);
  }

  if (weeks.length < 6) {
    while (weeks.length < 6) {
      weeks.push(Array.from({ length: 7 }, () => null));
    }
  }

  return weeks;
}

export default function ActivityCalendar() {
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
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      const response = await fetch(`/api/calendar/month?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status}`);
      }
      const payload = (await response.json()) as CalendarResponse;
      setData(payload);
      setState('success');
    } catch (error) {
      console.error('Failed to load calendar summary', error);
      setErrorMessage('カレンダー情報の取得に失敗しました。再読み込みしてください。');
      setState('error');
    }
  }, [month, year]);

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  const matrix = useMemo(() => createCalendarMatrix(year, month), [year, month]);
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
    const base = new Date(Date.UTC(year, month - 1 + offset, 1));
    setYear(base.getUTCFullYear());
    setMonth(base.getUTCMonth() + 1);
  };

  return (
    <div className="space-y-6">
      <CalendarHeader
        year={year}
        month={month}
        onPrev={() => navigateMonth(-1)}
        onNext={() => navigateMonth(1)}
        onReset={() => {
          setYear(today.year);
          setMonth(today.month);
        }}
      />
      {state === 'error' ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-gray-100">
        <table className="w-full table-fixed text-sm" aria-label="月次稼働カレンダー">
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
                  if (!date) {
                    return (
                      <td key={`empty-${dayIndex}`} className="h-28 bg-gray-50" aria-hidden />
                    );
                  }
                  const summary = dayMap.get(date);
                  const isToday = date === today.date;
                  const dayNumber = Number.parseInt(date.split('-')[2] ?? '0', 10);
                  const siteNames = summary?.sites ?? [];
                  const primarySites = siteNames.slice(0, 2);
                  const overflowCount = Math.max(siteNames.length - primarySites.length, 0);
                  const hasActivity = (summary?.punches ?? 0) > 0;

                  return (
                    <td
                      key={date}
                      className={`h-28 align-top transition ${
                        hasActivity ? 'cursor-pointer hover:bg-blue-50/70' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedDate(date)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedDate(date);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedDate === date}
                    >
                      <div
                        className={`flex h-full flex-col gap-2 p-3 ${
                          isToday ? 'rounded-xl border border-blue-200' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between text-xs font-medium text-gray-700">
                          <span>{dayNumber}</span>
                          {hasActivity ? (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                              {summary?.sessions ?? 0} ses
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {primarySites.length > 0 ? (
                            <span>
                              {primarySites.join(' / ')}
                              {overflowCount > 0 ? ` (+${overflowCount})` : ''}
                            </span>
                          ) : (
                            <span className="text-gray-400">現場情報なし</span>
                          )}
                        </div>
                        <div className="mt-auto space-y-1 text-xs text-gray-600">
                          <p className="font-medium text-gray-700">
                            {(summary?.hours ?? 0).toFixed(2)}h / {summary?.punches ?? 0}打刻
                          </p>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
                            {hasActivity ? (
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{
                                  width: `${Math.min(100, Math.round(((summary?.hours ?? 0) / 12) * 100))}%`,
                                }}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DayDetailDrawer date={selectedDate} open={Boolean(selectedDate)} onClose={() => setSelectedDate(null)} />
    </div>
  );
}
