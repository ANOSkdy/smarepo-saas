import type { ReportRow } from '@/lib/reports/pair';
import { fetchSessionReportRows } from '@/src/lib/sessions-reports';
import { applyTimeCalcV2FromMinutes } from '@/src/lib/timecalc';

type SortKey = 'year' | 'month' | 'day' | 'siteName';

export async function getReportRowsByUserName(
  userName: string,
  sort?: SortKey,
  order: 'asc' | 'desc' = 'asc',
): Promise<ReportRow[]> {
  const trimmedName = userName.trim();
  if (!trimmedName) {
    return [];
  }

  const sessions = await fetchSessionReportRows({ userName: trimmedName });
  const rows = sessions
    .filter((session) => session.isCompleted && session.year && session.month && session.day)
    .map<ReportRow>((session) => {
      const rawMinutes =
        session.durationMin ?? (session.hours != null ? Math.round(session.hours * 60) : null);
      const candidate = typeof rawMinutes === 'number' ? Math.round(rawMinutes) : 0;
      const withinBounds = candidate > 0 && candidate < 24 * 60 ? candidate : 0;
      const { minutes } = applyTimeCalcV2FromMinutes(withinBounds);
      return {
        year: session.year ?? 0,
        month: session.month ?? 0,
        day: session.day ?? 0,
        siteName: session.siteName ?? '',
        clientName: session.clientName ?? undefined,
        minutes,
      } satisfies ReportRow;
    })
    .filter((row) => row.year > 0 && row.month > 0 && row.day > 0);

  if (sort) {
    const dir = order === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const aValue = a[sort];
      const bValue = b[sort];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const result = aValue.localeCompare(bValue, 'ja');
        return dir === 1 ? result : -result;
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        const result = aValue - bValue;
        return dir === 1 ? result : -result;
      }
      return 0;
    });
  }

  return rows;
}
