const FALLBACK_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

type DayjsInstance = {
  isValid: () => boolean;
  format: (pattern: string) => string;
  date: () => number;
  daysInMonth: () => number;
};

type DayjsModule = {
  (value?: string | number | Date): DayjsInstance;
  locale?: (locale: string) => void;
};

let cachedDayjs: DayjsModule | false | null = null;

function loadDayjs(): DayjsModule | null {
  if (cachedDayjs === false) {
    return null;
  }
  if (cachedDayjs) {
    return cachedDayjs;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require('dayjs') as DayjsModule | { default: DayjsModule };
    const moduleExport = 'default' in required ? required.default : required;
    if (moduleExport && typeof moduleExport.locale === 'function') {
      moduleExport.locale('ja');
    }
    cachedDayjs = moduleExport;
    return moduleExport;
  } catch {
    cachedDayjs = false;
    return null;
  }
}

function parseDate(value: string): Date | null {
  const [y, m, d] = value.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const utc = Date.UTC(y, m - 1, d);
  if (Number.isNaN(utc)) {
    return null;
  }
  return new Date(utc);
}

function getJstDayIndex(date: Date): number {
  const jstTime = date.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstTime);
  return jst.getUTCDay();
}

function formatWithIntl(date: Date): string {
  const month = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
  }).format(date);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    day: '2-digit',
  }).format(date);
  const weekdayRaw = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(date);
  const trimmedWeekday = weekdayRaw.replace('曜日', '');
  const normalizedWeekday = trimmedWeekday.length === 1 ? trimmedWeekday : FALLBACK_WEEKDAYS[getJstDayIndex(date)];
  return `${month}/${day}(${normalizedWeekday})`;
}

export function formatDateWithWeekday(value: string): string {
  const dayjs = loadDayjs();
  if (dayjs) {
    const instance = dayjs(value);
    if (instance.isValid()) {
      return instance.format('MM/DD(ddd)');
    }
  }
  const date = parseDate(value);
  if (!date) {
    return value;
  }
  return formatWithIntl(date);
}

export function extractDayFromDateString(value: string): number | null {
  const dayjs = loadDayjs();
  if (dayjs) {
    const instance = dayjs(value);
    if (instance.isValid()) {
      return instance.date();
    }
  }
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', day: 'numeric' }).format(jst));
}

export function computeDaysInMonth(year: number, month: number): number {
  const dayjs = loadDayjs();
  if (dayjs) {
    const instance = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
    if (instance.isValid()) {
      return instance.daysInMonth();
    }
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
