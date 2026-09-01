import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_FEEDBACK_CODES,
  hasGitHubProvider,
  hasPasswordProvider,
  mapFirebaseAuthError,
  providerIds,
  validatePassword,
} from '../src/lib/authErrors.js';

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
  assert.equal(mapFirebaseAuthError({ name: 'AbortError' }), AUTH_FEEDBACK_CODES.NETWORK);
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
