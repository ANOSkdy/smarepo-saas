export type LogRec = {
  id: string;
  fields: {
    timestamp: string;
    type: 'IN' | 'OUT';
    siteName?: string;
    workDescription?: string;
  };
};

export type SessionRow = {
  year: number;
  month: number;
  day: number;
  siteName: string;
  hours: number;
};

function toJSTDateParts(iso: string) {
  const t = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(t);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Logs(時系列) から同一日内の IN→OUT を順次ペアリングして SessionRow を作成 */
export function pairLogsToSessions(logs: LogRec[]): SessionRow[] {
  const sorted = [...logs].sort(
    (a, b) =>
      new Date(a.fields.timestamp).getTime() -
      new Date(b.fields.timestamp).getTime(),
  );
  const sessions: SessionRow[] = [];
  let lastIn: LogRec | null = null;
  for (const log of sorted) {
    if (log.fields.type === 'IN') {
      lastIn = log;
      continue;
    }
    if (log.fields.type === 'OUT' && lastIn) {
      const tIn = new Date(lastIn.fields.timestamp).getTime();
      const tOut = new Date(log.fields.timestamp).getTime();
      if (tOut > tIn) {
        const { year, month, day } = toJSTDateParts(lastIn.fields.timestamp);
        const hours = Math.round(((tOut - tIn) / 3600000) * 100) / 100;
        sessions.push({
          year,
          month,
          day,
          siteName: lastIn.fields.siteName ?? log.fields.siteName ?? '',
          hours,
        });
      }
      lastIn = null;
    }
  }
  return sessions;
}
