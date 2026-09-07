import assert from 'node:assert/strict';

export function memoryLocks() {
  const held = new Set();
  return {
    async request(name, options, callback) {
      assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { held.delete(name); }
    },
  };
}
