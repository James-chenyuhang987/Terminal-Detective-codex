import {
  authConfig,
  logoutFirebase,
  readFirebaseSession,
} from './auth.js';
import {
  handleCurrentUser,
  handleProfileFunction,
} from './profile.js';
import { handleRunFunction } from './run.js';

const CORS_METHODS = 'GET, POST, OPTIONS';
const CORS_HEADERS = 'Authorization, Content-Type, Accept';
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.workers.dev https://*.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com",
  "worker-src 'self' blob:",
].join('; ');
const KNOWN_SERVER_ERRORS = new Set([
  'DATABASE_UNAVAILABLE',
  'FIREBASE_KEYS_UNAVAILABLE',
  'FIREBASE_NOT_CONFIGURED',
  'FIREBASE_PROFILE_CONFLICT',
  'PROFILE_DATA_CORRUPT',
  'RUN_DATA_CORRUPT',
]);

function securityHeaders(headers = new Headers(), request = null, { page = false } = {}) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  if (page) headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  if (request && new URL(request.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return headers;
}

function json(payload, status = 200) {
  const headers = securityHeaders(new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }));
  return new Response(JSON.stringify(payload), { status, headers });
}

function errorResponse(code, status = 400, detail = undefined, extra = {}) {
  return json({ error: code, code, ...(detail ? { detail } : {}), ...extra }, status);
}

function methodNotAllowed(...methods) {
  const response = errorResponse('METHOD_NOT_ALLOWED', 405);
  response.headers.set('Allow', methods.join(', '));
  return response;
}

function faultReference() {
  const value = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `TD-${String(value).replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase()}`;
}

function requestedOrigin(request, env) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return '';
  if (origin === new URL(request.url).origin) return origin;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) return origin;
  } catch {
    return null;
  }
  const allowed = String(env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return allowed.includes(origin.replace(/\/+$/, '')) ? origin : null;
}

function withApiHeaders(response, request, env) {
  const headers = securityHeaders(new Headers(response.headers), request);
  const origin = requestedOrigin(request, env);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function handlePreflight(request, env) {
  const origin = requestedOrigin(request, env);
  if (!origin) return withApiHeaders(errorResponse('CORS_ORIGIN_DENIED', 403), request, env);
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Allow-Headers': CORS_HEADERS,
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  return new Response(null, { status: 204, headers: securityHeaders(headers, request) });
}

function withPageHeaders(response, request) {
  const headers = securityHeaders(new Headers(response.headers), request, { page: true });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleNativeAuth(request, env, url) {
  if (url.pathname === '/api/auth/config') {
    return request.method === 'GET' ? json(await authConfig(env)) : methodNotAllowed('GET');
  }
  if (url.pathname === '/api/auth/logout') {
    return request.method === 'POST' ? logoutFirebase() : methodNotAllowed('POST');
  }
  if (url.pathname === '/api/auth/session') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const session = await readFirebaseSession(request, env);
    return session
      ? json({ authenticated: true, backend: 'firebase-cloudflare', user: session.user })
      : errorResponse('UNAUTHENTICATED', 401);
  }
  return null;
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const nativeAuth = await handleNativeAuth(request, env, url);
  if (nativeAuth) return nativeAuth;
  if (url.pathname === '/api/cloudflare/status') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const config = await authConfig(env);
    return json({
      ok: config.ready,
      service: 'terminal-detective-cloudflare',
      mode: 'firebase_cloudflare',
      rules: 'cloudflare',
      profile: 'cloudflare',
      checks: {
        firebase: config.firebase,
        database: config.checks.database,
        schema: config.checks.schema,
      },
    }, config.ready ? 200 : 503);
  }

  const appPrefix = `/api/apps/${encodeURIComponent(env.APP_ID)}`;
  const rulesPath = `${appPrefix}/functions/detectiveRules`;
  const currentUserPath = `${appPrefix}/entities/User/me`;
  const profilePath = `${appPrefix}/functions/playerProfile`;
  const runPath = `${appPrefix}/functions/playerRun`;
  if (url.pathname === rulesPath) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const session = await readFirebaseSession(request, env);
    if (!session) return errorResponse('UNAUTHENTICATED', 401);
    // A stateless payload cannot prove that evidence was earned. Both paid
    // content versions now use playerRun; their private reducers remain intact.
    return errorResponse('STATELESS_RULES_RETIRED', 410,
      'Use the paid playerRun endpoint to read options and submit investigation commands.',
      { authoritative_endpoint: runPath });
  }
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === currentUserPath) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const session = await readFirebaseSession(request, env);
      return session
        ? handleCurrentUser(request, env, session)
        : errorResponse('UNAUTHENTICATED', 401);
    }
    if (url.pathname === runPath) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const session = await readFirebaseSession(request, env);
      return session ? handleRunFunction(request, env, session) : errorResponse('UNAUTHENTICATED', 401);
    }
    if (url.pathname === profilePath) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const session = await readFirebaseSession(request, env);
      return session
        ? handleProfileFunction(request, env, session)
        : errorResponse('UNAUTHENTICATED', 401);
    }
    if (url.pathname === `${appPrefix}/auth/logout`) {
      return request.method === 'POST' ? logoutFirebase() : methodNotAllowed('POST');
    }
    return errorResponse('ROUTE_NOT_FOUND', 404);
  }
  return env.ASSETS.fetch(request);
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    return handlePreflight(request, env);
  }
  const response = await routeRequest(request, env);
  return url.pathname.startsWith('/api/')
    ? withApiHeaders(response, request, env)
    : withPageHeaders(response, request);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const status = Number(error?.status) || 500;
      const candidate = String(error?.code || '');
      const known = status < 500 || KNOWN_SERVER_ERRORS.has(candidate);
      const code = known
        ? (candidate || (status === 413 ? 'PAYLOAD_TOO_LARGE' : 'GATEWAY_FAILED'))
        : 'GATEWAY_FAILED';
      const reference = status >= 500 ? faultReference() : '';
      if (reference) console.error(`[${reference}] Worker request failed:`, error);
      const response = errorResponse(code, status, undefined, reference ? { fault_reference: reference } : {});
      return new URL(request.url).pathname.startsWith('/api/')
        ? withApiHeaders(response, request, env)
        : withPageHeaders(response, request);
    }
  },
};
