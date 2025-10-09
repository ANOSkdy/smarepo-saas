import { rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const outDir = join(projectRoot, 'tests', 'dist-nav');

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

execSync(
  'pnpm exec tsc components/HeaderNav.tsx app/(protected)/_components/SubHeaderGate.tsx --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --jsx react-jsx --outDir tests/dist-nav',
  { cwd: projectRoot, stdio: 'inherit' },
);

const { shouldHideNfcLink } = await import(new URL('../dist-nav/components/HeaderNav.js', import.meta.url));
const { shouldHideSubHeader } = await import(
  new URL('../dist-nav/app/(protected)/_components/SubHeaderGate.js', import.meta.url),
);

test('shouldHideNfcLink hides link on /nfc', () => {
  assert.equal(shouldHideNfcLink('/nfc'), true);
  assert.equal(shouldHideNfcLink('/nfc/settings'), true);
});

test('shouldHideNfcLink keeps link on other paths', () => {
  assert.equal(shouldHideNfcLink('/dashboard'), false);
  assert.equal(shouldHideNfcLink('/'), false);
  assert.equal(shouldHideNfcLink(null), false);
});

test('shouldHideSubHeader hides for dashboard and nfc routes', () => {
  assert.equal(shouldHideSubHeader('/dashboard'), true);
  assert.equal(shouldHideSubHeader('/dashboard/reports'), true);
  assert.equal(shouldHideSubHeader('/nfc'), true);
  assert.equal(shouldHideSubHeader('/nfc/history'), true);
});

test('shouldHideSubHeader keeps subheader for other routes', () => {
  assert.equal(shouldHideSubHeader('/settings'), false);
  assert.equal(shouldHideSubHeader(undefined), false);
});
