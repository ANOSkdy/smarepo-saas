'use client';

import './sites.css';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import ReportsTabs from '@/components/reports/ReportsTabs';
import { formatHoursOrEmpty, getJstParts } from '@/lib/jstDate';
import WorkTypeCheckboxGroup from './_components/WorkTypeCheckboxGroup';

type SiteMaster = {
  id: string;
  fields: {
    name: string;
    client?: string;
  };
};

type WorkType = {
  id: string;
  fields: {
    name: string;
  };
};

type ReportColumn = {
  key: string;
  userName: string;
  workDescription: string;
};

type DayRow = {
  date: string;
  day: number;
  dow: string;
  values: number[];
};

type ReportResponse = {
  site?: {
    client?: string;
  };
  columns?: ReportColumn[];
  days?: DayRow[];
};

const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const MIN_DYNAMIC_COLUMNS = 8;

function toText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export default function SiteReportPage() {
  const [monthValue, setMonthValue] = useState(defaultMonth);
  const [sites, setSites] = useState<SiteMaster[]>([]);
  const [works, setWorks] = useState<WorkType[]>([]);
  const [siteId, setSiteId] = useState('');
  const [siteClient, setSiteClient] = useState('');
  const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>([]);

  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadMasters() {
      try {
        const [siteRes, workRes] = await Promise.all([
          fetch('/api/masters/sites', { cache: 'no-store', credentials: 'same-origin' }),
          fetch('/api/masters/work-types', { cache: 'no-store', credentials: 'same-origin' }),
        ]);
        if (!siteRes.ok || !workRes.ok) {
          throw new Error('Failed to load masters');
        }
        const sitesJson = (await siteRes.json()) as SiteMaster[] | null;
        const worksJson = (await workRes.json()) as WorkType[] | null;
        if (!active) return;
        setSites(Array.isArray(sitesJson) ? sitesJson : []);
        setWorks(Array.isArray(worksJson) ? worksJson : []);
      } catch (err) {
        console.error('[reports][sites] failed to load masters', err);
      }
    }
    loadMasters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!siteId) {
      setSiteClient('');
      return;
    }
    const site = sites.find((item) => item.id === siteId);
    setSiteClient(site?.fields?.client ?? '');
  }, [siteId, sites]);

  const { year, month } = useMemo(() => {
    const [yearText, monthText] = monthValue.split('-');
    const parsedYear = Number(yearText);
    const parsedMonth = Number(monthText);
    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
      return { year: Number.NaN, month: Number.NaN };
    }
    return { year: parsedYear, month: parsedMonth };
  }, [monthValue]);

  const workOptions = useMemo(
    () =>
      works.map((work) => ({
        id: work.id,
        name: toText(work.fields.name),
      })),
    [works],
  );

  const columnPaddingCount = Math.max(0, MIN_DYNAMIC_COLUMNS - columns.length);
  const tableStyle = useMemo(
    () =>
      ({
        '--reports-min-cols': String(Math.max(MIN_DYNAMIC_COLUMNS, columns.length)),
      }) as CSSProperties & { '--reports-min-cols': string },
    [columns.length],
  );

  async function loadReport() {
    if (!siteId || !Number.isFinite(year) || !Number.isFinite(month)) {
      return;
    }
    setLoading(true);
    setError(null);
    setReportLoaded(false);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        siteId,
      });
      selectedWorkIds.forEach((id) => {
        const work = works.find((item) => item.id === id);
        const name = work?.fields?.name;
        if (name) {
          params.append('work', String(name));
        }
      });
      const response = await fetch(`/api/reports/sites?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`Failed to load report: ${response.status}`);
      }
      const data = (await response.json()) as ReportResponse;
      setColumns(Array.isArray(data.columns) ? data.columns : []);
      setDays(Array.isArray(data.days) ? data.days : []);
      if (data.site?.client) {
        setSiteClient(data.site.client);
      }
      setReportLoaded(true);
    } catch (err) {
      console.error('[reports][sites] failed to load report', err);
      setError('集計の取得に失敗しました。条件を確認して再試行してください。');
      setColumns([]);
      setDays([]);
    } finally {
      setLoading(false);
    }
  }

  const isReady = Boolean(siteId) && Number.isFinite(year) && Number.isFinite(month);

  return (
    <div className="p-4 space-y-6">
      <ReportsTabs />
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">現場別集計</h1>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">年月</span>
            <input
              type="month"
              className="rounded border px-3 py-2"
              value={monthValue}
              onChange={(event) => setMonthValue(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">現場名</span>
            <select
              className="rounded border px-3 py-2"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              <option value="">（選択してください）</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {toText(site.fields.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">元請・代理人（自動）</span>
            <input
              className="rounded border px-3 py-2 bg-gray-50"
              value={siteClient}
              placeholder="現場を選択すると自動入力"
              readOnly
            />
          </label>
          <div className="flex flex-col gap-1 xl:col-span-2">
            <span className="text-sm text-gray-600">業務内容（チェック可）</span>
            <WorkTypeCheckboxGroup
              className="rounded border p-3"
              options={workOptions}
              value={selectedWorkIds}
              onChange={setSelectedWorkIds}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadReport}
            disabled={!isReady || loading}
            className="rounded bg-indigo-600 px-4 py-2 text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '集計中…' : '集計する'}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </div>

      {reportLoaded ? (
        <div className="overflow-x-auto rounded border">
          <table className="table-unified text-sm" style={tableStyle}>
            <thead>
              <tr className="bg-gray-50">
                <th className="col-narrow border px-2 py-1 text-right">日</th>
                <th className="col-narrow border px-2 py-1 text-center">曜</th>
                {columns.map((column) => (
                  <th key={`user-${column.key}`} className="border px-2 py-1 text-left">
                    {column.userName}
                  </th>
                ))}
                {Array.from({ length: columnPaddingCount }).map((_, index) => (
                  <th key={`user-pad-${index}`} className="border px-2 py-1" aria-hidden="true" />
                ))}
              </tr>
              <tr className="bg-gray-50">
                <th className="col-narrow border px-2 py-1" />
                <th className="col-narrow border px-2 py-1" />
                {columns.map((column) => (
                  <th key={`work-${column.key}`} className="border px-2 py-1 text-left">
                    {column.workDescription}
                  </th>
                ))}
                {Array.from({ length: columnPaddingCount }).map((_, index) => (
                  <th key={`work-pad-${index}`} className="border px-2 py-1" aria-hidden="true" />
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((row) => {
                const { day, weekdayJp } = getJstParts(row.date);
                return (
                  <tr key={row.date}>
                    <td className="col-narrow border px-2 py-1 text-right">{day}</td>
                    <td className="col-narrow border px-2 py-1 text-center">{weekdayJp}</td>
                    {row.values.map((value, index) => (
                      <td
                        key={`${row.date}-${columns[index]?.key ?? index}`}
                        className="border px-2 py-1 text-right tabular-nums"
                      >
                        {formatHoursOrEmpty(value)}
                      </td>
                    ))}
                    {Array.from({ length: columnPaddingCount }).map((_, index) => (
                      <td key={`pad-${row.date}-${index}`} className="border px-2 py-1" aria-hidden="true" />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500">条件を選択し「集計する」を押すと結果が表示されます。</p>
      )}
    </div>
  );
}
