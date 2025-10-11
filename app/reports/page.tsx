import { ReportsContent, type ReportRecord } from './components/ResultsTable';
import type { FiltersValue } from './components/Filters';
import { listRecords, type AirtableRecord } from '../../src/lib/airtable/client';

const REPORT_INDEX_TABLE = process.env.AIRTABLE_TABLE_REPORT_INDEX || 'ReportIndex';
const JST_OFFSET_MINUTES = 9 * 60;

export const revalidate = 0;

type ReportIndexFields = {
  date?: string;
  username?: string;
  sitename?: string;
  machinename?: string;
  workdescription?: string;
  hours?: number;
};

type CompletedReportIndexFields = ReportIndexFields & { date: string; hours: number };

function isCompletedRecord(
  record: AirtableRecord<ReportIndexFields>
): record is AirtableRecord<CompletedReportIndexFields> {
  return typeof record.fields.date === 'string' && typeof record.fields.hours === 'number';
}

function escapeFormulaText(value: string): string {
  return value.replace(/'/g, "\\'");
}

function buildFilterFormula(filters: FiltersValue): string {
  const clauses: string[] = [`({year}=${filters.year})`, `({month}=${filters.month})`];
  const toSearch = (field: 'sitename' | 'username' | 'machinename', value: string) =>
    `SEARCH(LOWER('${escapeFormulaText(value)}'), LOWER({${field}}&''))`;
  if (filters.sitename) {
    clauses.push(toSearch('sitename', filters.sitename));
  }
  if (filters.username) {
    clauses.push(toSearch('username', filters.username));
  }
  if (filters.machinename) {
    clauses.push(toSearch('machinename', filters.machinename));
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return `AND(${clauses.join(',')})`;
}

function getCurrentJstYearMonth(): { year: number; month: number } {
  const now = new Date();
  const utcMillis = now.getTime() + JST_OFFSET_MINUTES * 60 * 1000;
  const jst = new Date(utcMillis);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}

async function fetchInitialRecords(filters: FiltersValue): Promise<ReportRecord[]> {
  const filterFormula = buildFilterFormula(filters);
  try {
    const records = await listRecords<ReportIndexFields>({
      table: REPORT_INDEX_TABLE,
      filterByFormula: filterFormula,
      fields: ['date', 'username', 'sitename', 'machinename', 'workdescription', 'hours'],
      sort: [
        { field: 'sitename', direction: 'asc' },
        { field: 'username', direction: 'asc' },
        { field: 'machinename', direction: 'asc' },
        { field: 'date', direction: 'asc' },
      ],
    });
    return records.filter(isCompletedRecord).map((record) => ({
      id: record.id,
      date: record.fields.date,
      username: record.fields.username ?? '',
      sitename: record.fields.sitename ?? '',
      machinename: record.fields.machinename ?? '',
      workdescription: record.fields.workdescription ?? '',
      hours: record.fields.hours,
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
        <p className="text-sm font-medium text-primary">帳票出力</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">稼働集計</h1>
        <p className="text-sm text-muted-foreground">
          月次の稼働実績を検索し、CSVやPDFの帳票としてダウンロードできます。
        </p>
      </header>
      <ReportsContent initialRecords={initialRecords} initialFilter={initialFilter} />
    </main>
  );
}
