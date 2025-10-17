import ReportsClient from './ReportsClient';
import { auth } from '@/lib/auth';
import { listLogsForReports } from '@/lib/airtable/logs';
import { buildDailyRowsFromLogs } from '@/lib/reporting/fromLogs';

export default async function ReportsPage() {
  const session = await auth();

  if (!session?.user) {
    return <div className="p-6">Unauthorized</div>;
  }

  const logs = await listLogsForReports();
  const dailyRows = buildDailyRowsFromLogs(logs);
  const users = Array.from(new Set(dailyRows.map((row) => row.username))).sort(
    (a, b) => a.localeCompare(b, 'ja'),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <ReportsClient
        allRows={dailyRows}
        users={users}
        defaultUser={users[0] ?? ''}
      />
    </main>
  );
}
