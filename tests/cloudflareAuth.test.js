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

  const wrongIssuer = await signedToken({ iss: 'https://securetoken.google.com/other-project' });
  await assert.rejects(
    verifyFirebaseToken(wrongIssuer.token, { FIREBASE_PROJECT_ID: PROJECT_ID }, {
      ...options, keyResolver: async () => wrongIssuer.publicKey,
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

test('Firebase claims reject missing identity fields and future authentication times', () => {
  const claims = {
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    sub: 'firebase-user-123',
    email: 'detective@example.com',
    email_verified: true,
    iat: NOW - 30,
    auth_time: NOW - 60,
    exp: NOW + 3600,
  };
  assert.throws(
    () => authInternals.validateClaims({ ...claims, sub: '' }, PROJECT_ID, NOW),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
  assert.throws(
    () => authInternals.validateClaims({ ...claims, email: null }, PROJECT_ID, NOW),
    error => error.code === 'EMAIL_REQUIRED' && error.status === 403,
  );
  assert.throws(
    () => authInternals.validateClaims({ ...claims, iat: NOW + 301 }, PROJECT_ID, NOW),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
  assert.throws(
    () => authInternals.validateClaims({ ...claims, auth_time: NOW + 301 }, PROJECT_ID, NOW),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
  assert.throws(
    () => authInternals.validateClaims({ ...claims, iat: 0 }, PROJECT_ID, NOW),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
  assert.throws(
    () => authInternals.validateClaims({ ...claims, auth_time: claims.iat + 301 }, PROJECT_ID, NOW),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
  assert.throws(
    () => authInternals.validateClaims({
      ...claims,
      iat: NOW + 100,
      exp: NOW + 100,
    }, PROJECT_ID, NOW),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
});

test('Firebase providers expose only supported sign-in methods', () => {
  assert.deepEqual(authInternals.firebaseProviders({
    firebase: {
      sign_in_provider: 'github.com',
      identities: { email: ['detective@example.com'], 'github.com': ['1'], google: ['2'] },
    },
  }), ['github.com']);
  assert.deepEqual(authInternals.firebaseProviders({
    firebase: {
      sign_in_provider: 'password',
      identities: { email: ['detective@example.com'] },
    },
  }), ['password']);
  assert.equal(authInternals.cacheMaxAge('public, max-age=120, must-revalidate'), 120);
  assert.equal(authInternals.cacheMaxAge(''), 3600);
});

test('Google signing key refresh is shared and unknown key refreshes are throttled', async () => {
  authInternals.resetKeyCache();
  let fetches = 0;
  let imports = 0;
  const fetchKeys = async () => {
    fetches += 1;
    return new Response(JSON.stringify({ known: 'certificate' }), {
      headers: { 'cache-control': 'public, max-age=120' },
    });
  };
  const importCertificate = async certificate => {
    imports += 1;
    assert.equal(certificate, 'certificate');
    return { type: 'public-key' };
  };

  const [first, second] = await Promise.all([
    authInternals.firebaseKey('known', fetchKeys, importCertificate),
    authInternals.firebaseKey('known', fetchKeys, importCertificate),
  ]);
  assert.equal(first, second);
  assert.equal(fetches, 1);
  assert.equal(imports, 1);

  await assert.rejects(
    authInternals.firebaseKey('missing', fetchKeys, importCertificate),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
  await assert.rejects(
    authInternals.firebaseKey('another-missing', fetchKeys, importCertificate),
    error => error.code === 'INVALID_FIREBASE_TOKEN',
  );
  assert.equal(fetches, 1);
});

test('Google signing key failures use a short shared retry backoff', async () => {
  authInternals.resetKeyCache();
  let fetches = 0;
  const unavailable = async () => {
    fetches += 1;
    throw new Error('metadata offline');
  };

  const failures = await Promise.allSettled([
    authInternals.firebaseKey('missing-a', unavailable, async () => null),
    authInternals.firebaseKey('missing-b', unavailable, async () => null),
  ]);
  for (const failure of failures) {
    assert.equal(failure.status, 'rejected');
    assert.equal(failure.reason.code, 'FIREBASE_KEYS_UNAVAILABLE');
    assert.equal(failure.reason.status, 503);
  }
  await assert.rejects(
    authInternals.firebaseKey('missing-c', unavailable, async () => null),
    error => error.code === 'FIREBASE_KEYS_UNAVAILABLE' && error.status === 503,
  );
  assert.equal(fetches, 2);
});

test('Google signing key timeout covers a stalled successful response body', async () => {
  authInternals.resetKeyCache();
  let fetches = 0;
  const stalledBody = async () => {
    fetches += 1;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'cache-control': 'public, max-age=120' }),
      json: () => new Promise(() => {}),
    };
  };

  await assert.rejects(
    authInternals.firebaseKey('missing', stalledBody, async () => null, 5),
    error => error.code === 'FIREBASE_KEYS_UNAVAILABLE' && error.status === 503,
  );
  assert.equal(fetches, 2);
});

test('unknown signing keys share refreshes and failures do not start the long throttle', async () => {
  authInternals.resetKeyCache();
  const realNow = Date.now;
  let now = 1_800_000_000_000;
  let fetches = 0;
  Date.now = () => now;
  const unavailable = async () => {
    fetches += 1;
    throw new Error('metadata offline');
  };
  try {
    const failures = await Promise.allSettled([
      authInternals.firebaseKey('rotated-a', unavailable, async () => null),
      authInternals.firebaseKey('rotated-b', unavailable, async () => null),
    ]);
    assert.deepEqual(failures.map(item => item.status), ['rejected', 'rejected']);
    assert.equal(fetches, 2);

    now += 6_000;
    await assert.rejects(
      authInternals.firebaseKey('rotated-c', unavailable, async () => null),
      error => error.code === 'FIREBASE_KEYS_UNAVAILABLE',
    );
    assert.equal(fetches, 4);
  } finally {
    Date.now = realNow;
    authInternals.resetKeyCache();
  }
});

test('Firebase user bootstrap is idempotent for concurrent first requests', async () => {
  const users = new Map();
  const profiles = new Set();
  let batches = 0;
  const DB = {
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() { return null; },
      };
    },
    async batch(statements) {
      batches += 1;
      for (const statement of statements) {
        if (statement.sql.includes('INSERT INTO users')) users.set(statement.args[0], statement.args[1]);
        if (statement.sql.includes('INSERT INTO profiles')) profiles.add(statement.args[0]);
      }
    },
  };
  const claims = {
    sub: 'firebase-user-123',
    email: 'Detective@Example.com',
    name: 'Detective',
    picture: 'https://example.com/avatar.png',
    firebase: { identities: { email: ['detective@example.com'] } },
  };

  const [first, second] = await Promise.all([
    authInternals.upsertFirebaseUser({ DB }, claims),
    authInternals.upsertFirebaseUser({ DB }, claims),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.email, 'detective@example.com');
  assert.equal(users.size, 1);
  assert.equal(profiles.size, 1);
  assert.equal(batches, 2);
});

test('Firebase user bootstrap distinguishes identity conflicts from database outages', async () => {
  const previousConsoleError = console.error;
  console.error = () => {};
  const claims = {
    sub: 'firebase-user-123',
    email: 'detective@example.com',
    firebase: { identities: { email: ['detective@example.com'] } },
  };
  const failingDB = message => ({
    prepare(sql) {
      return {
        sql,
        bind() { return this; },
        async first() { return null; },
      };
    },
    async batch() { throw new Error(message); },
  });

  try {
    await assert.rejects(
      authInternals.upsertFirebaseUser({ DB: failingDB('UNIQUE constraint failed: users.email') }, claims),
      error => error.code === 'FIREBASE_PROFILE_CONFLICT' && error.status === 409,
    );
    await assert.rejects(
      authInternals.upsertFirebaseUser({ DB: failingDB('D1 unavailable') }, claims),
      error => error.code === 'DATABASE_UNAVAILABLE' && error.status === 503,
    );
  } finally {
    console.error = previousConsoleError;
  }
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

test('profile storage rejects corrupt JSON and validates idempotency operation ids', async () => {
  assert.throws(
    () => profileInternals.parseProfile('{"gold":'),
    error => error.code === 'PROFILE_DATA_CORRUPT' && error.status === 500,
  );
  assert.throws(
    () => profileInternals.parseProfile('[]'),
    error => error.code === 'PROFILE_DATA_CORRUPT' && error.status === 500,
  );
  assert.deepEqual(profileInternals.parseProfile('{"gold":10}'), { gold: 10 });
  assert.equal(profileInternals.validOperationId('op-1234567890123456'), true);
  assert.equal(profileInternals.validOperationId('short'), false);
  assert.equal(await profileInternals.patchHash({ gold: 10 }), await profileInternals.patchHash({ gold: 10 }));
  assert.notEqual(await profileInternals.patchHash({ gold: 10 }), await profileInternals.patchHash({ gold: 11 }));
});
