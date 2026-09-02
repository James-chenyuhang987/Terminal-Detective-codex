import { runDetectiveRule } from '../../server/detectiveRules/rules.js';
import {
  authConfig,
  logoutFirebase,
  readFirebaseSession,
} from './auth.js';
import {
  handleCurrentUser,
  handleProfileFunction,
} from './profile.js';
import { validateRuleEnvelope } from './requestSecurity.js';

const RULE_BODY_LIMIT = 96 * 1024;
const CORS_METHODS = 'GET, POST, OPTIONS';
const CORS_HEADERS = 'Authorization, Content-Type, Accept, X-Profile-Owner';
const KNOWN_SERVER_ERRORS = new Set([
  'DATABASE_UNAVAILABLE',
  'FIREBASE_KEYS_UNAVAILABLE',
  'FIREBASE_NOT_CONFIGURED',
  'FIREBASE_PROFILE_CONFLICT',
  'PROFILE_DATA_CORRUPT',
]);
const PUBLIC_RULE_ERRORS = new Set([
  'INVALID_CLUES',
  'INVALID_EVIDENCE',
  'INVALID_QUESTION',
  'INVALID_REPORT_OPTION',
  'INVALID_TEAM',
  'QUESTION_LOCKED',
  'STALE_OPTIONS',
  'UNKNOWN_CASE',
  'UNKNOWN_NPC',
  'UNKNOWN_TASK',
]);

function securityHeaders(headers = new Headers()) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
  const headers = securityHeaders(new Headers(response.headers));
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
  return new Response(null, { status: 204, headers: securityHeaders(headers) });
}

async function readBody(request, maxBytes) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
  return body;
}

async function handleRules(request) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const raw = await readBody(request, RULE_BODY_LIMIT);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(raw) || '{}');
  } catch {
    return errorResponse('INVALID_JSON', 400);
  }

  const envelope = validateRuleEnvelope(body);
  if (envelope.error) return errorResponse(envelope.error, 400);
  try {
    return json({
      data: runDetectiveRule(envelope.task, envelope.payload),
      source: 'cloudflare-rules',
    });
  } catch (error) {
    const code = String(error?.code || '');
    if (!PUBLIC_RULE_ERRORS.has(code)) throw error;
    const status = code.startsWith('INVALID_') || code.startsWith('UNKNOWN_') ? 400 : 422;
    return errorResponse(code, status);
  }
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

  const rulesPath = `/api/apps/${encodeURIComponent(env.APP_ID)}/functions/detectiveRules`;
  if (url.pathname === rulesPath) {
    const session = await readFirebaseSession(request, env);
    return session ? handleRules(request) : errorResponse('UNAUTHENTICATED', 401);
  }
  if (url.pathname.startsWith('/api/')) {
    const session = await readFirebaseSession(request, env);
    const appPrefix = `/api/apps/${encodeURIComponent(env.APP_ID)}`;
    const currentUserPath = `${appPrefix}/entities/User/me`;
    const profilePath = `${appPrefix}/functions/playerProfile`;
    if (url.pathname === currentUserPath) {
      return session
        ? handleCurrentUser(request, env, session)
        : errorResponse('UNAUTHENTICATED', 401);
    }
    if (url.pathname === profilePath) {
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
  return url.pathname.startsWith('/api/') ? withApiHeaders(response, request, env) : response;
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
        : response;
    }
  },
};
