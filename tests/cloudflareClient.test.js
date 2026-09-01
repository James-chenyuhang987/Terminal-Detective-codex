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
    assert.equal(new Headers(request.options.headers).get('Authorization'), 'Bearer firebase-id-token');
    assert.deepEqual(JSON.parse(request.options.body), {
      task: 'decision_options',
      payload: { lang: 'en' },
    });
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
