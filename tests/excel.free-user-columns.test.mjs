import { test } from 'node:test';
import assert from 'node:assert/strict';

const excelModulePromise = import(
  new URL('./dist/src/lib/excel/freeUserColumns.js', import.meta.url).href
);

test('buildFreeUserColumnsWorkbook outputs expected sheets and formulas', async () => {
  const { buildFreeUserColumnsWorkbook } = await excelModulePromise;
  const workbook = await buildFreeUserColumnsWorkbook(
    [
      {
        date: '2024-05-01',
        sitename: 'Site A',
        username: 'User A',
        machinename: 'Machine X',
        workdescription: 'Welding',
        hours: 8,
      },
      {
        date: '2024-05-02',
        sitename: 'Site B',
        username: 'User B',
        machinename: 'Machine Y',
        workdescription: 'Inspection',
        hours: 6.5,
      },
    ],
    2024,
    5
  );

  const worksheetNames = workbook.worksheets.map((sheet) => sheet.name);
  assert.deepEqual(worksheetNames, ['Data', '自由列']);

  const dataSheet = workbook.getWorksheet('Data');
  assert.ok(dataSheet);
  const headerValues = dataSheet.getRow(1).values.slice(1);
  assert.deepEqual(headerValues, [
    'date',
    'sitename',
    'username',
    'machinename',
    'workdescription',
    'hours',
  ]);
  const firstDataRow = dataSheet.getRow(2).values.slice(1);
  assert.deepEqual(firstDataRow, [
    '2024-05-01',
    'Site A',
    'User A',
    'Machine X',
    'Welding',
    8,
  ]);

  const freeSheet = workbook.getWorksheet('自由列');
  assert.ok(freeSheet);
  assert.equal(
    freeSheet.getCell('A1').value,
    '稼働集計（自由列：E2以降に従業員名を入力し、右へ式コピーで列追加）'
  );
  assert.equal(freeSheet.getCell('B1').value, 2024);
  assert.equal(freeSheet.getCell('C1').value, 5);
  assert.equal(freeSheet.getCell('A2').value, '日付');

  const [view] = freeSheet.views ?? [];
  assert.equal(view?.state, 'frozen');
  assert.equal(view?.ySplit, 2);

  const formulaCell = freeSheet.getCell('E3');
  assert.ok(formulaCell.value && typeof formulaCell.value === 'object');
  assert.equal(
    formulaCell.value.formula,
    'SUMIFS(Data!F:F,Data!A:A,$A3,Data!C:C,E$2)'
  );
});
