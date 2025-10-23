'use client';

import './sites.css';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from 'react';
import ReportsTabs from '@/components/reports/ReportsTabs';
import PrintControls from '@/components/PrintControls';
import { formatHoursOrEmpty, getJstParts } from '@/lib/jstDate';
import WorkTypeCheckboxGroup from './_components/WorkTypeCheckboxGroup';
import { sumColumnHours, toMachineHeader, type SessionRow } from './_lib/gridUtils';

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

type ReportColumnSession = {
  user?: string | number;
  machineId?: string | number | null;
  machineID?: string | number | null;
  machineName?: string | null;
  machine?: string | null;
  durationMin?: number | null;
  durationMinutes?: number | null;
  minutes?: number | null;
  mins?: number | null;
  hours?: number | null;
  durationHours?: number | null;
  totalHours?: number | null;
  date?: string;
  [key: string]: unknown;
};

type ReportColumn = {
  key: string;
  userName: string;
  workDescription: string;
  machineId?: string | number | null;
  machineIds?: Array<string | number | null>;
  machineName?: string | null;
  machineNames?: Array<string | null>;
  sessions?: ReportColumnSession[];
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
// 印刷時に1ページへ収める動的列の最大数（固定列2を含めて8列想定）
const PRINT_COLUMNS_PER_PAGE = 6;

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
  const [employeeFilter, setEmployeeFilter] = useState<string[]>([]);

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

  const employeeOptions = useMemo(() => {
    const names = new Set<string>();
    columns.forEach((column) => {
      if (column.userName) {
        names.add(column.userName);
      }
    });
    return Array.from(names);
  }, [columns]);

  const indexedColumns = useMemo(
    () => columns.map((column, index) => ({ column, index })),
    [columns],
  );

  const sessionRowsByColumnKey = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    const coerceId = (value: unknown): string | number | null => {
      if (value == null) {
        return null;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim();
        return text.length > 0 ? (typeof value === 'number' ? value : text) : null;
      }
      return null;
    };

    const coerceName = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return null;
    };

    const coerceDurationMin = (session: ReportColumnSession): number | null => {
      const candidates = [
        session.durationMin,
        session.durationMinutes,
        session.minutes,
        session.mins,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          return candidate;
        }
      }
      return null;
    };

    const coerceHours = (session: ReportColumnSession): number | null => {
      const candidates = [session.hours, session.durationHours, session.totalHours];
      for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          return candidate;
        }
      }
      return null;
    };

    columns.forEach((column) => {
      const sessionRows: SessionRow[] = [];

      if (Array.isArray(column.sessions)) {
        column.sessions.forEach((entry) => {
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const session = entry as ReportColumnSession;
          const machineId =
            coerceId(session.machineId ?? session.machineID ?? column.machineId) ?? null;
          const machineName =
            coerceName(session.machineName ?? session.machine ?? column.machineName) ?? null;
          sessionRows.push({
            user: session.user,
            machineId,
            machineName,
            durationMin: coerceDurationMin(session),
            hours: coerceHours(session),
            date: typeof session.date === 'string' ? session.date : undefined,
          });
        });
      }

      if (sessionRows.length === 0) {
        const machineIds = Array.isArray(column.machineIds)
          ? column.machineIds
          : column.machineId != null
            ? [column.machineId]
            : [];
        const machineNames = Array.isArray(column.machineNames)
          ? column.machineNames
          : column.machineName != null
            ? [column.machineName]
            : [];
        const length = Math.max(machineIds.length, machineNames.length);
        for (let index = 0; index < length; index += 1) {
          const idCandidate =
            machineIds[index] ?? machineIds[0] ?? column.machineId ?? null;
          const nameCandidate =
            machineNames[index] ?? machineNames[0] ?? column.machineName ?? null;
          const coercedId = coerceId(idCandidate);
          const coercedName = coerceName(nameCandidate);
          if (coercedId != null || coercedName != null) {
            sessionRows.push({
              user: undefined,
              machineId: coercedId,
              machineName: coercedName,
              durationMin: null,
              hours: null,
            });
          }
        }
      }

      map.set(column.key, sessionRows);
    });

    return map;
  }, [columns]);

  const getMachineLabel = useCallback(
    (columnKey: string) => {
      const rows = sessionRowsByColumnKey.get(columnKey) ?? [];
      return toMachineHeader(rows);
    },
    [sessionRowsByColumnKey],
  );

  const totalsByColumnKey = useMemo(() => {
    const map = new Map<string, number>();
    indexedColumns.forEach(({ column, index }) => {
      const rows = sessionRowsByColumnKey.get(column.key) ?? [];
      const hasDurations = rows.some(
        (row) => typeof row.durationMin === 'number' || typeof row.hours === 'number',
      );
      if (hasDurations) {
        map.set(column.key, sumColumnHours(rows));
        return;
      }
      let total = 0;
      for (const day of days) {
        const value = day.values[index];
        if (typeof value === 'number' && Number.isFinite(value)) {
          total += value;
        }
      }
      map.set(column.key, Math.round(total * 10) / 10);
    });
    return map;
  }, [days, indexedColumns, sessionRowsByColumnKey]);

  useEffect(() => {
    setEmployeeFilter((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const valid = prev.filter((name) => employeeOptions.includes(name));
      return valid.length === prev.length ? prev : valid;
    });
  }, [employeeOptions]);

  const selectedEmployeeSet = useMemo(() => new Set(employeeFilter), [employeeFilter]);
  const hasEmployeeFilter = selectedEmployeeSet.size > 0;

  const visibleColumnCount = useMemo(() => {
    if (!hasEmployeeFilter) {
      return indexedColumns.length;
    }
    const selected = new Set(employeeFilter);
    let count = 0;
    indexedColumns.forEach(({ column }) => {
      if (selected.has(column.userName)) {
        count += 1;
      }
    });
    return count;
  }, [employeeFilter, hasEmployeeFilter, indexedColumns]);

  const columnPaddingCount = Math.max(0, MIN_DYNAMIC_COLUMNS - visibleColumnCount);
  const tableStyle = useMemo(
    () =>
      ({
        '--reports-min-cols': String(Math.max(MIN_DYNAMIC_COLUMNS, visibleColumnCount || MIN_DYNAMIC_COLUMNS)),
      }) as CSSProperties & { '--reports-min-cols': string },
    [visibleColumnCount],
  );

  const printColumnChunks = useMemo(() => {
    const chunkSize = PRINT_COLUMNS_PER_PAGE;
    const result: { column: ReportColumn; index: number }[][] = [];
    for (let i = 0; i < indexedColumns.length; i += chunkSize) {
      result.push(indexedColumns.slice(i, i + chunkSize));
    }
    if (result.length === 0) {
      return [[]] as { column: ReportColumn; index: number }[][];
    }
    return result;
  }, [indexedColumns]);

  const handleEmployeeFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions)
      .map((option) => option.value)
      .filter((name) => name);
    setEmployeeFilter(values);
  };

  const handleEmployeeFilterReset = () => {
    setEmployeeFilter([]);
  };

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
      setEmployeeFilter([]);
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
      <div className="print-hide">
        <ReportsTabs />
      </div>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">現場別集計</h1>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 print-hide">
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
        <div className="flex items-center gap-3 print-hide">
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-3 print-hide">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium">従業員名（複数選択可）</span>
              <select
                multiple
                size={Math.min(6, Math.max(4, employeeOptions.length))}
                className="rounded border px-2 py-1 min-w-48"
                value={employeeFilter}
                onChange={handleEmployeeFilterChange}
              >
                {employeeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-1 flex-wrap items-start gap-3">
              <button
                type="button"
                onClick={handleEmployeeFilterReset}
                className="rounded border px-3 py-1 text-sm"
                disabled={!hasEmployeeFilter}
              >
                全員を表示
              </button>
              <PrintControls className="ml-auto" title="現場別集計（A4）" />
            </div>
          </div>
          <div className="screen-table-wrapper">
            <div className="overflow-x-auto rounded border">
              <table className="table-unified text-sm print-avoid-break" style={tableStyle}>
                <thead>
                  <tr className="bg-gray-50">
                    <th className="col-narrow border px-2 py-1 text-right">日</th>
                    <th className="col-narrow border px-2 py-1 text-center">曜</th>
                    {indexedColumns.map(({ column }) => {
                      const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                      const className = hidden
                        ? 'border px-2 py-1 text-left screen-hidden'
                        : 'border px-2 py-1 text-left';
                      return (
                        <th key={`user-${column.key}`} className={className}>
                          {column.userName}
                        </th>
                      );
                    })}
                    {Array.from({ length: columnPaddingCount }).map((_, index) => (
                      <th key={`user-pad-${index}`} className="border px-2 py-1" aria-hidden="true" />
                    ))}
                  </tr>
                  <tr className="bg-gray-50">
                    <th className="col-narrow border px-2 py-1" />
                    <th className="col-narrow border px-2 py-1" />
                    {indexedColumns.map(({ column }) => {
                      const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                      const className = hidden
                        ? 'border px-2 py-1 text-left screen-hidden'
                        : 'border px-2 py-1 text-left';
                      return (
                        <th key={`work-${column.key}`} className={className}>
                          {getMachineLabel(column.key)}
                        </th>
                      );
                    })}
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
                        {indexedColumns.map(({ column, index }) => {
                          const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                          const className = hidden
                            ? 'border px-2 py-1 text-right tabular-nums screen-hidden'
                            : 'border px-2 py-1 text-right tabular-nums';
                          return (
                            <td key={`${row.date}-${column.key}`} className={className}>
                              {formatHoursOrEmpty(row.values[index] ?? null)}
                            </td>
                          );
                        })}
                        {Array.from({ length: columnPaddingCount }).map((_, index) => (
                          <td key={`pad-${row.date}-${index}`} className="border px-2 py-1" aria-hidden="true" />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100">
                    <td className="col-narrow border px-2 py-1 font-semibold">稼働合計</td>
                    <td className="col-narrow border px-2 py-1" />
                    {indexedColumns.map(({ column }) => {
                      const hidden = hasEmployeeFilter && !selectedEmployeeSet.has(column.userName);
                      const baseClass = 'border px-2 py-1 text-right tabular-nums font-semibold';
                      const className = hidden ? `${baseClass} screen-hidden` : baseClass;
                      const total = totalsByColumnKey.get(column.key);
                      const safeTotal =
                        typeof total === 'number' && Number.isFinite(total) ? total : 0;
                      return (
                        <td key={`total-${column.key}`} className={className}>
                          {safeTotal.toFixed(1)}
                        </td>
                      );
                    })}
                    {Array.from({ length: columnPaddingCount }).map((_, index) => (
                      <td key={`total-pad-${index}`} className="border px-2 py-1" aria-hidden="true" />
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          {printColumnChunks.length > 0 ? (
            <div className="print-table-wrapper">
              {printColumnChunks.map((chunk, chunkIndex) => {
                const chunkStyle = {
                  '--reports-min-cols': String(2 + chunk.length),
                } as CSSProperties & { '--reports-min-cols': string };
                const blockClassName =
                  chunkIndex === 0 ? 'print-table-block' : 'print-table-block print-break-before';
                return (
                  <div key={`print-chunk-${chunkIndex}`} className={blockClassName}>
                    <table className="table-unified text-sm print-avoid-break" style={chunkStyle}>
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="col-narrow border px-2 py-1 text-right">日</th>
                          <th className="col-narrow border px-2 py-1 text-center">曜</th>
                          {chunk.map(({ column }) => (
                            <th key={`print-user-${column.key}`} className="border px-2 py-1 text-left">
                              {column.userName}
                            </th>
                          ))}
                        </tr>
                        <tr className="bg-gray-50">
                          <th className="col-narrow border px-2 py-1" />
                          <th className="col-narrow border px-2 py-1" />
                          {chunk.map(({ column }) => (
                            <th key={`print-work-${column.key}`} className="border px-2 py-1 text-left">
                              {getMachineLabel(column.key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((row) => {
                          const { day, weekdayJp } = getJstParts(row.date);
                          return (
                            <tr key={`${row.date}-chunk-${chunkIndex}`}>
                              <td className="col-narrow border px-2 py-1 text-right">{day}</td>
                              <td className="col-narrow border px-2 py-1 text-center">{weekdayJp}</td>
                              {chunk.map(({ column, index }) => (
                                <td
                                  key={`${row.date}-print-${column.key}`}
                                  className="border px-2 py-1 text-right tabular-nums"
                                >
                                  {formatHoursOrEmpty(row.values[index] ?? null)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100">
                          <td className="col-narrow border px-2 py-1 font-semibold">稼働合計</td>
                          <td className="col-narrow border px-2 py-1" />
                          {chunk.map(({ column }) => {
                            const total = totalsByColumnKey.get(column.key);
                            const safeTotal =
                              typeof total === 'number' && Number.isFinite(total) ? total : 0;
                            return (
                              <td
                                key={`print-total-${column.key}`}
                                className="border px-2 py-1 text-right tabular-nums font-semibold"
                              >
                                {safeTotal.toFixed(1)}
                              </td>
                            );
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-gray-500">条件を選択し「集計する」を押すと結果が表示されます。</p>
      )}
    </div>
  );
}
