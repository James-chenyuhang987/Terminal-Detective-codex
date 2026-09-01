import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';

import {
  authInternals,
  firebaseAuthConfigured,
  verifyFirebaseToken,
} from '../cloudflare/worker/auth.js';
import { profileInternals } from '../cloudflare/worker/profile.js';

const PROJECT_ID = 'terminal-detective-test';
const NOW = 1_800_000_000;

async function signedToken(overrides = {}, signingKey = null) {
  const pair = signingKey || await generateKeyPair('RS256');
  const publicJwk = await exportJWK(pair.publicKey);
  const publicKey = await importJWK(publicJwk, 'RS256');
  const payload = {
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    sub: 'firebase-user-123',
    email: 'detective@example.com',
    email_verified: true,
    iat: NOW - 30,
    auth_time: NOW - 60,
    exp: NOW + 3600,
    firebase: { sign_in_provider: 'password', identities: { email: ['detective@example.com'] } },
    ...overrides,
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .sign(pair.privateKey);
  return { token, publicKey, pair };
}

test('Firebase bearer extraction accepts one well-formed token only', () => {
  assert.equal(authInternals.extractBearer(new Request('https://game.example', {
    headers: { Authorization: 'Bearer abc.def.ghi' },
  })), 'abc.def.ghi');
  assert.equal(authInternals.extractBearer(new Request('https://game.example')), '');
  assert.equal(authInternals.extractBearer(new Request('https://game.example', {
    headers: { Authorization: 'Basic abc' },
  })), '');
});

test('Firebase configuration rejects deployment placeholders', () => {
  assert.equal(firebaseAuthConfigured({ FIREBASE_PROJECT_ID: PROJECT_ID }), true);
  assert.equal(firebaseAuthConfigured({ FIREBASE_PROJECT_ID: '' }), false);
  assert.equal(firebaseAuthConfigured({ FIREBASE_PROJECT_ID: 'REPLACE_WITH_FIREBASE_PROJECT_ID' }), false);
});

test('Firebase token verification enforces signature and required claims', async () => {
  const valid = await signedToken();
  const options = {
    currentDate: new Date(NOW * 1000),
    nowSeconds: NOW,
    keyResolver: async kid => {
      assert.equal(kid, 'test-key');
      return valid.publicKey;
    },
  };
  const claims = await verifyFirebaseToken(valid.token, { FIREBASE_PROJECT_ID: PROJECT_ID }, options);
  assert.equal(claims.sub, 'firebase-user-123');

  const wrongAudience = await signedToken({ aud: 'other-project' });
  await assert.rejects(
    verifyFirebaseToken(wrongAudience.token, { FIREBASE_PROJECT_ID: PROJECT_ID }, {
      ...options, keyResolver: async () => wrongAudience.publicKey,
    }),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );

  const unverified = await signedToken({ email_verified: false });
  await assert.rejects(
    verifyFirebaseToken(unverified.token, { FIREBASE_PROJECT_ID: PROJECT_ID }, {
      ...options, keyResolver: async () => unverified.publicKey,
    }),
    error => error.code === 'EMAIL_UNVERIFIED' && error.status === 403,
  );

  const expired = await signedToken({ exp: NOW - 1 });
  await assert.rejects(
    verifyFirebaseToken(expired.token, { FIREBASE_PROJECT_ID: PROJECT_ID }, {
      ...options, keyResolver: async () => expired.publicKey,
    }),
    error => error.code === 'TOKEN_EXPIRED',
  );

  const attacker = await signedToken();
  await assert.rejects(
    verifyFirebaseToken(attacker.token, { FIREBASE_PROJECT_ID: PROJECT_ID }, options),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
});

test('Firebase providers expose only supported sign-in methods', () => {
  assert.deepEqual(authInternals.firebaseProviders({
    firebase: {
      sign_in_provider: 'github.com',
      identities: { password: ['x'], 'github.com': ['1'], google: ['2'] },
    },
  }), ['password', 'github.com']);
  assert.equal(authInternals.cacheMaxAge('public, max-age=120, must-revalidate'), 120);
  assert.equal(authInternals.cacheMaxAge(''), 3600);
});

test('profile patches reject metadata and accept only progress fields', () => {
  assert.deepEqual(profileInternals.cleanPatch({ gold: 500, detective_name: 'Nova' }), {
    gold: 500, detective_name: 'Nova',
  });
  assert.equal(profileInternals.cleanPatch({ id: 'forged', gold: 500 }), null);
  assert.equal(profileInternals.cleanPatch([]), null);
  assert.equal(profileInternals.cleanPatch({ gold: Number.POSITIVE_INFINITY }), null);
  assert.equal(profileInternals.cleanPatch({ inventory: Array.from({ length: 4097 }) }), null);

  const polluted = JSON.parse('{"inventory":{"__proto__":{"isAdmin":true}}}');
  assert.equal(profileInternals.cleanPatch(polluted), null);
  assert.equal(profileInternals.cleanPatch({ inventory: [{ user_id: 'other-player' }] }), null);
  assert.equal({}.isAdmin, undefined);
});
