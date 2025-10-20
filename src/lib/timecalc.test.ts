import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTimeCalcV2FromMinutes, applyTimeCalcV2FromHours } from './timecalc';

process.env.TIME_CALC_VERSION = '2';
process.env.TIME_CALC_ROUND_MINUTES = '15';
process.env.TIME_CALC_BREAK_MINUTES = '90';
process.env.TIME_CALC_ROUND_MODE = 'nearest';

test('390分（6.5h）の日次合計は1.5h控除後に15分単位へ丸め', () => {
  const result = applyTimeCalcV2FromMinutes(390);
  assert.equal(result.minutes, 300);
  assert.equal(result.hours, 5);
});

test('短時間は控除で0分となる', () => {
  const result = applyTimeCalcV2FromMinutes(60);
  assert.equal(result.minutes, 0);
  assert.equal(result.hours, 0);
});

test('時間入力（6.5h）でも同じ結果になる', () => {
  const result = applyTimeCalcV2FromHours(6.5);
  assert.equal(result.minutes, 300);
  assert.equal(result.hours, 5);
});
