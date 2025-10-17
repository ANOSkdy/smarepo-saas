export const LOGS_ALLOWED_FIELDS = [
  'timestamp',
  'date',
  'user',
  'machine',
  'siteName',
  'lat',
  'lon',
  'accuracy',
  'work',
  'workDescription',
  'type',
  'clientName',
] as const;

export type LogsAllowedKey = (typeof LOGS_ALLOWED_FIELDS)[number];

export function filterFields<T extends Record<string, unknown>>(
  candidate: T,
  allowed: readonly string[],
  { dropNull = true } = {},
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(candidate).filter(
      ([k, v]) => allowed.includes(k) && (!dropNull || v != null),
    ),
  );
}
