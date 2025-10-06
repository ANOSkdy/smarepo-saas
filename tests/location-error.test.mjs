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

const {
  LocationError,
  createLocationErrorFromCode,
  describeLocationError,
  normalizeToLocationError,
} = await import('./dist/lib/location-error.js');

test('createLocationErrorFromCode maps browser error codes', () => {
  const permissionError = createLocationErrorFromCode(1);
  assert(permissionError instanceof LocationError);
  assert.strictEqual(permissionError.reason, 'permission');
  assert.strictEqual(permissionError.message, describeLocationError('permission'));

  const unavailableError = createLocationErrorFromCode(2);
  assert.strictEqual(unavailableError.reason, 'unavailable');
  assert.strictEqual(unavailableError.message, describeLocationError('unavailable'));
});

test('normalizeToLocationError preserves custom errors and falls back to unknown', () => {
  const timeout = new LocationError('timeout');
  const normalizedTimeout = normalizeToLocationError(timeout);
  assert.strictEqual(normalizedTimeout.reason, 'timeout');

  const unknown = normalizeToLocationError({ code: 999 });
  assert.strictEqual(unknown.reason, 'unknown');
  assert.strictEqual(unknown.message, describeLocationError('unknown'));
});
