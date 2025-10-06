import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const requiredVariables = [
  '--color-surface',
  '--color-surface-alt',
  '--color-text',
  '--color-muted',
  '--color-border',
  '--color-primary',
  '--color-on-primary',
  '--color-error',
  '--color-focus',
];

test('globals define accessible color tokens', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  for (const token of requiredVariables) {
    assert.match(css, new RegExp(`${token}\s*:`));
  }
});

test('tailwind brand palette references css variables', () => {
  const config = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8');
  assert.match(config, /brand:\s*{[\s\S]*surface: "var\(--color-surface\)"/);
  assert.match(config, /primary: "var\(--color-primary\)"/);
});
