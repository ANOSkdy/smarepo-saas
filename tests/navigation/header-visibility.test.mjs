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
  'pnpm exec tsc components/HeaderNav.tsx app/(protected)/_components/SubHeaderGate.tsx app/(protected)/dashboard/layout.tsx --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --jsx react-jsx --outDir tests/dist-nav',
  { cwd: projectRoot, stdio: 'inherit' },
);

const { shouldHideDashboardLink, shouldHideNfcLink, resolveNfcHref } = await import(
  new URL('../dist-nav/components/HeaderNav.js', import.meta.url),
);
const { shouldHideSubHeader } = await import(
  new URL('../dist-nav/app/(protected)/_components/SubHeaderGate.js', import.meta.url),
);
const { resolveDashboardUserName } = await import(
  new URL('../dist-nav/app/(protected)/dashboard/layout.js', import.meta.url),
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

test('shouldHideDashboardLink hides link on dashboard routes', () => {
  assert.equal(shouldHideDashboardLink('/dashboard'), true);
  assert.equal(shouldHideDashboardLink('/dashboard/reports'), true);
  assert.equal(shouldHideDashboardLink('/settings'), false);
  assert.equal(shouldHideDashboardLink(undefined), false);
});

test('resolveNfcHref appends machine id when on dashboard', () => {
  assert.equal(resolveNfcHref('/dashboard'), '/nfc?machineid=1001');
  assert.equal(resolveNfcHref('/dashboard/summary'), '/nfc?machineid=1001');
  assert.equal(resolveNfcHref('/settings'), '/nfc');
  assert.equal(resolveNfcHref(undefined), '/nfc');
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

test('resolveDashboardUserName prefers explicit name', () => {
  assert.equal(resolveDashboardUserName({ user: { name: '角谷 亮太', email: 'rkadoya@example.com' } }), '角谷 亮太');
});

test('resolveDashboardUserName falls back to userName', () => {
  assert.equal(resolveDashboardUserName({ user: { name: '', userName: 'rkadoya' } }), 'rkadoya');
});

test('resolveDashboardUserName derives from email when necessary', () => {
  assert.equal(resolveDashboardUserName({ user: { email: 'rkadoya@example.com' } }), 'rkadoya');
});

test('resolveDashboardUserName returns null when unavailable', () => {
  assert.equal(resolveDashboardUserName({ user: { email: '' } }), null);
  assert.equal(resolveDashboardUserName(null), null);
});
