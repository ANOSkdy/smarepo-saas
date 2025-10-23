export type LogRecord = {
  id: string;
  fields: {
    type?: 'IN' | 'OUT';
    timestamp?: string;
    date?: string;
    siteName?: string;
    clientName?: string;
    user?: readonly string[];
  };
};

export type ReportRow = {
  year: number;
  month: number;
  day: number;
  siteName: string;
  clientName?: string;
  minutes: number;
  startJst?: string | null;
  endJst?: string | null;
  overtimeHours?: string | null;
};

type DateParts = {
  key: string;
  year: number;
  month: number;
  day: number;
};

function parseDateParts(record: LogRecord): DateParts | null {
  const dateField = record.fields.date?.trim();
  if (dateField) {
    const [yearStr, monthStr, dayStr] = dateField.split('-');
    const year = Number.parseInt(yearStr ?? '', 10);
    const month = Number.parseInt(monthStr ?? '', 10);
    const day = Number.parseInt(dayStr ?? '', 10);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const key = `${year.toString().padStart(4, '0')}-${month
        .toString()
        .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      return { key, year, month, day };
    }
  }

  const timestamp = record.fields.timestamp;
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const key = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return { key, year, month, day };
}

function parseTimestampMs(record: LogRecord): number | null {
  const timestamp = record.fields.timestamp;
  if (!timestamp) {
    return null;
  }
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? null : value;
}

/**
 * Logs の IN/OUT を日単位で時系列ペアリングし、稼働時間（分）を算出します。
 * 未完のペア（IN のみ / OUT のみ）は破棄します。
 */
export function pairLogsByDay(logs: LogRecord[]): ReportRow[] {
  const sorted = [...logs].sort((a, b) => {
    const ta = parseTimestampMs(a) ?? 0;
    const tb = parseTimestampMs(b) ?? 0;
    return ta - tb;
  });

  const pendingMap = new Map<string, LogRecord[]>();
  const rows: ReportRow[] = [];

  for (const record of sorted) {
    const type = record.fields.type;
    if (type !== 'IN' && type !== 'OUT') {
      continue;
    }
    const dateParts = parseDateParts(record);
    if (!dateParts) {
      continue;
    }
    const { key, year, month, day } = dateParts;
    if (type === 'IN') {
      const queue = pendingMap.get(key) ?? [];
      queue.push(record);
      pendingMap.set(key, queue);
      continue;
    }

    const queue = pendingMap.get(key);
    if (!queue || queue.length === 0) {
      continue;
    }
    const inRecord = queue.shift();
    if (queue.length === 0) {
      pendingMap.delete(key);
    } else {
      pendingMap.set(key, queue);
    }
    if (!inRecord) {
      continue;
    }

    const startMs = parseTimestampMs(inRecord);
    const endMs = parseTimestampMs(record);
    if (startMs === null || endMs === null) {
      continue;
    }
    const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
    const siteName = inRecord.fields.siteName ?? record.fields.siteName ?? '';
    const clientName = inRecord.fields.clientName ?? record.fields.clientName ?? undefined;

    rows.push({
      year,
      month,
      day,
      siteName,
      clientName,
      minutes,
    });
  }

  return rows;
}
