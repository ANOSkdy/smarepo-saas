// Minimal JST date helpers without external deps.
// Purpose: (1) Stable JST y/m/d extraction, (2) Weekday JP mapping.
// Note: Do NOT export Date objects; return plain numbers/strings to avoid TZ drift in callers.
export type JstParts = { year: number; month: number; day: number; weekdayJp: string };

function toDate(input: string | number | Date): Date {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // Interpret plain dates as UTC to prevent implicit local conversion.
    return new Date(`${input}T00:00:00.000Z`);
  }
  return new Date(input);
}

/**
 * Accepts ISO-like date strings (e.g., "2025-10-01") or timestamp strings.
 * Computes parts in Asia/Tokyo to avoid UTC↔JST shift.
 */
export function getJstParts(input: string | number | Date): JstParts {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date input for getJstParts');
  }
  const timeZone = 'Asia/Tokyo';

  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const [yearText, monthText, dayText] = formatted.split('-');

  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    weekdayJp: new Intl.DateTimeFormat('ja-JP', {
      timeZone,
      weekday: 'short',
    }).format(d),
  };
}

/** Hours formatter: show empty for 0 or falsy, otherwise 1 decimal with "h". */
export function formatHoursOrEmpty(hours: unknown): string {
  if (hours === null || hours === undefined) {
    return '';
  }
  const n = typeof hours === 'number' ? hours : Number(hours);
  if (!Number.isFinite(n)) {
    return '';
  }
  const rounded = Number(n.toFixed(1));
  if (rounded === 0) {
    return '';
  }
  return `${rounded.toFixed(1)}h`;
}
