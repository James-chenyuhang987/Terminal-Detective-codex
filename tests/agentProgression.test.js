import test from 'node:test';
import assert from 'node:assert/strict';
import { grantXPAllOnce, loadProgression } from '../src/game/agentProgression.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('a case run can grant XP only once', () => {
  const storage = new MemoryStorage();
  const first = grantXPAllOnce('run-1', 120, storage);
  const second = grantXPAllOnce('run-1', 120, storage);

  assert.equal(first.awarded, true);
  assert.equal(second.awarded, false);
  assert.deepEqual(loadProgression(storage), [{ xp: 120 }, { xp: 120 }, { xp: 120 }]);
});

test('missing or zero-value rewards never mutate progression', () => {
  const storage = new MemoryStorage();
  const result = grantXPAllOnce('', 0, storage);

  assert.equal(result.awarded, false);
  assert.deepEqual(loadProgression(storage), [{ xp: 0 }, { xp: 0 }, { xp: 0 }]);
});
