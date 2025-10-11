import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const routePath = join(__dirname, '../app/api/out-to-session/route.ts');

test('out-to-session route declares node runtime', async () => {
  const content = await readFile(routePath, 'utf8');
  if (!content.includes("export const runtime = 'nodejs'")) {
    throw new Error('runtime not declared');
  }
});

test('out-to-session route uses composite upsert', async () => {
  const content = await readFile(routePath, 'utf8');
  if (!content.includes('upsertByCompositeKey')) {
    throw new Error('upsertByCompositeKey not used');
  }
});
