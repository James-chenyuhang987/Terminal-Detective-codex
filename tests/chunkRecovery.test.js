import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptChunkRecovery,
  buildLatestVersionUrl,
  installChunkRecovery,
  isChunkLoadError,
} from '../src/lib/chunkRecovery.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function createRuntime(storage = createStorage(), href = 'https://example.com/game/?lang=zh#case') {
  const listeners = new Map();
  const runtime = {
    location: {
      href,
      replaced: '',
      replace(value) { this.replaced = value; },
    },
    history: {
      state: null,
      replaced: '',
      replaceState(_state, _title, value) { this.replaced = value; },
    },
    sessionStorage: storage,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
    setTimeout() { return 1; },
    clearTimeout() {},
    listeners,
  };
  return runtime;
}

test('recognizes deployment chunk failures without swallowing unrelated errors', () => {
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/Home-old.js')), true);
  assert.equal(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 8 failed')), true);
  assert.equal(isChunkLoadError(new Error('Profile request returned 500')), false);
});

test('cache-busting recovery keeps existing query parameters and hashes', () => {
  const target = new URL(buildLatestVersionUrl('https://example.com/game/?lang=zh#case', 123456));
  assert.equal(target.searchParams.get('lang'), 'zh');
  assert.equal(target.searchParams.get('__td_reload'), '2n9c');
  assert.equal(target.hash, '#case');
});

test('automatic recovery reloads only once for the same failed asset in a short window', () => {
  const storage = createStorage();
  const error = new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/Home-old.js');
  const first = createRuntime(storage);
  assert.equal(attemptChunkRecovery(error, first, 10_000), true);
  assert.match(first.location.replaced, /__td_reload=/);

  const second = createRuntime(storage);
  assert.equal(attemptChunkRecovery(error, second, 10_500), false);
  assert.equal(second.location.replaced, '');

  const later = createRuntime(storage);
  assert.equal(attemptChunkRecovery(error, later, 101_000), true);
});

test('vite preload listener prevents the stale error only when recovery starts', () => {
  const runtime = createRuntime();
  const cleanup = installChunkRecovery(runtime);
  let prevented = false;
  runtime.listeners.get('vite:preloadError')({
    payload: new Error('Importing a module script failed'),
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.match(runtime.location.replaced, /__td_reload=/);
  cleanup();
  assert.equal(runtime.listeners.has('vite:preloadError'), false);
});

