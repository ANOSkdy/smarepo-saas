export type CsvInput = {
  headers: string[];
  rows: (string | number | null | undefined)[][];
  includeBom?: boolean;
};

export function toCsv({ headers, rows, includeBom = false }: CsvInput): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeValue).join(','));
  const content = lines.join('\r\n');
  return includeBom ? `\uFEFF${content}` : content;
}

function escapeValue(value: string | number | null | undefined): string {
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  const stringValue = String(value);
  if (stringValue === '') {
    return '';
  }
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
