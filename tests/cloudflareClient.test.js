import assert from 'node:assert/strict';
import test from 'node:test';

import { cloudflareApi } from '../src/api/cloudflareClient.js';
import { appParams } from '../src/lib/app-params.js';
import { setAuthTokenProvider } from '../src/lib/authToken.js';

test('Cloudflare client invokes a named Worker function with a Firebase bearer token', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ result: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  setAuthTokenProvider(async () => 'firebase-id-token');

  try {
    const response = await cloudflareApi.functions.invoke('detectiveRules', {
      task: 'decision_options',
      payload: { lang: 'en' },
    });
    assert.deepEqual(response, { data: { result: 'ok' } });
    assert.equal(request.url, `${appParams.serverUrl}/api/apps/${appParams.appId}/functions/detectiveRules`);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.credentials, undefined);
    const headers = new Headers(request.options.headers);
    assert.equal(headers.get('Authorization'), 'Bearer firebase-id-token');
    assert.equal(headers.has('X-Origin-URL'), false);
    assert.equal(headers.has('X-App-Id'), false);
    assert.deepEqual(JSON.parse(request.options.body), {
      task: 'decision_options',
      payload: { lang: 'en' },
    });
  } finally {
    setAuthTokenProvider(null);
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare client propagates one AbortSignal through token acquisition and fetch', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let tokenSignal;
  let fetchSignal;
  setAuthTokenProvider(async (_force, signal) => {
    tokenSignal = signal;
    return 'firebase-id-token';
  });
  globalThis.fetch = async (_url, options) => {
    fetchSignal = options.signal;
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await cloudflareApi.functions.invoke('detectiveRules', {}, { signal: controller.signal });
    assert.equal(tokenSignal, controller.signal);
    assert.equal(fetchSignal, controller.signal);
  } finally {
    setAuthTokenProvider(null);
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare client exposes stable HTTP error details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'SESSION_TAKEN',
    message: 'Session is read only.',
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await assert.rejects(
      () => cloudflareApi.functions.invoke('playerProfile', { action: 'patch' }),
      error => {
        assert.equal(error.message, 'Session is read only.');
        assert.equal(error.status, 409);
        assert.equal(error.code, 'SESSION_TAKEN');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
