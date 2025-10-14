import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('skip link points to main landmark', () => {
  const layout = read('../app/layout.tsx');
  assert.match(layout, /<main id="main" role="main"/);
  const skipLink = read('../components/SkipLink.tsx');
  assert.match(skipLink, /href\s*=\s*['"]#main['"]/);
});

test('protected layout keeps navigation landmark in root layout', () => {
  const appLayout = read('../app/layout.tsx');
  assert.match(appLayout, /<NavTabs \/>/);

  const navTabs = read('../components/NavTabs.tsx');
  assert.match(navTabs, /role="navigation"/);
  assert.match(navTabs, /aria-label="主要タブナビゲーション"/);
});

test('logout flows return to the unified login UI', () => {
  const logoutButton = read('../components/LogoutButton.tsx');
  assert.match(logoutButton, /callbackUrl:\s*ROUTES\.LOGIN/);

  const loginForm = read('../components/LoginForm.tsx');
  assert.match(loginForm, /data-testid="login-title"/);
});
