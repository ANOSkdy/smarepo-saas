import { ReportsContent, type ReportRecord } from './components/ResultsTable';
import type { FiltersValue } from './components/Filters';
import { buildSessionReport, getLogsBetween } from '@/lib/airtable/logs';

const JST_OFFSET_MINUTES = 9 * 60;

export const revalidate = 0;

function getCurrentJstYearMonth(): { year: number; month: number } {
  const now = new Date();
  const utcMillis = now.getTime() + JST_OFFSET_MINUTES * 60 * 1000;
  const jst = new Date(utcMillis);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}

function resolveMonthRange(year: number, month: number) {
  const startUtc = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const endUtc = new Date(Date.UTC(nextMonth.year, nextMonth.month - 1, 1, -9, 0, 0));
  return { from: startUtc, to: endUtc };
}

function matchesFilter(value: string | null, query?: string): boolean {
  if (!query) {
    return true;
  }
  if (!value) {
    return false;
  }
  return value.toLocaleLowerCase('ja').includes(query.toLocaleLowerCase('ja'));
}

async function fetchInitialRecords(filters: FiltersValue): Promise<ReportRecord[]> {
  try {
    const range = resolveMonthRange(filters.year, filters.month);
    const logs = await getLogsBetween(range);
    const rows = buildSessionReport(logs).filter((row) => {
      if (!matchesFilter(row.siteName ?? null, filters.sitename)) {
        return false;
      }
      if (!matchesFilter(row.userName, filters.username)) {
        return false;
      }
      const machineLabel = row.machineName ?? row.machineId ?? null;
      if (!matchesFilter(machineLabel, filters.machinename)) {
        return false;
      }
      return true;
    });

    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      username: row.userName,
      sitename: row.siteName ?? '',
      machinename: row.machineName ?? row.machineId ?? '',
      workdescription: row.workDescription ?? '',
      hours: row.hours,
    }));
  } catch (error) {
    console.error('Failed to load initial report records', error);
    return [];
  }
}

export default async function ReportsPage() {
  const initialFilter: FiltersValue = {
    ...getCurrentJstYearMonth(),
  };

  const initialRecords = await fetchInitialRecords(initialFilter);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">稼働集計</h1>
        <p className="text-sm text-muted-foreground">
          月次の稼働実績を名称で検索し、PDF・Excel（自由列）・CSVでダウンロードできます。
        </p>
      </header>
      <ReportsContent initialRecords={initialRecords} initialFilter={initialFilter} />
    </main>
  );
}
