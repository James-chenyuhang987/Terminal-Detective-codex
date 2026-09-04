import { decodeProtectedHeader, importX509, jwtVerify } from 'jose';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_TOLERANCE_SECONDS = 300;
const UNKNOWN_KID_REFRESH_INTERVAL_MS = 60_000;
const KEY_REFRESH_FAILURE_BACKOFF_MS = 5_000;
const KEY_FETCH_TIMEOUT_MS = 3_500;
const KEY_FETCH_ATTEMPTS = 2;
const READINESS_CACHE_MS = 15_000;
const REQUIRED_SCHEMA = Object.freeze({
  users: ['id', 'email', 'email_verified', 'display_name', 'avatar_url'],
  profiles: ['user_id', 'profile_json', 'profile_revision', 'active_session_id'],
  profile_operations: ['user_id', 'operation_id', 'base_revision', 'result_revision', 'patch_hash'],
});
const REQUIRED_MIGRATION = '0003_profile_operations.sql';
let cachedKeys = new Map();
let cachedKeysExpireAt = 0;
let keyRefreshPromise = null;
let keyRefreshRetryAt = 0;
let unknownKidRefreshAfter = 0;
let readinessCache = new WeakMap();

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

async function refreshGoogleKeys(
  fetchImpl = fetch,
  importCertificate = importX509,
  timeoutMs = KEY_FETCH_TIMEOUT_MS,
) {
  if (keyRefreshPromise) return keyRefreshPromise;
  if (Date.now() < keyRefreshRetryAt) throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);

  const request = (async () => {
    let response;
    let certificates;
    for (let attempt = 0; attempt < KEY_FETCH_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      let timeout;
      try {
        const fetchAndRead = (async () => {
          const nextResponse = await fetchImpl(GOOGLE_CERTS_URL, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          const body = nextResponse.ok ? await nextResponse.json() : null;
          return { response: nextResponse, certificates: body };
        })();
        const deadline = new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(authError('FIREBASE_KEYS_UNAVAILABLE', 503));
          }, timeoutMs);
        });
        ({ response, certificates } = await Promise.race([fetchAndRead, deadline]));
      } catch {
        response = null;
        certificates = null;
      } finally {
        clearTimeout(timeout);
      }
      if (response?.ok) break;
      const retryable = !response || [429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === KEY_FETCH_ATTEMPTS - 1) {
        throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);
      }
    }
    if (!certificates || typeof certificates !== 'object') throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);
    const next = new Map();
    try {
      await Promise.all(Object.entries(certificates).map(async ([kid, certificate]) => {
        if (!kid || typeof certificate !== 'string') return;
        next.set(kid, await importCertificate(certificate, 'RS256'));
      }));
    } catch {
      throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);
    }
    if (!next.size) throw authError('FIREBASE_KEYS_UNAVAILABLE', 503);
    cachedKeys = next;
    cachedKeysExpireAt = Date.now() + cacheMaxAge(response.headers.get('cache-control')) * 1000;
    keyRefreshRetryAt = 0;
    return next;
  })();
  keyRefreshPromise = request
    .catch(error => {
      keyRefreshRetryAt = Date.now() + KEY_REFRESH_FAILURE_BACKOFF_MS;
      throw error?.code === 'FIREBASE_KEYS_UNAVAILABLE'
        ? error
        : authError('FIREBASE_KEYS_UNAVAILABLE', 503);
    })
    .finally(() => {
      keyRefreshPromise = null;
    });
  return keyRefreshPromise;
}

async function firebaseKey(
  kid,
  fetchImpl = fetch,
  importCertificate = importX509,
  timeoutMs = KEY_FETCH_TIMEOUT_MS,
) {
  if (!kid) throw authError('INVALID_FIREBASE_TOKEN');
  const now = Date.now();
  let refreshed = false;
  if (!cachedKeys.size || now >= cachedKeysExpireAt) {
    await refreshGoogleKeys(fetchImpl, importCertificate, timeoutMs);
    unknownKidRefreshAfter = Date.now() + UNKNOWN_KID_REFRESH_INTERVAL_MS;
    refreshed = true;
  }
  let key = cachedKeys.get(kid);
  if (!key && !refreshed && keyRefreshPromise) {
    await keyRefreshPromise;
    key = cachedKeys.get(kid);
  }
  if (!key && !refreshed && now >= unknownKidRefreshAfter) {
    await refreshGoogleKeys(fetchImpl, importCertificate, timeoutMs);
    unknownKidRefreshAfter = Date.now() + UNKNOWN_KID_REFRESH_INTERVAL_MS;
    key = cachedKeys.get(kid);
  }
  if (!key) throw authError('INVALID_FIREBASE_TOKEN');
  return key;
}

function firebaseProviders(claims) {
  const identities = claims?.firebase?.identities;
  const values = identities && typeof identities === 'object' ? Object.keys(identities) : [];
  const provider = claims?.firebase?.sign_in_provider;
  if (provider && provider !== 'custom') values.push(provider);
  return [...new Set(values
    .filter(value => value !== 'email')
    .filter(value => ['password', 'github.com'].includes(value)))];
}

function validateClaims(payload, projectId, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!payload || typeof payload !== 'object') throw authError('INVALID_FIREBASE_TOKEN');
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) throw authError('INVALID_FIREBASE_TOKEN');
  if (!Number.isInteger(payload.iat) || payload.iat <= 0 || payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
    throw authError('INVALID_FIREBASE_TOKEN');
  }
  if (!Number.isInteger(payload.auth_time) || payload.auth_time <= 0
    || payload.auth_time > payload.iat + CLOCK_TOLERANCE_SECONDS) {
    throw authError('INVALID_FIREBASE_TOKEN');
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) throw authError('TOKEN_EXPIRED');
  if (payload.exp <= payload.iat) throw authError('INVALID_FIREBASE_TOKEN');
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw authError('INVALID_FIREBASE_TOKEN');
  if (payload.email_verified !== true) throw authError('EMAIL_UNVERIFIED', 403);
  if (!payload.email || typeof payload.email !== 'string') throw authError('EMAIL_REQUIRED', 403);
  return payload;
}

export function firebaseAuthConfigured(env) {
  const projectId = String(env?.FIREBASE_PROJECT_ID || '').trim();
  return Boolean(projectId && !/^(?:REPLACE_WITH_|YOUR_|<)/i.test(projectId));
}

async function backendReadiness(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return { database: false, schema: false };
  }
  const cached = readinessCache.get(env.DB);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const promise = (async () => {
    try {
      const result = await env.DB.prepare(`
        SELECT 'users' AS table_name, name, pk FROM pragma_table_info('users')
        UNION ALL
        SELECT 'profiles' AS table_name, name, pk FROM pragma_table_info('profiles')
        UNION ALL
        SELECT 'profile_operations' AS table_name, name, pk FROM pragma_table_info('profile_operations')
      `).all();
      const columns = new Map();
      const primaryKeys = new Map();
      for (const row of result?.results || []) {
        const table = String(row?.table_name || '');
        if (!columns.has(table)) columns.set(table, new Set());
        columns.get(table).add(String(row?.name || ''));
        if (Number(row?.pk) > 0) primaryKeys.set(`${table}:${row.name}`, Number(row.pk));
      }
      const columnsReady = Object.entries(REQUIRED_SCHEMA).every(([table, required]) => (
        required.every(column => columns.get(table)?.has(column))
      ));
      if (!columnsReady) return { database: true, schema: false };

      let migrations;
      let indexes;
      let foreignKeys;
      try {
        [migrations, indexes, foreignKeys] = await Promise.all([
          env.DB.prepare('SELECT name FROM d1_migrations WHERE name = ?')
            .bind(REQUIRED_MIGRATION).all(),
          env.DB.prepare(`
            SELECT il.name AS index_name, il."unique" AS is_unique,
                   il.partial AS is_partial, ii.seqno AS column_position,
                   ii.name AS column_name
            FROM pragma_index_list('users') AS il
            JOIN pragma_index_info(il.name) AS ii
            ORDER BY il.name, ii.seqno
          `).all(),
          env.DB.prepare(`
            SELECT 'profiles' AS table_name, "table" AS parent_table, "from" AS child_column,
                   "to" AS parent_column, on_delete
            FROM pragma_foreign_key_list('profiles')
            UNION ALL
            SELECT 'profile_operations' AS table_name, "table" AS parent_table,
                   "from" AS child_column, "to" AS parent_column, on_delete
            FROM pragma_foreign_key_list('profile_operations')
          `).all(),
        ]);
      } catch {
        return { database: true, schema: false };
      }

      const primaryKeysReady = primaryKeys.get('users:id') === 1
        && primaryKeys.get('profiles:user_id') === 1
        && primaryKeys.get('profile_operations:user_id') === 1
        && primaryKeys.get('profile_operations:operation_id') === 2;
      const migrationReady = (migrations?.results || []).some(row => row.name === REQUIRED_MIGRATION);
      const indexesByName = new Map();
      for (const row of indexes?.results || []) {
        const name = String(row?.index_name || '');
        if (!name) continue;
        if (!indexesByName.has(name)) indexesByName.set(name, []);
        indexesByName.get(name).push(row);
      }
      const emailUnique = [...indexesByName.values()].some(rows => (
        rows.length === 1
        && Number(rows[0]?.is_unique) === 1
        && Number(rows[0]?.is_partial) === 0
        && Number(rows[0]?.column_position) === 0
        && rows[0]?.column_name === 'email'
      ));
      const cascadeReady = ['profiles', 'profile_operations'].every(table => (
        (foreignKeys?.results || []).some(row => (
          row?.table_name === table
          && row?.parent_table === 'users'
          && row?.child_column === 'user_id'
          && row?.parent_column === 'id'
          && String(row?.on_delete || '').toUpperCase() === 'CASCADE'
        ))
      ));
      const schema = primaryKeysReady && migrationReady && emailUnique && cascadeReady;
      return { database: true, schema };
    } catch {
      return { database: false, schema: false };
    }
  })();
  readinessCache.set(env.DB, { expiresAt: Date.now() + READINESS_CACHE_MS, value: promise });
  return promise;
}

export async function authConfig(env) {
  const firebase = firebaseAuthConfigured(env);
  const checks = await backendReadiness(env);
  const projectId = firebase ? String(env.FIREBASE_PROJECT_ID).trim() : '';
  return {
    primary: 'firebase',
    firebase,
    firebase_project_id: projectId,
    email_password: firebase,
    github: firebase,
    ready: firebase && checks.database && checks.schema,
    checks,
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
      : await firebaseKey(header.kid, options.fetchImpl, options.importCertificate);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: options.currentDate,
    });
    return validateClaims(payload, projectId, options.nowSeconds);
  } catch (error) {
    if (error?.code && ['EMAIL_UNVERIFIED', 'EMAIL_REQUIRED', 'FIREBASE_KEYS_UNAVAILABLE', 'TOKEN_EXPIRED'].includes(error.code)) throw error;
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
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          email_verified = 1,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          updated_at = CURRENT_TIMESTAMP
      `).bind(user.id, user.email, user.full_name, user.avatar_url),
      env.DB.prepare(`
        INSERT INTO profiles (user_id, profile_json) VALUES (?, '{}')
        ON CONFLICT(user_id) DO NOTHING
      `).bind(user.id),
    ]);
  } catch (error) {
    console.error('Firebase user bootstrap failed:', String(error?.message || error));
    if (/unique constraint failed.*users\.email|users\.email.*unique/i.test(String(error?.message || error))) {
      throw authError('FIREBASE_PROFILE_CONFLICT', 409);
    }
    throw authError('DATABASE_UNAVAILABLE', 503);
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
  firebaseKey,
  validateClaims,
  firebaseProviders,
  upsertFirebaseUser,
  backendReadiness,
  resetKeyCache() {
    cachedKeys = new Map();
    cachedKeysExpireAt = 0;
    keyRefreshPromise = null;
    keyRefreshRetryAt = 0;
    unknownKidRefreshAfter = 0;
  },
  resetReadinessCache() {
    readinessCache = new WeakMap();
  },
});
