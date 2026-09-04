import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettlementResult } from '../src/game/settlementResult.js';

test('normalizes legacy settlement aliases without losing clues or AP cost', () => {
  const result = normalizeSettlementResult({
    action_narration: 'Recovered a shard.',
    new_clues: ['c_01', 'c_01', '', null],
    ap_cost: 2,
    confusion_increase: '8',
  });

  assert.deepEqual(result.new_clues_unlocked, ['c_01']);
  assert.equal(result.time_cost, 2);
  assert.equal(result.confusion_increase, 8);
  assert.equal(result.health_change, 0);
});

test('clamps untrusted numeric settlement fields', () => {
  const result = normalizeSettlementResult({
    time_cost: 999,
    confusion_increase: -10,
    health_change: -500,
  });

  assert.equal(result.time_cost, 20);
  assert.equal(result.confusion_increase, 0);
  assert.equal(result.health_change, -100);
});

test('preserves only known narrative outcomes', () => {
  assert.equal(normalizeSettlementResult({ outcome: 'trap' }).outcome, 'trap');
  assert.equal(normalizeSettlementResult({ outcome: 'hidden_answer' }).outcome, null);
});
