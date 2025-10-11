import { baseCss, type HeaderInfo, type ReportRow } from '../../../lib/pdf/render';
import { formatDateWithWeekday } from '../../../lib/pdf/date';

export function renderPersonalList(header: HeaderInfo, rows: ReportRow[]): string {
  const total = rows.reduce((sum, row) => sum + (row.hours || 0), 0).toFixed(2);
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          <td class="nowrap">${formatDateWithWeekday(row.date)}</td>
          <td>${row.sitename || ''}</td>
          <td>${row.machinename || ''}</td>
          <td>${row.workdescription || ''}</td>
          <td class="right">${(row.hours ?? 0).toFixed(2)}</td>
        </tr>`
    )
    .join('');

  const userLine = header.userName ? `<div class="subtitle">作業員: ${header.userName}</div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${baseCss()}</style></head><body>
    <h1>${header.title}</h1>
    <div class="meta">対象: ${header.year}年${header.month}月 / 作成: ${header.generatedAt}</div>
    ${userLine}
    <table class="grid">
      <thead>
        <tr>
          <th>日付</th>
          <th>現場</th>
          <th>機械</th>
          <th>作業</th>
          <th>時間</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <th class="right">合計</th>
          <th colspan="3"></th>
          <th class="right">${total}</th>
        </tr>
      </tfoot>
    </table>
  </body></html>`;
}
