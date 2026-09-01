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

function errorResponse(code, status = 400, detail = undefined) {
  return json({ error: code, code, ...(detail ? { detail } : {}) }, status);
}

async function readBody(request, maxBytes) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
  return body;
}

async function handleRules(request) {
  if (request.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 405);
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
    const code = String(error?.code || error?.message || 'RULE_FAILED');
    const status = code.startsWith('INVALID_') || code.startsWith('UNKNOWN_') ? 400 : 422;
    return errorResponse(code, status);
  }
}

async function handleNativeAuth(request, env, url) {
  if (url.pathname === '/api/auth/config') return json(authConfig(env));
  if (url.pathname === '/api/auth/logout') return logoutFirebase();
  if (url.pathname === '/api/auth/session') {
    const session = await readFirebaseSession(request, env);
    return session
      ? json({ authenticated: true, backend: 'firebase-cloudflare', user: session.user })
      : errorResponse('UNAUTHENTICATED', 401);
  }
  return null;
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const nativeAuth = await handleNativeAuth(request, env, url);
  if (nativeAuth) return nativeAuth;
  if (url.pathname === '/api/cloudflare/status') {
    return json({
      ok: true,
      service: 'terminal-detective-cloudflare',
      mode: 'firebase_cloudflare',
      rules: 'cloudflare',
      profile: 'cloudflare',
    });
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
    if (url.pathname === `${appPrefix}/auth/logout`) return logoutFirebase();
    return errorResponse('ROUTE_NOT_FOUND', 404);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const status = Number(error?.status) || 500;
      const code = String(error?.code || (status === 413 ? 'PAYLOAD_TOO_LARGE' : 'GATEWAY_FAILED'));
      return errorResponse(code, status);
    }
  },
};
