import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptChunkRecovery,
  buildLatestVersionUrl,
  installChunkRecovery,
  isChunkLoadError,
  reloadLatestVersion,
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
  const timers = [];
  const runtime = {
    location: {
      href,
      replaced: '',
      replace(value) { this.replaced = value; },
    },
    history: {
      state: null,
      replaced: '',
      replaceState(_state, _title, value) { this.replaced = value; runtime.location.href = value; },
    },
    sessionStorage: storage,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    listeners,
    timers,
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

test('blocked browser storage cannot crash recovery or trigger repeated reloads after URL cleanup', () => {
  const error = new Error('Importing a module script failed');
  for (const mode of ['getter', 'methods', 'absent']) {
    const restrict = runtime => {
      if (mode === 'getter') Object.defineProperty(runtime, 'sessionStorage', { get() { throw new Error('SecurityError'); } });
      else if (mode === 'methods') runtime.sessionStorage = {
        getItem() { throw new Error('Storage blocked'); },
        setItem() { throw new Error('Storage full'); },
        removeItem() { throw new Error('Storage blocked'); },
      };
      else runtime.sessionStorage = null;
      return runtime;
    };
    const first = restrict(createRuntime());
    assert.equal(attemptChunkRecovery(error, first, 10_000), true);
    const second = restrict(createRuntime(undefined, first.location.replaced));
    const cleanup = installChunkRecovery(second);
    assert.equal(new URL(second.location.href).searchParams.has('__td_reload'), false);
    assert.equal(attemptChunkRecovery(error, second, 10_500), false, mode);
    assert.equal(second.location.replaced, '');
    assert.equal(attemptChunkRecovery(error, second, 100_001), true, 'the recovery window still expires');
    cleanup();
  }
});

test('a late lazy import failure cannot bypass the recovery window via startup timers or another asset', () => {
  const storage = createStorage();
  const error = new Error('Failed to fetch dynamically imported module: /assets/Home-old.js');
  const first = createRuntime(storage);
  assert.equal(attemptChunkRecovery(error, first, 10_000), true);
  const second = createRuntime(storage, first.location.replaced);
  const cleanup = installChunkRecovery(second);
  second.timers.forEach(fn => fn());
  assert.equal(attemptChunkRecovery(error, second, 30_000), false);
  assert.equal(attemptChunkRecovery(new Error('Failed to fetch dynamically imported module: /assets/Lobby-old.js'), second, 30_001), false);
  assert.equal(second.location.replaced, '');
  assert.equal(attemptChunkRecovery(error, second, 100_001), true);
  cleanup();
});

test('manual reload stays available inside the automatic recovery window', () => {
  const storage = createStorage();
  const first = createRuntime(storage);
  const error = new Error('Importing a module script failed');
  attemptChunkRecovery(error, first, 10_000);
  const second = createRuntime(storage, first.location.replaced);
  const cleanup = installChunkRecovery(second);
  assert.equal(attemptChunkRecovery(error, second, 10_500), false);
  const target = reloadLatestVersion(second, 10_501);
  assert.equal(second.location.replaced, target);
  assert.equal(target, buildLatestVersionUrl('https://example.com/game/?lang=zh#case', 10_501));
  cleanup();
});

test('invalid, old, or future URL markers cannot permanently disable recovery', () => {
  for (const marker of ['invalid!', '-1', 'zzzzzzzzzzzzzzzzzzzz', '0', '1', (200_000).toString(36)]) {
    const runtime = createRuntime(null, `https://example.com/game/?__td_reload=${encodeURIComponent(marker)}`);
    const cleanup = installChunkRecovery(runtime);
    assert.equal(attemptChunkRecovery(new Error('Importing a module script failed'), runtime, 100_000), true, marker);
    cleanup();
  }
});

test('failed navigation does not swallow the original preload error', () => {
  const runtime = createRuntime();
  runtime.location.replace = () => { throw new Error('Navigation blocked'); };
  const cleanup = installChunkRecovery(runtime);
  let prevented = false;
  assert.doesNotThrow(() => runtime.listeners.get('vite:preloadError')({
    payload: new Error('Importing a module script failed'),
    preventDefault() { prevented = true; },
  }));
  assert.equal(prevented, false);
  cleanup();
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

