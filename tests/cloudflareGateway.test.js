import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { handleRequest } from '../cloudflare/worker/index.js';

const APP_ID = 'terminal-detective';
const env = {
  APP_ID,
  ASSETS: {
    fetch: async request => new Response(`asset:${new URL(request.url).pathname}`),
  },
};

function readyDB(indexResults = [{
  index_name: 'sqlite_autoindex_users_2',
  is_unique: 1,
  is_partial: 0,
  column_position: 0,
  column_name: 'email',
}]) {
  const schema = {
    users: ['id', 'email', 'email_verified', 'display_name', 'avatar_url'],
    profiles: ['user_id', 'profile_json', 'profile_revision', 'active_session_id'],
    profile_operations: ['user_id', 'operation_id', 'base_revision', 'result_revision', 'patch_hash'],
  };
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (sql.includes('d1_migrations')) {
            return { results: [{ name: '0003_profile_operations.sql' }] };
          }
          if (sql.includes("pragma_index_list('users')")) {
            return { results: indexResults };
          }
          if (sql.includes('pragma_foreign_key_list')) {
            return { results: ['profiles', 'profile_operations'].map(table_name => ({
              table_name,
              parent_table: 'users',
              child_column: 'user_id',
              parent_column: 'id',
              on_delete: 'CASCADE',
            })) };
          }
          return {
            results: Object.entries(schema).flatMap(([table_name, columns]) => (
              columns.map(name => ({
                table_name,
                name,
                pk: table_name === 'profile_operations'
                  ? ({ user_id: 1, operation_id: 2 }[name] || 0)
                  : name === (table_name === 'users' ? 'id' : 'user_id') ? 1 : 0,
              }))
            )),
          };
        },
      };
    },
  };
}

test('Cloudflare gateway reports Firebase + Cloudflare mode without exposing credentials', async () => {
  const response = await handleRequest(new Request('https://game.example/api/cloudflare/status'), {
    ...env,
    FIREBASE_PROJECT_ID: 'terminal-detective-test',
    DB: readyDB(),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'terminal-detective-cloudflare',
    mode: 'firebase_cloudflare',
    rules: 'cloudflare',
    profile: 'cloudflare',
    checks: { firebase: true, database: true, schema: true },
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('auth configuration requires a real Firebase project id', async () => {
  const unavailable = await handleRequest(new Request('https://game.example/api/auth/config'), env);
  assert.deepEqual(await unavailable.json(), {
    primary: 'firebase',
    firebase: false,
    firebase_project_id: '',
    email_password: false,
    github: false,
    ready: false,
    checks: { database: false, schema: false },
  });

  const available = await handleRequest(new Request('https://game.example/api/auth/config'), {
    ...env, FIREBASE_PROJECT_ID: 'terminal-detective-test', DB: readyDB(),
  });
  assert.deepEqual(await available.json(), {
    primary: 'firebase',
    firebase: true,
    firebase_project_id: 'terminal-detective-test',
    email_password: true,
    github: true,
    ready: true,
    checks: { database: true, schema: true },
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

test('auth readiness distinguishes a reachable D1 database from an incomplete schema', async () => {
  const response = await handleRequest(new Request('https://game.example/api/auth/config'), {
    ...env,
    FIREBASE_PROJECT_ID: 'terminal-detective-test',
    DB: {
      prepare() {
        return { async all() { return { results: [{ table_name: 'users', name: 'id' }] }; } };
      },
    },
  });
  const payload = await response.json();
  assert.equal(payload.ready, false);
  assert.deepEqual(payload.checks, { database: true, schema: false });
});

test('auth readiness requires one complete non-partial unique email index', async () => {
  for (const indexes of [
    [
      {
        index_name: 'users_email_id_unique',
        is_unique: 1,
        is_partial: 0,
        column_position: 0,
        column_name: 'email',
      },
      {
        index_name: 'users_email_id_unique',
        is_unique: 1,
        is_partial: 0,
        column_position: 1,
        column_name: 'id',
      },
    ],
    [{
      index_name: 'users_email_partial_unique',
      is_unique: 1,
      is_partial: 1,
      column_position: 0,
      column_name: 'email',
    }],
  ]) {
    const response = await handleRequest(new Request('https://game.example/api/auth/config'), {
      ...env,
      FIREBASE_PROJECT_ID: 'terminal-detective-test',
      DB: readyDB(indexes),
    });
    assert.equal((await response.json()).ready, false);
  }
});

test('Firebase session endpoint requires a bearer token', async () => {
  const response = await handleRequest(new Request('https://game.example/api/auth/session'), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'UNAUTHENTICATED');
});

test('public backend endpoints enforce their HTTP methods', async () => {
  for (const [path, method, allowed] of [
    ['/api/auth/config', 'POST', 'GET'],
    ['/api/auth/session', 'POST', 'GET'],
    ['/api/auth/logout', 'GET', 'POST'],
    ['/api/cloudflare/status', 'POST', 'GET'],
  ]) {
    const response = await handleRequest(new Request(`https://game.example${path}`, { method }), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), allowed);
    assert.equal((await response.json()).code, 'METHOD_NOT_ALLOWED');
  }
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

test('profile read and write routes fail closed before database access', async () => {
  for (const [path, method] of [
    [`/api/apps/${APP_ID}/entities/User/me`, 'GET'],
    [`/api/apps/${APP_ID}/functions/playerProfile`, 'POST'],
  ]) {
    const response = await handleRequest(new Request(`https://game.example${path}`, { method }), env);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'UNAUTHENTICATED');
  }
  const wrongMethod = await handleRequest(new Request(
    `https://game.example/api/apps/${APP_ID}/functions/playerProfile`,
    { method: 'DELETE' },
  ), env);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
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

test('API CORS permits configured frontends and localhost development', async () => {
  const corsEnv = {
    ...env,
    CORS_ALLOWED_ORIGINS: 'https://james-chenyuhang987.github.io, https://preview.example',
  };
  for (const origin of [
    'https://james-chenyuhang987.github.io',
    'https://preview.example',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
  ]) {
    const response = await handleRequest(new Request('https://game.example/api/cloudflare/status', {
      headers: { Origin: origin },
    }), corsEnv);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('vary'), /Origin/i);
  }
});

test('API preflight rejects unknown origins and advertises the bearer headers', async () => {
  const corsEnv = {
    ...env,
    CORS_ALLOWED_ORIGINS: 'https://james-chenyuhang987.github.io',
  };
  const allowed = await handleRequest(new Request('https://game.example/api/auth/session', {
    method: 'OPTIONS',
    headers: { Origin: 'https://james-chenyuhang987.github.io' },
  }), corsEnv);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://james-chenyuhang987.github.io');
  assert.match(allowed.headers.get('access-control-allow-headers'), /Authorization/);
  assert.match(allowed.headers.get('access-control-allow-methods'), /POST/);

  const denied = await handleRequest(new Request('https://game.example/api/auth/session', {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example' },
  }), corsEnv);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await denied.json()).code, 'CORS_ORIGIN_DENIED');
});

test('same-origin API responses keep security headers without requiring CORS', async () => {
  const response = await handleRequest(new Request('https://game.example/api/cloudflare/status'), env);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
});

test('gateway failures retain CORS and security headers', async () => {
  const origin = 'https://james-chenyuhang987.github.io';
  const response = await worker.fetch(new Request('https://game.example/api/auth/session', {
    headers: {
      Authorization: 'Bearer malformed-token',
      Origin: origin,
    },
  }), {
    ...env,
    FIREBASE_PROJECT_ID: 'terminal-detective-test',
    CORS_ALLOWED_ORIGINS: origin,
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'INVALID_FIREBASE_TOKEN');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('unknown gateway failures expose only an anonymous fault reference', async () => {
  const previousConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await worker.fetch(new Request('https://game.example/game'), {
      ...env,
      ASSETS: { async fetch() { throw new Error('sensitive internal failure'); } },
    });
    const payload = await response.json();
    assert.equal(response.status, 500);
    assert.equal(payload.code, 'GATEWAY_FAILED');
    assert.match(payload.fault_reference, /^TD-[A-Z0-9]{10}$/);
    assert.doesNotMatch(JSON.stringify(payload), /sensitive internal failure/);
  } finally {
    console.error = previousConsoleError;
  }
});
