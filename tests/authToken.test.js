import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithAuth, setAuthTokenProvider } from '../src/lib/authToken.js';

test('authenticated fetch refreshes a rejected Firebase token exactly once', async () => {
  const originalFetch = globalThis.fetch;
  const forced = [];
  const requests = [];
  setAuthTokenProvider(async force => {
    forced.push(force);
    return force ? 'fresh-token' : 'stale-token';
  });
  globalThis.fetch = async (_input, init) => {
    const token = new Headers(init.headers).get('Authorization');
    requests.push(token);
    return new Response('', { status: token === 'Bearer stale-token' ? 401 : 200 });
  };

  try {
    const response = await fetchWithAuth('https://game.example/api/profile');
    assert.equal(response.status, 200);
    assert.deepEqual(forced, [false, true]);
    assert.deepEqual(requests, ['Bearer stale-token', 'Bearer fresh-token']);
  } finally {
    setAuthTokenProvider(null);
    globalThis.fetch = originalFetch;
  }
});

test('authenticated fetch never loops after a second 401', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  setAuthTokenProvider(async force => force ? 'fresh-token' : 'stale-token');
  globalThis.fetch = async () => {
    requests += 1;
    return new Response('', { status: 401 });
  };

  try {
    const response = await fetchWithAuth('https://game.example/api/profile');
    assert.equal(response.status, 401);
    assert.equal(requests, 2);
  } finally {
    setAuthTokenProvider(null);
    globalThis.fetch = originalFetch;
  }
});
