import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_THROTTLE_ACTIONS,
  authThrottleInternals,
  authThrottleRemaining,
  recordAuthRateLimit,
  recordAuthSuccess,
} from '../src/lib/authThrottle.js';
import { sanitizedAuthReturnUrl } from '../src/lib/authReturn.js';
import { requestAuthReadiness } from '../src/lib/authReadiness.js';
import { createFaultReference } from '../src/lib/faultReference.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('auth throttles persist independent success and escalating rate-limit windows', () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  recordAuthSuccess(AUTH_THROTTLE_ACTIONS.VERIFY_EMAIL, storage, now);
  const verificationRecord = storage.getItem(
    authThrottleInternals.actionStorageKey(AUTH_THROTTLE_ACTIONS.VERIFY_EMAIL),
  );
  assert.equal(authThrottleRemaining(AUTH_THROTTLE_ACTIONS.VERIFY_EMAIL, storage, now), 60);
  assert.equal(authThrottleRemaining(AUTH_THROTTLE_ACTIONS.RESET_PASSWORD, storage, now), 0);

  assert.equal(recordAuthRateLimit(AUTH_THROTTLE_ACTIONS.RESET_PASSWORD, storage, now), 120);
  assert.equal(
    storage.getItem(authThrottleInternals.actionStorageKey(AUTH_THROTTLE_ACTIONS.VERIFY_EMAIL)),
    verificationRecord,
  );
  assert.equal(recordAuthRateLimit(AUTH_THROTTLE_ACTIONS.RESET_PASSWORD, storage, now), 240);
  assert.equal(recordAuthRateLimit(AUTH_THROTTLE_ACTIONS.RESET_PASSWORD, storage, now), 480);
  assert.equal(recordAuthRateLimit(AUTH_THROTTLE_ACTIONS.RESET_PASSWORD, storage, now), 900);
  assert.equal(recordAuthRateLimit(AUTH_THROTTLE_ACTIONS.RESET_PASSWORD, storage, now), 900);
});

test('legacy OAuth errors are removed without damaging app routes or unrelated query values', () => {
  assert.deepEqual(
    sanitizedAuthReturnUrl('https://game.example/play?case=1&error=access_denied&error_description=nope#/case/2'),
    { changed: true, path: '/play?case=1#/case/2' },
  );
  assert.deepEqual(
    sanitizedAuthReturnUrl('https://game.example/play?case=1#/case/2'),
    { changed: false, path: '/play?case=1#/case/2' },
  );
  assert.deepEqual(
    sanitizedAuthReturnUrl('https://game.example/#error=access_denied&error_description=nope'),
    { changed: true, path: '/' },
  );
});

test('auth readiness requires matching Firebase project and complete backend checks', async () => {
  const ready = await requestAuthReadiness('https://game.example', 'project-a', {
    fetchImpl: async () => new Response(JSON.stringify({
      firebase: true,
      firebase_project_id: 'project-a',
      ready: true,
      checks: { database: true, schema: true },
    })),
  });
  assert.equal(ready.ready, true);

  await assert.rejects(
    requestAuthReadiness('https://game.example', 'project-b', {
      fetchImpl: async () => new Response(JSON.stringify({
        firebase: true,
        firebase_project_id: 'project-a',
        ready: true,
        checks: { database: true, schema: true },
      })),
    }),
    error => error.code === 'FIREBASE_PROJECT_MISMATCH',
  );
});

test('fault references are anonymous and stable-format', () => {
  assert.equal(createFaultReference(() => '12345678-abcd-secret'), 'TD-12345678AB');
});
