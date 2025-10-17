import { test } from 'node:test';
import assert from 'node:assert';
import { validateStampRequest } from './dist/validator.js';
const { filterFields, LOGS_ALLOWED_FIELDS } = await import(
  './dist/lib/airtableSchema.js'
);

test('validateStampRequest fails on missing fields', () => {
  const result = validateStampRequest({});
  assert.strictEqual(result.success, false);
});

test('validateStampRequest succeeds on valid data', () => {
  const result = validateStampRequest({
    machineId: '1',
    workDescription: 'test',
    lat: 0,
    lon: 0,
    type: 'IN',
  });
  assert.strictEqual(result.success, true);
});

test('validateStampRequest fails on invalid type', () => {
  const result = validateStampRequest({
    machineId: '1',
    workDescription: 'test',
    lat: 0,
    lon: 0,
    type: 'INVALID',
  });
  assert.strictEqual(result.success, false);
});

test('validateStampRequest fails on invalid accuracy type', () => {
  const result = validateStampRequest({
    machineId: '1',
    workDescription: 'test',
    lat: 0,
    lon: 0,
    type: 'IN',
    accuracy: 'bad',
  });
  assert.strictEqual(result.success, false);
});

test('validateStampRequest fails on invalid clientDecision', () => {
  const result = validateStampRequest({
    machineId: '1',
    workDescription: 'test',
    lat: 0,
    lon: 0,
    type: 'IN',
    clientDecision: 'wrong',
  });
  assert.strictEqual(result.success, false);
});

test('filterFields keeps clientName when provided', () => {
  const candidate = {
    timestamp: '2024-01-01T00:00:00Z',
    clientName: 'Acoru合同会社',
  };
  const result = filterFields(candidate, LOGS_ALLOWED_FIELDS);
  assert.deepStrictEqual(result, candidate);
});

