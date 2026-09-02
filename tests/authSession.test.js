import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionBootstrap } from '../src/lib/authSession.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('session bootstrap deduplicates concurrent requests and caches a token result', async () => {
  const pending = deferred();
  let requests = 0;
  const bootstrap = createSessionBootstrap(async token => {
    requests += 1;
    assert.equal(token, 'token-1');
    return pending.promise;
  });
  const firebaseUser = { getIdToken: async () => 'token-1' };

  const first = bootstrap.run(firebaseUser);
  const second = bootstrap.run(firebaseUser);
  await Promise.resolve();
  pending.resolve({ authenticated: true });

  assert.deepEqual(await first, { authenticated: true });
  assert.deepEqual(await second, { authenticated: true });
  assert.equal(requests, 1);
  assert.deepEqual(await bootstrap.run(firebaseUser), { authenticated: true });
  assert.equal(requests, 1);
});

test('session bootstrap refreshes and retries exactly once after a 401', async () => {
  const tokenCalls = [];
  const requestedTokens = [];
  const bootstrap = createSessionBootstrap(async token => {
    requestedTokens.push(token);
    if (token === 'expired') {
      throw Object.assign(new Error('expired'), { httpStatus: 401 });
    }
    return { user: { id: 'firebase-user' } };
  });
  const firebaseUser = {
    async getIdToken(forceRefresh) {
      tokenCalls.push(Boolean(forceRefresh));
      return forceRefresh ? 'fresh' : 'expired';
    },
  };

  assert.deepEqual(await bootstrap.run(firebaseUser), { user: { id: 'firebase-user' } });
  assert.deepEqual(tokenCalls, [false, true]);
  assert.deepEqual(requestedTokens, ['expired', 'fresh']);
});

test('session bootstrap retries transient failures at most twice', async () => {
  let tokenCalls = 0;
  let requests = 0;
  const bootstrap = createSessionBootstrap(async () => {
    requests += 1;
    if (requests === 3) return { authenticated: true };
    throw Object.assign(new Error('unavailable'), { httpStatus: 503 });
  }, { retryDelayMs: () => 0 });

  assert.deepEqual(
    await bootstrap.run({ getIdToken: async () => { tokenCalls += 1; return 'token'; } }),
    { authenticated: true },
  );
  assert.equal(tokenCalls, 1);
  assert.equal(requests, 3);
});

test('session bootstrap enforces one total deadline across token and requests', async () => {
  const bootstrap = createSessionBootstrap(
    () => new Promise(() => {}),
    { timeoutMs: 20, retryDelayMs: () => 0 },
  );
  await assert.rejects(
    bootstrap.run({ getIdToken: async () => 'token' }),
    error => error.code === 'AUTH_SESSION_TIMEOUT' && error.httpStatus === 408,
  );
});

test('session bootstrap deadline also covers a forced token refresh', async () => {
  const bootstrap = createSessionBootstrap(async () => {
    throw Object.assign(new Error('expired'), { httpStatus: 401 });
  }, { timeoutMs: 20 });
  const firebaseUser = {
    getIdToken: forceRefresh => (
      forceRefresh ? new Promise(() => {}) : Promise.resolve('expired')
    ),
  };

  await assert.rejects(
    bootstrap.run(firebaseUser),
    error => error.code === 'AUTH_SESSION_TIMEOUT' && error.httpStatus === 408,
  );
});

test('session bootstrap stops after one refreshed-token retry', async () => {
  const tokenCalls = [];
  let requests = 0;
  const bootstrap = createSessionBootstrap(async () => {
    requests += 1;
    throw Object.assign(new Error('unauthorized'), { httpStatus: 401 });
  });
  const firebaseUser = {
    async getIdToken(forceRefresh) {
      tokenCalls.push(Boolean(forceRefresh));
      return forceRefresh ? 'fresh' : 'expired';
    },
  };

  await assert.rejects(bootstrap.run(firebaseUser), /unauthorized/);
  assert.deepEqual(tokenCalls, [false, true]);
  assert.equal(requests, 2);
});

test('clearing a bootstrap aborts older requests without repopulating its cache', async () => {
  const requests = [deferred(), deferred()];
  let requestIndex = 0;
  const bootstrap = createSessionBootstrap(() => requests[requestIndex++].promise);
  const firebaseUser = { getIdToken: async () => 'same-token' };

  const stale = assert.rejects(
    bootstrap.run(firebaseUser),
    error => error.code === 'AUTH_SESSION_TIMEOUT',
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestIndex, 1);
  bootstrap.clear();
  const current = bootstrap.run(firebaseUser);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestIndex, 2);
  requests[0].resolve({ version: 'stale' });
  requests[1].resolve({ version: 'current' });

  await stale;
  assert.deepEqual(await current, { version: 'current' });
  assert.deepEqual(await bootstrap.run(firebaseUser), { version: 'current' });
  assert.equal(requestIndex, 2);
});
