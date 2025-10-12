import ExcelJS, { type Workbook as ExcelWorkbook } from '../exceljs';

export type ExcelRow = {
  date: string;
  sitename: string;
  username: string;
  machinename?: string;
  workdescription?: string;
  hours: number;
};

function sanitizeNumber(value: number): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export async function buildFreeUserColumnsWorkbook(
  rows: ExcelRow[],
  year: number,
  month: number
): Promise<ExcelWorkbook> {
  const workbook = new ExcelJS.Workbook();

  const dataSheet = workbook.addWorksheet('Data', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  dataSheet.addRow([
    'date',
    'sitename',
    'username',
    'machinename',
    'workdescription',
    'hours',
  ]);
  rows.forEach((row) => {
    dataSheet.addRow([
      row.date,
      row.sitename ?? '',
      row.username ?? '',
      row.machinename ?? '',
      row.workdescription ?? '',
      sanitizeNumber(row.hours ?? 0),
    ]);
  });
  [14, 24, 18, 18, 28, 10].forEach((width, index) => {
    const column = dataSheet.getColumn(index + 1);
    column.width = width;
  });

  const sheet = workbook.addWorksheet('自由列', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 1 }],
  });
  sheet.getCell('A1').value =
    '稼働集計（自由列：E2以降に従業員名を入力し、右へ式コピーで列追加）';
  sheet.getCell('B1').value = year;
  sheet.getCell('C1').value = month;
  sheet.getCell('A2').value = '日付';
  sheet.getCell('B2').value = '現場名(任意)';
  sheet.getCell('C2').value = '機械名(任意)';
  sheet.getCell('D2').value = '作業(任意)';
  sheet.getColumn(1).width = 12;

  for (let day = 1; day <= 31; day += 1) {
    const rowIndex = 2 + day;
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = {
      formula: 'DATE($B$1,$C$1,ROW()-2)',
    };
    row.getCell(5).value = {
      formula: `SUMIFS(Data!F:F,Data!A:A,$A${rowIndex},Data!C:C,E$2)`,
    };
  }

  return workbook;
}
