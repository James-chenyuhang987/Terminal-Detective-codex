import assert from 'node:assert/strict';
import test from 'node:test';

import { cloudflareApi } from '../src/api/cloudflareClient.js';
import { appParams } from '../src/lib/app-params.js';

test('Cloudflare client invokes a named Worker function with cookie credentials', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ result: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await cloudflareApi.functions.invoke('detectiveRules', {
      task: 'decision_options',
      payload: { lang: 'en' },
    });
    assert.deepEqual(response, { data: { result: 'ok' } });
    assert.equal(request.url, `${appParams.serverUrl}/api/apps/${appParams.appId}/functions/detectiveRules`);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.credentials, 'include');
    assert.equal('Authorization' in request.options.headers, false);
    assert.deepEqual(JSON.parse(request.options.body), {
      task: 'decision_options',
      payload: { lang: 'en' },
    });
  } finally {
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
