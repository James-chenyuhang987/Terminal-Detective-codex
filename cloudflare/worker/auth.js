import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_TOLERANCE_SECONDS = 300;
let cachedKeys = new Map();
let cachedKeysExpireAt = 0;

function authError(code, status = 401) {
  return Object.assign(new Error(code), { code, status });
}

function extractBearer(request) {
  const value = String(request.headers.get('authorization') || '');
  const match = value.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || '';
}

function cacheMaxAge(value) {
  const match = String(value || '').match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Math.max(60, Number(match[1]) || 0) : 3600;
}

async function refreshGoogleKeys(fetchImpl = fetch) {
  const response = await fetchImpl(GOOGLE_CERTS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);
  const certificates = await response.json();
  if (!certificates || typeof certificates !== 'object') throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);
  const next = new Map();
  await Promise.all(Object.entries(certificates).map(async ([kid, certificate]) => {
    if (!kid || typeof certificate !== 'string') return;
    next.set(kid, await importX509(certificate, 'RS256'));
  }));
  if (!next.size) throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);
  cachedKeys = next;
  cachedKeysExpireAt = Date.now() + cacheMaxAge(response.headers.get('cache-control')) * 1000;
  return next;
}

async function firebaseKey(kid, fetchImpl = fetch) {
  if (!kid) throw authError('INVALID_FIREBASE_TOKEN');
  if (Date.now() >= cachedKeysExpireAt || !cachedKeys.has(kid)) await refreshGoogleKeys(fetchImpl);
  const key = cachedKeys.get(kid);
  if (!key) throw authError('INVALID_FIREBASE_TOKEN');
  return key;
}

function firebaseProviders(claims) {
  const identities = claims?.firebase?.identities;
  const values = identities && typeof identities === 'object' ? Object.keys(identities) : [];
  const provider = claims?.firebase?.sign_in_provider;
  if (provider && provider !== 'custom') values.push(provider);
  return [...new Set(values.map(value => value === 'github.com' ? 'github.com' : value).filter(value => ['password', 'github.com'].includes(value)))];
}

function validateClaims(payload, projectId, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!payload || typeof payload !== 'object') throw authError('INVALID_FIREBASE_TOKEN');
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) throw authError('INVALID_FIREBASE_TOKEN');
  if (!Number.isFinite(payload.iat) || payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS) throw authError('INVALID_FIREBASE_TOKEN');
  if (!Number.isFinite(payload.auth_time) || payload.auth_time > nowSeconds + CLOCK_TOLERANCE_SECONDS) throw authError('INVALID_FIREBASE_TOKEN');
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) throw authError('TOKEN_EXPIRED');
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw authError('INVALID_FIREBASE_TOKEN');
  if (payload.email_verified !== true) throw authError('EMAIL_UNVERIFIED', 403);
  if (!payload.email || typeof payload.email !== 'string') throw authError('EMAIL_REQUIRED', 403);
  return payload;
}

export function firebaseAuthConfigured(env) {
  const projectId = String(env?.FIREBASE_PROJECT_ID || '').trim();
  return Boolean(projectId && !/^(?:REPLACE_WITH_|YOUR_|<)/i.test(projectId));
}

export function authConfig(env) {
  return {
    primary: 'firebase',
    firebase: firebaseAuthConfigured(env),
    email_password: firebaseAuthConfigured(env),
    github: firebaseAuthConfigured(env),
  };
}

export async function verifyFirebaseToken(token, env, options = {}) {
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  if (!firebaseAuthConfigured(env)) throw authError('FIREBASE_NOT_CONFIGURED', 503);
  if (!token) throw authError('UNAUTHENTICATED');
  let header;
  try { header = decodeProtectedHeader(token); } catch { throw authError('INVALID_FIREBASE_TOKEN'); }
  if (header.alg !== 'RS256' || !header.kid) throw authError('INVALID_FIREBASE_TOKEN');
  try {
    const key = options.keyResolver
      ? await options.keyResolver(header.kid)
      : await firebaseKey(header.kid, options.fetchImpl);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: options.currentDate,
    });
    return validateClaims(payload, projectId, options.nowSeconds);
  } catch (error) {
    if (error?.code && ['EMAIL_UNVERIFIED', 'FIREBASE_KEYS_UNAVAILABLE', 'TOKEN_EXPIRED'].includes(error.code)) throw error;
    throw authError(error?.code === 'ERR_JWT_EXPIRED' ? 'TOKEN_EXPIRED' : 'INVALID_FIREBASE_TOKEN');
  }
}

function userPayload(claims) {
  return {
    id: claims.sub,
    email: String(claims.email).trim().toLowerCase(),
    email_verified: true,
    full_name: claims.name || String(claims.email).split('@')[0],
    avatar_url: claims.picture || null,
    auth_providers: firebaseProviders(claims),
  };
}

async function upsertFirebaseUser(env, claims) {
  if (!env.DB) throw authError('DATABASE_UNAVAILABLE', 503);
  const user = userPayload(claims);
  try {
    const existing = await env.DB.prepare(`
      SELECT id, email, email_verified, display_name, avatar_url FROM users WHERE id = ?
    `).bind(user.id).first();
    if (existing) {
      const unchanged = String(existing.email || '').toLowerCase() === user.email
        && Number(existing.email_verified) === 1
        && String(existing.display_name || '') === String(user.full_name || '')
        && String(existing.avatar_url || '') === String(user.avatar_url || '');
      if (!unchanged) {
        await env.DB.prepare(`
          UPDATE users SET email = ?, email_verified = 1, display_name = ?, avatar_url = ?,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(user.email, user.full_name, user.avatar_url, user.id).run();
      }
      return user;
    }
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO users (id, email, email_verified, display_name, avatar_url)
        VALUES (?, ?, 1, ?, ?)
      `).bind(user.id, user.email, user.full_name, user.avatar_url),
      env.DB.prepare(`
        INSERT INTO profiles (user_id, profile_json) VALUES (?, '{}')
        ON CONFLICT(user_id) DO NOTHING
      `).bind(user.id),
    ]);
  } catch (error) {
    console.error('Firebase user bootstrap failed:', String(error?.message || error));
    throw authError('FIREBASE_PROFILE_CONFLICT', 409);
  }
  return user;
}

export async function readFirebaseSession(request, env, options = {}) {
  const token = extractBearer(request);
  if (!token) return null;
  const claims = await verifyFirebaseToken(token, env, options);
  const user = await upsertFirebaseUser(env, claims);
  return { user_id: claims.sub, user, claims };
}

export async function logoutFirebase() {
  return Response.json({ ok: true, backend: 'firebase-cloudflare' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const authInternals = Object.freeze({
  extractBearer,
  cacheMaxAge,
  validateClaims,
  firebaseProviders,
  resetKeyCache() { cachedKeys = new Map(); cachedKeysExpireAt = 0; },
});
