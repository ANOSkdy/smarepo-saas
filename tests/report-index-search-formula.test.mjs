import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const compiledFile = join(projectRoot, 'tests', 'dist', 'app', 'api', 'report-index', 'search', 'route.js');

if (!existsSync(compiledFile)) {
  execSync(
    'pnpm exec tsc -p tsconfig.json --outDir tests/dist --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --noEmit false',
    { cwd: projectRoot, stdio: 'inherit' },
  );
}

process.env.AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY ?? 'test-api-key';
process.env.AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID ?? 'appTestBase';

const { buildFilterFormula } = await import(
  new URL('./dist/app/api/report-index/search/route.js', import.meta.url),
);

test('buildFilterFormula builds base clauses for year and month', () => {
  const formula = buildFilterFormula({ year: 2024, month: 5 });
  assert.equal(formula, "AND(({year}=2024),({month}=5))");
});

test('buildFilterFormula includes search clauses and escapes quotes', () => {
  const formula = buildFilterFormula({
    year: 2024,
    month: 5,
    sitename: "中央'O",
    username: '田中',
    machinename: 'バックホー',
  });
  assert.equal(
    formula,
    "AND(({year}=2024),({month}=5),SEARCH(LOWER('中央\\'O'), LOWER({sitename}&'')),SEARCH(LOWER('田中'), LOWER({username}&'')),SEARCH(LOWER('バックホー'), LOWER({machinename}&'')))",
  );
});
