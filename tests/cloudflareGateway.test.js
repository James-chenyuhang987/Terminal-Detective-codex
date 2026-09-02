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

test('Cloudflare gateway reports Firebase + Cloudflare mode without exposing credentials', async () => {
  const response = await handleRequest(new Request('https://game.example/api/cloudflare/status'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'terminal-detective-cloudflare',
    mode: 'firebase_cloudflare',
    rules: 'cloudflare',
    profile: 'cloudflare',
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('auth configuration requires a real Firebase project id', async () => {
  const unavailable = await handleRequest(new Request('https://game.example/api/auth/config'), env);
  assert.deepEqual(await unavailable.json(), {
    primary: 'firebase', firebase: false, email_password: false, github: false,
    project_id: '', database: false, schema: false, ready: false,
  });

  const available = await handleRequest(new Request('https://game.example/api/auth/config'), {
    ...env,
    FIREBASE_PROJECT_ID: 'terminal-detective-test',
    DB: {
      prepare: () => ({
        all: async () => ({ results: [
          {
            name: 'users',
            sql: 'CREATE TABLE users (id TEXT, email TEXT, email_verified INTEGER, display_name TEXT, avatar_url TEXT)',
          },
          {
            name: 'profiles',
            sql: 'CREATE TABLE profiles (user_id TEXT, profile_json TEXT, profile_revision INTEGER, active_session_id TEXT)',
          },
        ] }),
      }),
    },
  });
  assert.deepEqual(await available.json(), {
    primary: 'firebase', firebase: true, email_password: true, github: true,
    project_id: 'terminal-detective-test', database: true, schema: true, ready: true,
  });

  const incomplete = await handleRequest(new Request('https://game.example/api/auth/config'), {
    ...env,
    FIREBASE_PROJECT_ID: 'terminal-detective-test',
    DB: {
      prepare: () => ({
        all: async () => ({ results: [
          { name: 'users', sql: 'CREATE TABLE users (id TEXT, email TEXT)' },
          { name: 'profiles', sql: 'CREATE TABLE profiles (user_id TEXT, profile_json TEXT)' },
        ] }),
      }),
    },
  });
  assert.equal((await incomplete.json()).ready, false);
});

test('Firebase session endpoint requires a bearer token', async () => {
  const response = await handleRequest(new Request('https://game.example/api/auth/session'), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'UNAUTHENTICATED');
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

test('profile read and write routes fail closed without an authenticated owner', async () => {
  for (const [path, method] of [
    [`/api/apps/${APP_ID}/entities/User/me`, 'GET'],
    [`/api/apps/${APP_ID}/functions/playerProfile`, 'POST'],
    [`/api/apps/${APP_ID}/functions/playerProfile`, 'DELETE'],
  ]) {
    const response = await handleRequest(new Request(`https://game.example${path}`, { method }), env);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'UNAUTHENTICATED');
  }
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
