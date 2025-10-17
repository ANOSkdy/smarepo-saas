import type { ReportLogRow } from '@/lib/airtable/logs';

export type ReportRow = {
  year: number;
  month: number;
  day: number;
  sitename: string;
  hours: number;
  username: string;
  userKey: string;
  date: string;
};

export function buildDailyRowsFromLogs(logs: ReportLogRow[]): ReportRow[] {
  const byUser = new Map<string, Map<string, Map<string, ReportLogRow[]>>>();

  for (const log of logs) {
    const userKey = (log.username && log.username.trim()) || log.userId || '';
    if (!log.date || !userKey) {
      continue;
    }
    const siteName = log.siteName || '';

    const dateMap = byUser.get(userKey) ?? new Map<string, Map<string, ReportLogRow[]>>();
    const siteMap = dateMap.get(log.date) ?? new Map<string, ReportLogRow[]>();
    const list = siteMap.get(siteName) ?? [];

    list.push(log);

    siteMap.set(siteName, list);
    dateMap.set(log.date, siteMap);
    byUser.set(userKey, dateMap);
  }

  const rows: ReportRow[] = [];

  for (const [userKey, dateMap] of byUser.entries()) {
    for (const [date, siteMap] of dateMap.entries()) {
      for (const [siteName, entries] of siteMap.entries()) {
        const sorted = [...entries].sort((a, b) =>
          a.timestamp.localeCompare(b.timestamp),
        );

        let openIn: ReportLogRow | null = null;
        let totalMs = 0;

        for (const entry of sorted) {
          if (entry.type === 'IN') {
            openIn = entry;
            continue;
          }
          if (entry.type === 'OUT' && openIn) {
            const start = Date.parse(openIn.timestamp);
            const end = Date.parse(entry.timestamp);
            if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
              totalMs += end - start;
            }
            openIn = null;
          }
        }

        if (totalMs <= 0) {
          continue;
        }

        const [year, month, day] = date.split('-').map((value) => Number(value));
        const displayName =
          entries.find((entry) => entry.username)?.username ||
          entries.find((entry) => entry.userId)?.userId ||
          userKey;

        rows.push({
          year,
          month,
          day,
          sitename: siteName,
          hours: Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100,
          username: displayName,
          userKey,
          date,
        });
      }
    }
  }

  return rows;
}
