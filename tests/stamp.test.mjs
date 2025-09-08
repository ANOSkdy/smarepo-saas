import { test } from 'node:test';
import assert from 'node:assert';
import { validateStampRequest } from './dist/validator.js';

test('validateStampRequest fails on missing fields', () => {
  const result = validateStampRequest({});
  assert.strictEqual(result.success, false);
});
