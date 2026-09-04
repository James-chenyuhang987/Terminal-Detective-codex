import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSingleFlight } from '../src/lib/singleFlight.js';
import { publicErrorMessage } from '../src/lib/publicError.js';

const page = readFileSync(new URL('../src/pages/TerminalDetective.jsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../src/components/game/GameLanding.jsx', import.meta.url), 'utf8');

test('single-flight profile loading reuses one request and permits a later retry', async () => {
  const flight = createSingleFlight();
  let resolveRequest;
  let calls = 0;
  const task = () => {
    calls += 1;
    return new Promise(resolve => { resolveRequest = resolve; });
  };

  const first = flight.run('account:1', task);
  const duplicate = flight.run('account:1', task);
  assert.strictEqual(first, duplicate);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveRequest({ detective_name: 'NEXUS' });
  assert.deepEqual(await first, { detective_name: 'NEXUS' });

  assert.deepEqual(await flight.run('account:1', async () => {
    calls += 1;
    return { detective_name: 'AURORA' };
  }), { detective_name: 'AURORA' });
  assert.equal(calls, 2);
});

test('single-flight profile loading clears rejected requests for retry', async () => {
  const flight = createSingleFlight();
  await assert.rejects(flight.run('account:1', async () => {
    throw new Error('offline');
  }), /offline/);
  await assert.doesNotReject(flight.run('account:1', async () => ({ detective_name: '' })));
});

test('terminal entry exposes pending and retry feedback instead of failing silently', () => {
  assert.match(page, /const \[startBusy, setStartBusy\] = useState\(false\)/);
  assert.match(page, /if \(startRef\.current\) return/);
  assert.match(page, /await loadProfile\(\)/);
  assert.match(page, /setStartError\(publicErrorMessage\(cause, lang\)\)/);
  assert.match(landing, /disabled=\{busy\}/);
  assert.match(landing, /aria-busy=\{busy\}/);
  assert.match(landing, /td-landing-start-error/);
  assert.match(landing, /role="alert"/);
});

test('profile network failures have safe bilingual terminal-entry feedback', () => {
  const error = { code: 'PROFILE_NETWORK' };
  assert.equal(publicErrorMessage(error, 'zh'), '无法连接云端档案，请检查网络或代理后重试。');
  assert.equal(
    publicErrorMessage(error, 'en'),
    'The cloud profile could not be reached. Check your network or proxy and retry.',
  );
});
