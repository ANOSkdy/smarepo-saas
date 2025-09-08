import { test } from 'node:test';
import assert from 'node:assert';

process.env.AIRTABLE_API_KEY = 'test';
process.env.AIRTABLE_BASE_ID = 'base';

const { validateStampRequest } = await import('../.next/server/app/api/stamp/route.js');

test('validateStampRequest fails on missing fields', () => {
  const result = validateStampRequest({});
  assert.strictEqual(result.success, false);
});
