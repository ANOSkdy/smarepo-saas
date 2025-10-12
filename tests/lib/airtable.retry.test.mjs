import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

execSync(
  'pnpm exec tsc -p tsconfig.json --outDir tests/dist --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --noEmit false',
  { cwd: projectRoot, stdio: 'inherit' },
);

test('withRetry retries and uses exponential backoff', async () => {
  const originalSetTimeout = global.setTimeout;
  const delays = [];

  try {
    process.env.AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'test_key';
    process.env.AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'test_base';

    global.setTimeout = ((callback, ms, ...args) => {
      delays.push(ms ?? 0);
      return originalSetTimeout(callback, 0, ...args);
    });

    const { withRetry } = await import('../dist/lib/airtable.js');
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('temporary failure');
        }
        return 'success';
      },
      3,
      100,
    );

    assert.equal(result, 'success');
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [100, 200]);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});
