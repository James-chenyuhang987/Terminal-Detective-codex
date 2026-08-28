import assert from 'node:assert/strict';
import test from 'node:test';

import { base44 } from '../src/api/base44Client.js';
import { appParams } from '../src/lib/app-params.js';

test('lightweight Base44 adapter preserves the function invocation contract', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = appParams.token;
  const originalFunctionsVersion = appParams.functionsVersion;
  let request;

  appParams.token = 'test-token';
  appParams.functionsVersion = 'test-version';
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ result: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await base44.functions.invoke('detectiveLLM', {
      task: 'think',
      payload: { lang: 'en' },
    });

    assert.deepEqual(response, { data: { result: 'ok' } });
    assert.equal(request.url, `${appParams.serverUrl}/api/apps/${appParams.appId}/functions/detectiveLLM`);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer test-token');
    assert.equal(request.options.headers['Base44-Functions-Version'], 'test-version');
    assert.deepEqual(JSON.parse(request.options.body), {
      task: 'think',
      payload: { lang: 'en' },
    });
  } finally {
    globalThis.fetch = originalFetch;
    appParams.token = originalToken;
    appParams.functionsVersion = originalFunctionsVersion;
  }
});

test('lightweight Base44 adapter exposes stable HTTP error details', async () => {
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
      () => base44.functions.invoke('playerProfile', { action: 'patch' }),
      (error) => {
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
