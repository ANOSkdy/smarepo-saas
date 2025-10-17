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
  'pnpm exec tsc components/NavTabs.tsx app/(protected)/_components/SubHeaderGate.tsx app/(protected)/dashboard/layout.tsx --module nodenext --target es2020 --moduleResolution nodenext --esModuleInterop --jsx react-jsx --outDir tests/dist-nav',
  { cwd: projectRoot, stdio: 'inherit' },
);

const { NAV_TABS, isActivePath } = await import(new URL('../dist-nav/components/NavTabs.js', import.meta.url));
const { shouldHideSubHeader } = await import(
  new URL('../dist-nav/app/(protected)/_components/SubHeaderGate.js', import.meta.url),
);
const { resolveDashboardUserName } = await import(
  new URL('../dist-nav/app/(protected)/dashboard/layout.js', import.meta.url),
);

test('nav tabs expose calendar, reports, and NFC routes', () => {
  assert.equal(Array.isArray(NAV_TABS), true);
  const hrefs = NAV_TABS.map((tab) => tab.href);
  assert.ok(hrefs.includes('/dashboard'));
  assert.ok(hrefs.includes('/reports'));
  assert.ok(hrefs.includes('/nfc?machineId=1001'));
  assert.ok(!hrefs.includes('/reports/sites'));
});

test('isActivePath matches base route segments', () => {
  assert.equal(isActivePath('/reports', '/reports'), true);
  assert.equal(isActivePath('/reports/detail', '/reports'), true);
  assert.equal(isActivePath('/dashboard', '/reports'), false);
  assert.equal(isActivePath('/dashboard/insights', '/dashboard'), true);
  assert.equal(isActivePath(null, '/reports'), false);
});

test('shouldHideSubHeader hides for dashboard, reports, and nfc routes', () => {
  assert.equal(shouldHideSubHeader('/dashboard'), true);
  assert.equal(shouldHideSubHeader('/dashboard/reports'), true);
  assert.equal(shouldHideSubHeader('/reports'), true);
  assert.equal(shouldHideSubHeader('/reports/sites'), true);
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
