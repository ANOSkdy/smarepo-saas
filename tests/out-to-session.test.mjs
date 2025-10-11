import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fromLogsRoutePath = join(
  __dirname,
  '../app/api/out-to-session/from-logs/route.ts',
);
const backfillRoutePath = join(
  __dirname,
  '../app/api/out-to-session/backfill/route.ts',
);

test('out-to-session route declares node runtime', async () => {
  const content = await readFile(fromLogsRoutePath, 'utf8');
  if (!content.includes("export const runtime = 'nodejs'")) {
    throw new Error('runtime not declared');
  }
});

test('out-to-session route uses composite upsert', async () => {
  const content = await readFile(fromLogsRoutePath, 'utf8');
  if (!content.includes('upsertByCompositeKey')) {
    throw new Error('upsertByCompositeKey not used');
  }
});

test('backfill route throttles conversion calls', async () => {
  const content = await readFile(backfillRoutePath, 'utf8');
  if (!content.includes('await delay(CALL_DELAY_MS)')) {
    throw new Error('backfill route missing delay');
  }
});
