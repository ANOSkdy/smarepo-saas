import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

execSync(
  'pnpm exec tsc -p tsconfig.json --outDir tests/dist --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --noEmit false',
  { cwd: root, stdio: 'inherit' },
);

const { renderPersonalList } = await import('./dist/src/app/reports/_templates/personal-list.js');
const { renderMonthlyMatrix } = await import('./dist/src/app/reports/_templates/monthly-matrix.js');

const headerBase = {
  title: 'テスト帳票',
  year: 2024,
  month: 5,
  generatedAt: '2024/05/01 12:00',
};

test('renderPersonalList generates totals and metadata', () => {
  const html = renderPersonalList(
    { ...headerBase, title: '個人別 勤務実績', userName: '山田太郎' },
    [
      {
        date: '2024-05-01',
        username: '山田太郎',
        sitename: '本社',
        machinename: 'ショベルカー',
        workdescription: '掘削',
        hours: 1.5,
      },
    ],
  );
  assert.ok(html.includes('個人別 勤務実績'));
  assert.ok(html.includes('作業員: 山田太郎'));
  assert.ok(html.includes('<th class="right">合計</th>'));
  assert.ok(html.includes('1.50'));
});

test('renderMonthlyMatrix aggregates days and totals', () => {
  const html = renderMonthlyMatrix(
    { ...headerBase, title: '月次稼働マトリクス', siteName: '本社' },
    [
      {
        date: '2024-05-01',
        username: '山田太郎',
        sitename: '本社',
        machinename: 'ショベルカー',
        workdescription: '掘削',
        hours: 0.5,
      },
      {
        date: '2024-05-02',
        username: '山田太郎',
        sitename: '本社',
        machinename: 'ショベルカー',
        workdescription: '掘削',
        hours: 2.2,
      },
    ],
  );
  assert.ok(html.includes('月次稼働マトリクス'));
  assert.ok(html.includes('<th class="center nowrap">1</th>'));
  assert.ok(html.includes('<td class="center">●</td>'));
  assert.ok(html.includes('<td class="center">2</td>'));
  assert.ok(html.includes('<th class="right">2.70</th>'));
});
