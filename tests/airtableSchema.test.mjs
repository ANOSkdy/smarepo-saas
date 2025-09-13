import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
execSync(
  'pnpm exec tsc -p tsconfig.json --outDir tests/dist --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --noEmit false',
  { cwd: root, stdio: 'inherit' },
);

const { filterFields, LOGS_ALLOWED_FIELDS } = await import('./dist/lib/airtableSchema.js');

test('filterFields removes unknown keys and nulls', () => {
  const candidate = {
    timestamp: '2024-01-01T00:00:00Z',
    lat: 1,
    unknown: 'x',
    nullField: null,
  };
  const result = filterFields(candidate, LOGS_ALLOWED_FIELDS);
  assert.deepStrictEqual(result, { timestamp: '2024-01-01T00:00:00Z', lat: 1 });
});
