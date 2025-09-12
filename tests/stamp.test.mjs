import { test } from 'node:test';
import assert from 'node:assert';
import { validateStampRequest } from './dist/validator.js';

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

