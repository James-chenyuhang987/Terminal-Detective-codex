const SESSION_COOKIE = 'td_session';
const OAUTH_STATE_COOKIE = 'td_oauth_state';
const OAUTH_VERIFIER_COOKIE = 'td_oauth_verifier';
const OAUTH_RETURN_COOKIE = 'td_oauth_return';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return base64Url(new Uint8Array(digest));
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.get('cookie') || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf('=');
      return index < 0
        ? [decodeURIComponent(part), '']
        : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
    }));
}

function cookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false) parts.push('Secure');
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join('; ');
}

function clearCookie(name) {
  return cookie(name, '', { maxAge: 0 });
}

function safeReturnPath(value) {
  const candidate = String(value || '/').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '/';
  try {
    const parsed = new URL(candidate, 'https://local.invalid');
    return parsed.origin === 'https://local.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/';
  } catch {
    return '/';
  }
}

function redirectWithCookies(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  cookies.forEach(value => headers.append('Set-Cookie', value));
  return new Response(null, { status: 302, headers });
}

function oauthFailure(url, code, cookies = []) {
  const target = new URL('/', url.origin);
  target.searchParams.set('auth_error', code);
  return redirectWithCookies(target.toString(), cookies);
}

function userPayload(row) {
  return {
    id: row.user_id || row.id,
    email: row.email,
    full_name: row.display_name || row.github_login || String(row.email || '').split('@')[0],
    avatar_url: row.avatar_url || null,
    auth_provider: 'github',
  };
}

export function githubAuthConfigured(env) {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
}

export function authConfig(env) {
  return {
    primary: 'github',
    github: githubAuthConfigured(env),
  };
}

export async function readCloudflareSession(request, env) {
  if (!env.DB) return null;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT sessions.id AS session_id, sessions.user_id, sessions.expires_at,
           users.email, users.display_name, users.avatar_url,
           oauth_accounts.provider_login AS github_login
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    LEFT JOIN oauth_accounts
      ON oauth_accounts.user_id = users.id AND oauth_accounts.provider = 'github'
    WHERE sessions.token_hash = ?
  `).bind(tokenHash).first();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.session_id).run();
    return null;
  }
  env.DB.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(row.session_id).run().catch(() => {});
  return { ...row, user: userPayload(row) };
}

export async function beginGithubOAuth(request, env) {
  const url = new URL(request.url);
  if (!githubAuthConfigured(env)) return oauthFailure(url, 'oauth_not_configured');
  const state = randomToken(32);
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  const returnTo = safeReturnPath(url.searchParams.get('return_to'));
  const callbackUrl = `${url.origin}/api/auth/github/callback`;
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', callbackUrl);
  authorize.searchParams.set('scope', 'read:user user:email');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('prompt', 'select_account');
  return redirectWithCookies(authorize.toString(), [
    cookie(OAUTH_STATE_COOKIE, state, { maxAge: 600 }),
    cookie(OAUTH_VERIFIER_COOKIE, verifier, { maxAge: 600 }),
    cookie(OAUTH_RETURN_COOKIE, returnTo, { maxAge: 600 }),
  ]);
}

async function githubJson(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Terminal-Detective-Cloudflare',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}`);
  return response.json();
}

async function resolveVerifiedEmail(accessToken, githubUser) {
  const emails = await githubJson('https://api.github.com/user/emails', accessToken);
  if (!Array.isArray(emails)) return null;
  const primary = emails.find(item => item?.primary && item?.verified && item?.email);
  const verified = primary || emails.find(item => item?.verified && item?.email);
  if (verified?.email) return String(verified.email).trim().toLowerCase();
  const publicEmail = String(githubUser?.email || '').trim().toLowerCase();
  return publicEmail || null;
}

async function upsertGithubUser(env, githubUser, email) {
  const providerId = String(githubUser.id);
  let account = await env.DB.prepare(`
    SELECT users.id AS user_id, users.email, users.display_name, users.avatar_url,
           oauth_accounts.provider_login AS github_login
    FROM oauth_accounts JOIN users ON users.id = oauth_accounts.user_id
    WHERE oauth_accounts.provider = 'github' AND oauth_accounts.provider_user_id = ?
  `).bind(providerId).first();
  let userId = account?.user_id;

  if (!userId) {
    const byEmail = await env.DB.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
      .bind(email).first();
    userId = byEmail?.id || crypto.randomUUID();
    if (!byEmail) {
      await env.DB.prepare(`
        INSERT INTO users (id, email, email_verified, display_name, avatar_url)
        VALUES (?, ?, 1, ?, ?)
      `).bind(userId, email, githubUser.name || githubUser.login, githubUser.avatar_url || null).run();
    }
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO oauth_accounts
        (provider, provider_user_id, user_id, provider_login, avatar_url, updated_at)
      VALUES ('github', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        provider_login = excluded.provider_login,
        avatar_url = excluded.avatar_url,
        updated_at = CURRENT_TIMESTAMP
    `).bind(providerId, userId, githubUser.login || '', githubUser.avatar_url || null),
    env.DB.prepare(`
      UPDATE users SET display_name = ?, avatar_url = ?, email_verified = 1,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(githubUser.name || githubUser.login, githubUser.avatar_url || null, userId),
    env.DB.prepare(`
      INSERT INTO profiles (user_id, profile_json) VALUES (?, '{}')
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId),
  ]);

  account = await env.DB.prepare(`
    SELECT users.id AS user_id, users.email, users.display_name, users.avatar_url,
           oauth_accounts.provider_login AS github_login
    FROM users LEFT JOIN oauth_accounts
      ON oauth_accounts.user_id = users.id AND oauth_accounts.provider = 'github'
    WHERE users.id = ?
  `).bind(userId).first();
  return account;
}

async function createSession(env, userId) {
  const id = crypto.randomUUID();
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'),
    env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)
    `).bind(id, userId, tokenHash, expiresAt),
  ]);
  return token;
}

export async function completeGithubOAuth(request, env) {
  const url = new URL(request.url);
  const cleared = [
    clearCookie(OAUTH_STATE_COOKIE),
    clearCookie(OAUTH_VERIFIER_COOKIE),
    clearCookie(OAUTH_RETURN_COOKIE),
  ];
  if (!githubAuthConfigured(env)) return oauthFailure(url, 'oauth_not_configured', cleared);
  if (url.searchParams.get('error')) return oauthFailure(url, 'oauth_cancelled', cleared);
  const cookies = parseCookies(request);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (!state || state !== cookies[OAUTH_STATE_COOKIE] || !code || !cookies[OAUTH_VERIFIER_COOKIE]) {
    return oauthFailure(url, 'oauth_state_invalid', cleared);
  }

  try {
    const callbackUrl = `${url.origin}/api/auth/github/callback`;
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Terminal-Detective-Cloudflare' },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl,
        code_verifier: cookies[OAUTH_VERIFIER_COOKIE],
      }),
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error || 'TOKEN_EXCHANGE_FAILED');

    const githubUser = await githubJson('https://api.github.com/user', tokenPayload.access_token);
    if (!githubUser?.id) throw new Error('GITHUB_IDENTITY_MISSING');
    const email = await resolveVerifiedEmail(tokenPayload.access_token, githubUser);
    if (!email) return oauthFailure(url, 'github_email_required', cleared);
    const user = await upsertGithubUser(env, githubUser, email);
    const sessionToken = await createSession(env, user.user_id);
    const target = new URL(safeReturnPath(cookies[OAUTH_RETURN_COOKIE]), url.origin);
    target.searchParams.set('auth', 'success');
    return redirectWithCookies(target.toString(), [
      ...cleared,
      cookie(SESSION_COOKIE, sessionToken, { maxAge: SESSION_TTL_SECONDS }),
    ]);
  } catch (error) {
    console.error('GitHub OAuth callback failed:', String(error?.message || error));
    return oauthFailure(url, 'oauth_failed', cleared);
  }
}

export async function logoutCloudflare(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token && env.DB) {
    const tokenHash = await sha256(token);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', clearCookie(SESSION_COOKIE));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export const authInternals = Object.freeze({ safeReturnPath, parseCookies, cookie });
