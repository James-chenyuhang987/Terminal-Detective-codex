import test from 'node:test';
import assert from 'node:assert/strict';

import { handleRequest } from '../cloudflare/worker/index.js';

const APP_ID = 'terminal-detective';
const env = {
  APP_ID,
  ASSETS: {
    fetch: async request => new Response(`asset:${new URL(request.url).pathname}`),
  },
};

test('Cloudflare gateway reports Cloudflare-only mode without exposing credentials', async () => {
  const response = await handleRequest(new Request('https://game.example/api/cloudflare/status'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'terminal-detective-cloudflare',
    mode: 'cloudflare_only',
    rules: 'cloudflare',
    profile: 'cloudflare',
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('auth configuration advertises GitHub only when both credentials exist', async () => {
  const unavailable = await handleRequest(new Request('https://game.example/api/auth/config'), env);
  assert.deepEqual(await unavailable.json(), {
    primary: 'github', github: false,
  });

  const available = await handleRequest(new Request('https://game.example/api/auth/config'), {
    ...env, GITHUB_OAUTH_CLIENT_ID: 'client', GITHUB_OAUTH_CLIENT_SECRET: 'secret',
  });
  assert.deepEqual(await available.json(), {
    primary: 'github', github: true,
  });
});

test('deterministic detective rules require a Cloudflare session', async () => {
  const request = new Request(`https://game.example/api/apps/${APP_ID}/functions/detectiveRules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      task: 'decision_options',
      payload: {
        caseId: 'Lvl_01', runId: 'cloudflare-test', turn: 1, team: [{
          agentId: 'NEXUS-01', logicPower: 20, observationFocus: 20,
          hackLevel: 20, confusionResistance: 20,
        }],
      },
    }),
  });
  const response = await handleRequest(request, env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.code, 'UNAUTHENTICATED');
});

test('gateway rejects unknown API routes instead of proxying to another backend', async () => {
  const response = await handleRequest(
    new Request(`https://game.example/api/apps/${APP_ID}/functions/unknown`, { method: 'POST' }),
    env,
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'ROUTE_NOT_FOUND');

  const asset = await handleRequest(new Request('https://game.example/game/route'), env);
  assert.equal(await asset.text(), 'asset:/game/route');
});
