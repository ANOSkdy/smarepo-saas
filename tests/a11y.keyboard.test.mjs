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

test('protected layout exposes navigation landmark', () => {
  const protectedLayout = read('../app/(protected)/layout.tsx');
  assert.match(protectedLayout, /role="navigation"/);
  assert.match(protectedLayout, /aria-label="保護エリア内ナビゲーション"/);
});
