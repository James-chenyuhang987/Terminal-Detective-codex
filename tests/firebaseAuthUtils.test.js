import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_FEEDBACK_CODES,
  authRedirectFeedback,
  hasGitHubProvider,
  hasPasswordProvider,
  mapFirebaseAuthError,
  providerIds,
  validatePassword,
} from '../src/lib/authErrors.js';
import { isRecentAuthTime } from '../src/lib/authSession.js';

test('email passwords require length, a letter and a number', () => {
  assert.equal(validatePassword('detective9').valid, true);
  assert.equal(validatePassword('short1').valid, false);
  assert.equal(validatePassword('letters-only').number, false);
  assert.equal(validatePassword('12345678').letter, false);
  assert.equal(validatePassword(`a1${'x'.repeat(63)}`).valid, false);
});

test('Firebase errors map to stable player-facing categories', () => {
  assert.equal(mapFirebaseAuthError({ code: 'auth/invalid-credential' }), AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
  assert.equal(mapFirebaseAuthError({ code: 'auth/email-already-in-use' }), AUTH_FEEDBACK_CODES.EMAIL_IN_USE);
  assert.equal(mapFirebaseAuthError({ code: 'auth/too-many-requests' }), AUTH_FEEDBACK_CODES.RATE_LIMITED);
  assert.equal(mapFirebaseAuthError({ code: 'auth/popup-closed-by-user' }), AUTH_FEEDBACK_CODES.GITHUB_CANCELLED);
  assert.equal(mapFirebaseAuthError({ code: 'auth/account-exists-with-different-credential' }), AUTH_FEEDBACK_CODES.ACCOUNT_EXISTS);
  assert.equal(mapFirebaseAuthError({ code: 'auth/invalid-action-code' }), AUTH_FEEDBACK_CODES.ACTION_EXPIRED);
  assert.equal(mapFirebaseAuthError({ code: 'auth/unauthorized-domain' }), AUTH_FEEDBACK_CODES.CONFIG_MISSING);
  assert.equal(mapFirebaseAuthError({ code: 'auth/user-mismatch' }), AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
  assert.equal(mapFirebaseAuthError({ name: 'AbortError' }), AUTH_FEEDBACK_CODES.NETWORK);
  assert.equal(mapFirebaseAuthError({ code: 'auth/unauthorized-domain' }), AUTH_FEEDBACK_CODES.DOMAIN_UNAUTHORIZED);
  assert.equal(mapFirebaseAuthError({ code: 'auth/operation-not-allowed' }), AUTH_FEEDBACK_CODES.PROVIDER_DISABLED);
  assert.equal(mapFirebaseAuthError({ code: 'auth/web-storage-unsupported' }), AUTH_FEEDBACK_CODES.BROWSER_UNSUPPORTED);
});

test('redirect errors are reduced to safe feedback categories', () => {
  assert.equal(authRedirectFeedback({ error: 'access_denied' }), AUTH_FEEDBACK_CODES.GITHUB_CANCELLED);
  assert.equal(authRedirectFeedback({ error_code: 'too_many_attempts' }), AUTH_FEEDBACK_CODES.RATE_LIMITED);
  assert.equal(authRedirectFeedback({ error_description: 'unauthorized redirect domain' }), AUTH_FEEDBACK_CODES.DOMAIN_UNAUTHORIZED);
  assert.equal(authRedirectFeedback({}), '');
});

test('email cooldown persists and backs off after real rate limits', () => {
  const storage = memoryStorage();
  startAuthCooldown('verify', { storage, now: 1_000 });
  assert.equal(cooldownRemaining('verify', storage, 1_000), 60);
  startAuthCooldown('verify', { storage, now: 61_000, rateLimited: true });
  assert.equal(cooldownRemaining('verify', storage, 61_000), 120);
  startAuthCooldown('verify', { storage, now: 181_000, rateLimited: true });
  assert.equal(cooldownRemaining('verify', storage, 181_000), 240);
});

test('recent authentication accepts only a bounded, non-future timestamp', () => {
  const now = Date.parse('2026-08-31T12:00:00.000Z');
  assert.equal(isRecentAuthTime('2026-08-31T11:56:00.000Z', now), true);
  assert.equal(isRecentAuthTime('2026-08-31T11:54:59.000Z', now), false);
  assert.equal(isRecentAuthTime('2026-08-31T12:00:59.000Z', now), true);
  assert.equal(isRecentAuthTime('2026-08-31T12:01:01.000Z', now), false);
  assert.equal(isRecentAuthTime('not-a-date', now), false);
});

test('provider helpers deduplicate Firebase identities', () => {
  const user = { providerData: [
    { providerId: 'password' },
    { providerId: 'github.com' },
    { providerId: 'github.com' },
  ] };
  assert.deepEqual(providerIds(user), ['password', 'github.com']);
  assert.equal(hasPasswordProvider(user), true);
  assert.equal(hasGitHubProvider(user), true);
});
