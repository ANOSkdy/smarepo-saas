import { baseCss, type HeaderInfo, type ReportRow } from '../../../lib/pdf/render';
import { computeDaysInMonth, extractDayFromDateString } from '../../../lib/pdf/date';

function formatCellValue(value: number): string {
  if (value <= 0) {
    return '';
  }
  if (value >= 1) {
    return Math.floor(value).toString();
  }
  return '●';
}

export function renderMonthlyMatrix(header: HeaderInfo, rows: ReportRow[]): string {
  const daysInMonth = computeDaysInMonth(header.year, header.month);
  const matrix = new Map<
    string,
    {
      username: string;
      sitename: string;
      machinename: string;
      workdescription: string;
      values: number[];
    }
  >();
  const columnTotals = Array.from({ length: daysInMonth }, () => 0);

  rows.forEach((row) => {
    const day = extractDayFromDateString(row.date);
    if (!day) {
      return;
    }
    if (day < 1 || day > daysInMonth) {
      return;
    }
    const key = `${row.username}|${row.sitename}|${row.machinename || ''}|${row.workdescription || ''}`;
    const record = matrix.get(key) ?? {
      username: row.username,
      sitename: row.sitename,
      machinename: row.machinename || '',
      workdescription: row.workdescription || '',
      values: Array.from({ length: daysInMonth }, () => 0),
    };
    record.values[day - 1] += row.hours ?? 0;
    matrix.set(key, record);
    columnTotals[day - 1] += row.hours ?? 0;
  });

  const sortedRows = Array.from(matrix.values()).sort((a, b) => {
    return [a.sitename, a.username, a.machinename, a.workdescription].join('\u0000').localeCompare(
      [b.sitename, b.username, b.machinename, b.workdescription].join('\u0000'),
      'ja'
    );
  });

  const tableRows = sortedRows
    .map((item) => {
      const total = item.values.reduce((sum, value) => sum + value, 0);
      const cells = item.values
        .map((value) => `<td class="center">${formatCellValue(value)}</td>`)
        .join('');
      return `
        <tr>
          <td>${item.username}</td>
          <td>${item.sitename}</td>
          <td>${item.machinename}</td>
          <td>${item.workdescription}</td>
          ${cells}
          <td class="right">${total.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const totals = columnTotals
    .map((value) => `<th class="center">${value > 0 ? value.toFixed(1) : ''}</th>`)
    .join('');
  const grandTotal = columnTotals.reduce((sum, value) => sum + value, 0);

  const headerDays = Array.from({ length: daysInMonth }, (_, index) => index + 1)
    .map((day) => `<th class="center nowrap">${day}</th>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${baseCss()}</style></head><body>
    <h1>${header.title}</h1>
    <div class="meta">対象: ${header.year}年${header.month}月 / 作成: ${header.generatedAt}</div>
    <table class="grid">
      <thead>
        <tr>
          <th>作業員</th>
          <th>現場</th>
          <th>機械</th>
          <th>作業</th>
          ${headerDays}
          <th class="right">行合計</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr>
          <th colspan="4" class="right">日別合計</th>
          ${totals}
          <th class="right">${grandTotal.toFixed(2)}</th>
        </tr>
      </tfoot>
    </table>
  </body></html>`;
}
