import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTimeCalcV2FromMinutes, applyTimeCalcV2FromHours } from './timecalc';

// テストは TIME_CALC_VERSION=2 / 15分丸め / 90分控除 / nearest を前提
process.env.TIME_CALC_VERSION = '2';
process.env.TIME_CALC_ROUND_MINUTES = '15';
process.env.TIME_CALC_BREAK_MINUTES = '90';
process.env.TIME_CALC_ROUND_MODE = 'nearest';

test('6h30m → 5h (90分控除+15分丸め)', () => {
  const result = applyTimeCalcV2FromMinutes(390);
  assert.equal(result.minutes, 300);
  assert.equal(result.hours, 5);
});

test('短時間労働 60分 → 控除で0分', () => {
  const result = applyTimeCalcV2FromMinutes(60);
  assert.equal(result.minutes, 0);
  assert.equal(result.hours, 0);
});

test('時間入力でも同等結果', () => {
  const result = applyTimeCalcV2FromHours(6.5);
  assert.equal(result.minutes, 300);
  assert.equal(result.hours, 5);
});

