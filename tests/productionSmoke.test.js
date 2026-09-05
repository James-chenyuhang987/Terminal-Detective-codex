import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runProductionSmoke, smokeOptionsFromEnv, validateBuildMarker, SMOKE_LIMITS } from '../scripts/smoke-production.mjs';

const expectedSha = 'c7de5d3df499da4792133400b8b9b5b285281920';
const staleSha = '0'.repeat(40);
const expectedProjectId = 'terminal-detective-e1714';
const expectedAppId = 'terminal-detective';
const apiUrl = 'https://worker.example';
const pagesUrl = 'https://owner.github.io/Terminal-Detective/';
const statusValue = { ok: true, mode: 'firebase_cloudflare', service: 'terminal-detective-cloudflare', checks: { firebase: true, database: true, schema: true } };
const authValue = { ready: true, primary: 'firebase', firebase: true, firebase_project_id: expectedProjectId, checks: { database: true, schema: true } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const text = (body, mime = 'text/html', status = 200) => new Response(body, { status, headers: { 'content-type': mime } });
const entry = (target, overrides = {}) => `const runtimeEnv=${JSON.stringify({ VITE_APP_ID: expectedAppId, VITE_FIREBASE_PROJECT_ID: expectedProjectId, VITE_API_SERVER_URL: target === 'pages' ? apiUrl : 'same-origin', ...overrides })};console.log(runtimeEnv);`;
const homepage = (base, sha = expectedSha) => `<!doctype html><html><head><meta name="td-build" content="${sha}" /><script type="module" crossorigin src="${base}assets/index.js"></script><link rel="stylesheet" crossorigin href="${base}assets/index.css"><link rel="modulepreload" href="${base}assets/vendor.js"></head><body></body></html>`;

function fixture({ target = 'worker', override, ...options } = {}) {
  const siteUrl = target === 'pages' ? pagesUrl : `${apiUrl}/`;
  const base = new URL(siteUrl).pathname;
  const events = [];
  const calls = [];
  const counts = new Map();
  const settings = {
    target, siteUrl, apiUrl, expectedSha, expectedProjectId, expectedAppId,
    retryDelayMs: 0, log: event => events.push(event), ...options,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const count = (counts.get(url) || 0) + 1;
      counts.set(url, count);
      const changed = override ? await override({ url, init, count, base, target }) : undefined;
      if (changed !== undefined) return changed;
      if (url === `${apiUrl}/api/cloudflare/status`) return json(statusValue);
      if (url === `${apiUrl}/api/auth/config`) return json(authValue);
      if (url === siteUrl) return text(homepage(base));
      if (url === `${siteUrl}assets/index.js`) return text(entry(target), 'text/javascript; charset=utf-8');
      if (url === `${siteUrl}assets/vendor.js`) return text('export const loaded=true;', 'application/javascript');
      if (url === `${siteUrl}assets/index.css`) return text('body { color: white; }', 'text/css');
      return text('Not found', 'text/plain', 404);
    },
  };
  return { events, calls, run: () => runProductionSmoke(settings) };
}

for (const target of ['worker', 'pages']) {
  test(`successful ${target} checks both APIs, build, entry JS, CSS, module preload and runtime config`, async () => {
    const f = fixture({ target });
    assert.deepEqual(await f.run(), { rounds: 1, expectedSha });
    assert.equal(f.calls.length, 6);
    assert.deepEqual(f.events.filter(event => event.status === 'passed').map(event => event.stage), [
      'status', 'auth-config', 'homepage', 'build-marker', 'entry-script', 'stylesheet', 'module-preload', 'runtime-config', 'complete',
    ]);
    for (const { url, init } of f.calls) {
      assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'manual');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.headers.Authorization, undefined);
      if (!url.includes('/api/')) assert.ok(url.startsWith(target === 'pages' ? pagesUrl : apiUrl));
    }
  });
}

test('exact build marker supports legal quotes, ordering, whitespace and self-closing forms', () => {
  for (const marker of [
    `<meta name="td-build" content="${expectedSha}">`,
    `<meta name='td-build' content='${expectedSha}'/>`,
    `<meta data-other="x" content = '${expectedSha}'\n name = "td-build" />`,
    `<META CONTENT="${expectedSha}" NAME="td-build">`,
    `<meta name=td-build content=${expectedSha} >`,
  ]) assert.equal(validateBuildMarker(marker, expectedSha), expectedSha);
});

test('build marker rejects missing, wrong, dirty, malformed, duplicate and inert markers', () => {
  const marker = `<meta name="td-build" content="${expectedSha}">`;
  for (const html of [
    '<html><head></head></html>', marker.replace(expectedSha, staleSha),
    marker.replace(expectedSha, `${expectedSha}-dirty`), marker.replace(expectedSha, `${expectedSha}suffix`),
    marker.replace(expectedSha, expectedSha.slice(0, 8)), marker.replace(expectedSha, ''),
    marker + marker, `<!-- ${marker} -->`, `<script>const fake='${marker}';</script>`,
    `<template>${marker}</template>`, `<textarea>${marker}</textarea>`,
  ]) assert.throws(() => validateBuildMarker(html, expectedSha));
  assert.throws(() => validateBuildMarker(marker, `${expectedSha}-dirty`), /invalid_expected_sha/);
});

test('a stale SHA can become ready, but a persistent wrong SHA fails all five bounded rounds', async () => {
  for (const recover of [true, false]) {
    const f = fixture({ override: ({ url, count, base }) => url === `${apiUrl}/` ? text(homepage(base, recover && count > 1 ? expectedSha : staleSha)) : undefined });
    if (recover) assert.equal((await f.run()).rounds, 2);
    else await assert.rejects(f.run(), /stale_build/);
    const homeCalls = f.calls.filter(call => call.url === `${apiUrl}/`).length;
    assert.equal(homeCalls, recover ? 2 : SMOKE_LIMITS.maxRounds);
    assert.ok(f.events.some(event => event.code === 'stale_build' && event.expectedSha === expectedSha && event.actualSha === staleSha));
  }
});

test('missing deployment marker and absent entry links receive only bounded retries', async () => {
  for (const [body, code] of [
    ['<html></html>', 'missing_marker'],
    [`<meta name="td-build" content="${expectedSha}">`, 'missing_entry_assets'],
  ]) {
    const f = fixture({ maxRounds: 2, override: ({ url }) => url === `${apiUrl}/` ? text(body) : undefined });
    await assert.rejects(f.run(), new RegExp(code));
    assert.equal(f.calls.filter(call => call.url === `${apiUrl}/`).length, 2);
  }
});

test('429, 503 and network errors retry then succeed without logging server error bodies', async () => {
  for (const mode of ['429', '503', 'network']) {
    const f = fixture({ override: ({ url, count }) => {
      if (!url.endsWith('/api/cloudflare/status') || count !== 1) return;
      if (mode === 'network') throw new Error('SECRET transport error');
      return text('SECRET platform error', 'text/html', Number(mode));
    } });
    assert.equal((await f.run()).rounds, 2);
    assert.equal(f.events.filter(event => event.status === 'retry').length, 1);
    assert.ok(!JSON.stringify(f.events).includes('SECRET'));
  }
});

test('request deadline covers unresolved headers and unresolved response bodies and aborts them', async () => {
  for (const stalled of ['headers', 'body']) {
    let signal;
    const f = fixture({ requestTimeoutMs: 15, totalTimeoutMs: 1_000, maxRounds: 2, override: ({ url, init, count }) => {
      if (!url.endsWith('/api/cloudflare/status') || count !== 1) return;
      signal = init.signal;
      if (stalled === 'headers') return new Promise(() => {});
      return { status: 200, headers: new Headers({ 'content-type': 'application/json' }), text: () => new Promise(() => {}) };
    } });
    assert.equal((await f.run()).rounds, 2);
    assert.equal(signal.aborted, true);
    assert.ok(f.events.some(event => event.code === 'request_deadline'));
  }
});

test('a finite total deadline bounds unresolved promises and retry delays', async () => {
  for (const delayed of [false, true]) {
    const f = fixture({ totalTimeoutMs: 35, requestTimeoutMs: 1_000, retryDelayMs: delayed ? 1_000 : 0,
      override: () => delayed ? text('busy', 'text/plain', 503) : new Promise(() => {}),
    });
    const start = performance.now();
    await assert.rejects(f.run(), /total_deadline/);
    assert.ok(performance.now() - start < 700);
    assert.equal(f.calls.length, 1);
    assert.equal(f.events.at(-1).status, 'failed');
  }
});

test('an elapsed total deadline takes precedence over a late retryable response', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const f = fixture({ totalTimeoutMs: 35, requestTimeoutMs: 1_000, maxRounds: 1,
    override: () => {
      now = 36;
      return text('busy', 'text/plain', 503);
    },
  });
  await assert.rejects(f.run(), /total_deadline/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.events.filter(event => event.status === 'retry').length, 0);
  assert.equal(f.events.at(-1).code, 'total_deadline');
});

test('a deadline-limited retry delay cannot start another request when its timer wakes early', async (t) => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture({ totalTimeoutMs: 35, requestTimeoutMs: 1_000, retryDelayMs: 1_000, maxRounds: 2,
    override: () => text('busy', 'text/plain', 503),
  });
  await assert.rejects(f.run(), /total_deadline/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.events.filter(event => event.status === 'retry').length, 1);
  assert.equal(f.events.at(-1).code, 'total_deadline');
});

test('retry caps and exhausted transient responses fail closed', async () => {
  const f = fixture({ override: () => text('busy', 'text/plain', 503) });
  await assert.rejects(f.run(), /http_error/);
  assert.equal(f.calls.length, 5);
  assert.equal(f.events.filter(event => event.status === 'retry').length, 4);
  for (const options of [{ maxRounds: 6 }, { totalTimeoutMs: 120_001 }, { requestTimeoutMs: 10_001 }]) {
    const invalid = fixture(options);
    await assert.rejects(invalid.run(), /invalid_deadline_or_round_limit/);
    assert.equal(invalid.calls.length, 0);
  }
});

test('configuration/project mismatches, bad readiness and 403 never retry, including JSON 503 mismatches', async () => {
  const cases = [
    ['/api/cloudflare/status', { ...statusValue, service: 'another-service' }, 'status_config_mismatch'],
    ['/api/cloudflare/status', { ...statusValue, mode: 'legacy' }, 'status_config_mismatch'],
    ['/api/cloudflare/status', { ...statusValue, checks: { ...statusValue.checks, firebase: false } }, 'status_config_mismatch'],
    ['/api/cloudflare/status', { ...statusValue, ok: false }, 'readiness_failed'],
    ['/api/cloudflare/status', { ...statusValue, checks: { ...statusValue.checks, database: false } }, 'readiness_failed'],
    ['/api/auth/config', { ...authValue, primary: 'legacy' }, 'auth_config_mismatch'],
    ['/api/auth/config', { ...authValue, firebase: false }, 'auth_config_mismatch'],
    ['/api/auth/config', { ...authValue, firebase_project_id: 'wrong-project' }, 'firebase_project_mismatch'],
    ['/api/auth/config', { ...authValue, ready: false }, 'readiness_failed'],
    ['/api/auth/config', { ...authValue, checks: { database: true, schema: false } }, 'readiness_failed'],
  ];
  for (const [path, value, code] of cases) {
    const f = fixture({ override: ({ url }) => url.endsWith(path) ? json(value, code.endsWith('mismatch') ? 503 : 200) : undefined });
    await assert.rejects(f.run(), new RegExp(code));
    assert.equal(f.events.filter(event => event.status === 'retry').length, 0);
    assert.equal(f.calls.filter(call => call.url.endsWith(path)).length, 1);
  }
  for (const path of ['/api/cloudflare/status', '/api/auth/config', '/', '/assets/index.js']) {
    const f = fixture({ override: ({ url }) => url === apiUrl + path ? text('CHALLENGE SECRET', 'text/html', 403) : undefined });
    await assert.rejects(f.run(), /forbidden/);
    assert.equal(f.events.filter(event => event.status === 'retry').length, 0);
    assert.ok(!JSON.stringify(f.events).includes('CHALLENGE'));
  }
});

test('403 fails at headers without consuming a stalled challenge body', async () => {
  let bodyRead = false;
  const f = fixture({ override: () => ({ status: 403, text: () => { bodyRead = true; return new Promise(() => {}); } }) });
  await assert.rejects(f.run(), /forbidden/);
  assert.equal(bodyRead, false);
  assert.equal(f.calls.length, 1);
});

test('invalid JSON and unexpected HTTP responses fail without retries', async () => {
  for (const response of [
    () => text('{broken SECRET', 'application/json'), () => json(null), () => json([]),
    () => text(JSON.stringify(statusValue), 'text/html'),
    () => text('SECRET', 'text/html', 302), () => text('SECRET', 'text/plain', 401),
  ]) {
    const f = fixture({ override: () => response() });
    await assert.rejects(f.run());
    assert.equal(f.calls.length, 1);
    assert.ok(!JSON.stringify(f.events).includes('SECRET'));
  }
});

test('critical entry assets reject missing files, empty bodies, wrong MIME and SPA fallback', async () => {
  for (const [response, code, rounds] of [
    [() => text('missing', 'text/plain', 404), 'http_error', 2],
    [() => text('', 'text/javascript'), 'empty_asset', 2],
    [() => text(homepage('/')), 'html_instead_of_asset', 2],
    [() => text(homepage('/'), 'text/javascript'), 'html_instead_of_asset', 2],
    [() => text('not javascript', 'application/json'), 'invalid_asset_mime', 1],
  ]) {
    const f = fixture({ maxRounds: 2, override: ({ url }) => url.endsWith('/assets/index.js') ? response() : undefined });
    await assert.rejects(f.run(), new RegExp(code));
    assert.equal(f.calls.filter(call => call.url.endsWith('/assets/index.js')).length, rounds);
  }
  for (const path of ['/assets/index.css', '/assets/vendor.js']) {
    const f = fixture({ maxRounds: 1, override: ({ url }) => url.endsWith(path) ? text(homepage('/')) : undefined });
    await assert.rejects(f.run(), /html_instead_of_asset/);
  }
});

test('transient missing asset retries and must actually become a valid asset', async () => {
  const f = fixture({ override: ({ url, count }) => url.endsWith('/assets/index.css') && count === 1 ? text('missing', 'text/plain', 404) : undefined });
  assert.equal((await f.run()).rounds, 2);
});

test('Pages resolves relative assets inside its subpath and rejects root, traversal, foreign and base-tag paths', async () => {
  const relative = fixture({ target: 'pages', override: ({ url, base }) => url === pagesUrl ? text(homepage(base).replaceAll(`${base}assets/`, './assets/')) : undefined });
  assert.equal((await relative.run()).rounds, 1);
  for (const path of ['/assets/', '../assets/', 'https://another.example/assets/']) {
    const f = fixture({ target: 'pages', override: ({ url }) => url === pagesUrl ? text(homepage(path.replace('assets/', ''))) : undefined });
    await assert.rejects(f.run(), /asset_outside_site/);
    assert.equal(f.events.filter(event => event.status === 'retry').length, 0);
  }
  const baseTag = fixture({ target: 'pages', override: ({ url, base }) => url === pagesUrl ? text(homepage(base).replace('<head>', '<head><base href="/">')) : undefined });
  await assert.rejects(baseTag.run(), /unexpected_base_tag/);
});

test('frontend runtime configuration must match APP_ID, Firebase project and actual Worker API setting', async () => {
  for (const [key, value, code] of [
    ['VITE_APP_ID', 'other-app', 'app_id_mismatch'],
    ['VITE_FIREBASE_PROJECT_ID', 'other-project', 'frontend_project_mismatch'],
    ['VITE_API_SERVER_URL', 'same-origin', 'api_origin_mismatch'],
    ['VITE_API_SERVER_URL', `${apiUrl}.attacker.example`, 'api_origin_mismatch'],
    ['VITE_API_SERVER_URL', `${apiUrl}/wrong-path`, 'api_origin_mismatch'],
  ]) {
    const f = fixture({ target: 'pages', override: ({ url }) => url.endsWith('/assets/index.js')
      ? text(`${entry('pages', { [key]: value })}\nconst unrelatedUrl="${apiUrl}";`, 'text/javascript') : undefined });
    await assert.rejects(f.run(), new RegExp(code));
    assert.equal(f.events.filter(event => event.status === 'retry').length, 0);
  }
  const worker = fixture({ override: ({ url }) => url.endsWith('/assets/index.js') ? text(entry('worker', { VITE_API_SERVER_URL: apiUrl }), 'text/javascript') : undefined });
  await assert.rejects(worker.run(), /api_origin_mismatch/);
  for (const quote of ["'", '`']) {
    const minified = fixture({ target: 'pages', override: ({ url }) => url.endsWith('/assets/index.js')
      ? text(`var e={VITE_APP_ID:${quote}${expectedAppId}${quote},VITE_FIREBASE_PROJECT_ID:${quote}${expectedProjectId}${quote},VITE_API_SERVER_URL:${quote}${apiUrl}${quote}};`, 'application/javascript') : undefined });
    assert.equal((await minified.run()).rounds, 1);
  }
  const interpolated = fixture({ target: 'pages', override: ({ url }) => url.endsWith('/assets/index.js')
    ? text(entry('pages').replace(JSON.stringify(apiUrl), '`' + apiUrl + '${suffix}`'), 'text/javascript') : undefined });
  await assert.rejects(interpolated.run(), /api_origin_mismatch/);
});

test('all diagnostic records use only public finite fields and sanitized expected/actual SHA', async () => {
  const secret = 'TOKEN-player-private-data';
  const f = fixture({ override: ({ url, base }) => {
    if (url.endsWith('/api/cloudflare/status')) return json({ ...statusValue, token: secret, player: { name: secret } });
    if (url.endsWith('/api/auth/config')) return json({ ...authValue, token: secret });
    if (url === `${apiUrl}/`) return text(homepage(base, secret));
  } });
  await assert.rejects(f.run(), /invalid_marker/);
  for (const event of f.events) {
    assert.ok(Object.keys(event).every(key => ['round', 'stage', 'status', 'code', 'httpStatus', 'expectedSha', 'actualSha'].includes(key)));
  }
  assert.equal(f.events.at(-1).actualSha, 'invalid');
  assert.ok(!JSON.stringify(f.events).includes(secret));
  const invalid = fixture({ expectedSha: secret });
  await assert.rejects(invalid.run(), /invalid_expected_sha/);
  assert.ok(!JSON.stringify(invalid.events).includes(secret));
});

test('invalid URL and origin settings fail before network requests', async () => {
  for (const options of [
    { siteUrl: 'http://worker.example' }, { apiUrl: `${apiUrl}/api` },
    { apiUrl: `${apiUrl}?token=SECRET` }, { siteUrl: 'https://user:SECRET@worker.example/' },
    { siteUrl: 'https://other.example/' }, { target: 'pages', apiUrl: 'https://owner.github.io' },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.equal(f.calls.length, 0);
    assert.ok(!JSON.stringify(f.events).includes('SECRET'));
  }
});

test('environment CLI wiring uses explicit release inputs and exits nonzero for invalid configuration', () => {
  assert.deepEqual(smokeOptionsFromEnv({ SMOKE_TARGET: 'pages', SMOKE_SITE_URL: pagesUrl, SMOKE_API_URL: apiUrl, VITE_BUILD_SHA: expectedSha, VITE_FIREBASE_PROJECT_ID: expectedProjectId, VITE_APP_ID: expectedAppId }), {
    target: 'pages', siteUrl: pagesUrl, apiUrl, expectedSha, expectedProjectId, expectedAppId,
  });
  const result = spawnSync(process.execPath, ['scripts/smoke-production.mjs'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, SMOKE_TARGET: 'invalid-SECRET' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /"stage":"configuration".*"status":"failed".*"code":"invalid_target"/);
  assert.ok(!result.stdout.includes('SECRET'));
  assert.equal(result.stderr, '');
});
