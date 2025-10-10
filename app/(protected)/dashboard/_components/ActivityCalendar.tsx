'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CalendarHeader from './CalendarHeader';
import DayDetailDrawer from './DayDetailDrawer';
import './activity-calendar.css';

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCalendar = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      const response = await fetch(`/api/calendar/month?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const message = await response.text().catch(() => '');
        console.error('Failed to load calendar summary: HTTP error', response.status, message);
        setData({ year, month, days: [] });
        setSelectedDate(null);
        return;
      }
      const payload = (await response.json()) as Partial<CalendarResponse> | null;
      const days = Array.isArray(payload?.days) ? payload.days : [];
      setData({
        year: typeof payload?.year === 'number' ? payload.year : year,
        month: typeof payload?.month === 'number' ? payload.month : month,
        days,
      });
    } catch (error) {
      console.error('Failed to load calendar summary', error);
      setData({ year, month, days: [] });
      setSelectedDate(null);
    } finally {
      setIsLoading(false);
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
      {isLoading && (
        <div className="rounded-2xl border border-brand-border bg-brand-surface-alt px-4 py-3 text-sm text-brand-muted">
          読み込み中…
        </div>
      )}
      {!isLoading && data && (
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-surface-alt">
          <div
            className="grid gap-2 p-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
            role="grid"
            aria-label="月次稼働カレンダー"
          >
            {matrix.flat().map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="calendar-cell empty" aria-hidden />;
              }
              const summary = dayMap.get(date);
              const isToday = date === today.date;
              const dayNumber = Number.parseInt(date.split('-')[2] ?? '0', 10);
              const siteNames = summary?.sites ?? [];
              const displaySites = siteNames.slice(0, 3);
              const punches = summary?.punches ?? 0;
              const hours = summary?.hours ?? 0;
              const hasActivity = punches > 0 || hours > 0;

              return (
                <div key={date} role="gridcell" className="calendar-cell-wrapper">
                  <button
                    type="button"
                    className={`calendar-cell tap-target ${hasActivity ? 'active' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => setSelectedDate(date)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedDate(date);
                      }
                    }}
                    aria-label={`${date}の稼働詳細`}
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-[13px] font-medium text-brand-text sm:text-sm">{dayNumber}</span>
                      <div className="text-xs text-brand-muted site-names">
                        {displaySites.length > 0 ? displaySites.join(' / ') : '現場情報なし'}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <DayDetailDrawer date={selectedDate} open={Boolean(selectedDate)} onClose={() => setSelectedDate(null)} />
    </div>
  );
}
