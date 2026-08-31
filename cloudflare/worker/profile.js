const MAX_BODY_BYTES = 512 * 1024;
const PROFILE_FIELDS = new Set([
  'detective_name', 'avatar', 'signature', 'identity_badge', 'detective_tags',
  'level', 'xp', 'rank_title', 'energy', 'energy_updated_at', 'diamonds', 'gold',
  'last_checkin', 'checkin_streak', 'checkin_history', 'achievements', 'solved_cases',
  'unsolved_count', 'rename_count', 'inventory', 'equipped_items', 'tech_unlocks',
  'case_records', 'activity_stats', 'reward_claims', 'journey_started_on',
  'mail_read_ids', 'mail_reply_choices', 'rewarded_runs', 'weekly_records',
  'agent_progression', 'skill_loadout', 'saved_team_config', 'home_progress_version',
]);

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function error(code, message, status = 400, extra = {}) {
  return json({ error: code, code, message, ...extra }, status);
}

function validSessionId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

function cleanPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some(key => !PROFILE_FIELDS.has(key))) return null;
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

function parseProfile(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function accountFromSession(session) {
  return session.user;
}

async function readProfileRow(env, userId) {
  await env.DB.prepare(`
    INSERT INTO profiles (user_id, profile_json) VALUES (?, '{}')
    ON CONFLICT(user_id) DO NOTHING
  `).bind(userId).run();
  return env.DB.prepare(`
    SELECT profile_json, profile_revision, active_session_id
    FROM profiles WHERE user_id = ?
  `).bind(userId).first();
}

function profilePayload(row) {
  return {
    ...parseProfile(row?.profile_json),
    profile_revision: Math.max(0, Number(row?.profile_revision) || 0),
    active_session_id: row?.active_session_id || '',
  };
}

export async function handleProfileFunction(request, env, session) {
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'POST is required.', 405);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) return error('INVALID_PATCH', 'Request body is too large.', 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return error('INVALID_PATCH', 'Request body is too large.', 413);
  }
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return error('INVALID_PATCH', 'Invalid JSON body.'); }
  if (!validSessionId(body?.session_id)) return error('INVALID_PATCH', 'Invalid session id.');

  const row = await readProfileRow(env, session.user_id);
  const revision = Math.max(0, Number(row?.profile_revision) || 0);
  if (body.action === 'claim_session') {
    await env.DB.prepare(`
      UPDATE profiles SET active_session_id = ?, profile_revision = profile_revision + 1,
        updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).bind(body.session_id, session.user_id).run();
    const updated = await readProfileRow(env, session.user_id);
    return json({ profile: profilePayload(updated), account: accountFromSession(session), backend: 'cloudflare' });
  }

  if (row?.active_session_id !== body.session_id) {
    return error('SESSION_TAKEN', 'This account is active on another device.', 409, { profile_revision: revision });
  }
  if (body.action === 'status') {
    return json({ profile: profilePayload(row), account: accountFromSession(session), backend: 'cloudflare' });
  }
  if (body.action !== 'patch') return error('INVALID_PATCH', 'Unknown action.');
  const expected = Math.max(0, Math.floor(Number(body.expected_revision) || 0));
  if (expected !== revision) {
    return error('STALE_PROFILE', 'Profile revision is stale.', 409, {
      profile: profilePayload(row), profile_revision: revision,
    });
  }
  const patch = cleanPatch(body.patch);
  if (!patch) return error('INVALID_PATCH', 'Patch contains unsupported fields.');
  const merged = { ...parseProfile(row.profile_json), ...patch };
  const result = await env.DB.prepare(`
    UPDATE profiles SET profile_json = ?, profile_revision = profile_revision + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND profile_revision = ? AND active_session_id = ?
  `).bind(JSON.stringify(merged), session.user_id, revision, body.session_id).run();
  if (!result?.meta?.changes) {
    const current = await readProfileRow(env, session.user_id);
    return error('STALE_PROFILE', 'Profile revision changed during save.', 409, {
      profile: profilePayload(current), profile_revision: Number(current?.profile_revision) || 0,
    });
  }
  const updated = await readProfileRow(env, session.user_id);
  return json({ profile: profilePayload(updated), account: accountFromSession(session), backend: 'cloudflare' });
}

export async function handleCurrentUser(request, env, session) {
  if (request.method === 'GET') {
    const row = await readProfileRow(env, session.user_id);
    return json({ ...session.user, ...profilePayload(row) });
  }
  return error('METHOD_NOT_ALLOWED', 'GET is required.', 405);
}

export const profileInternals = Object.freeze({ cleanPatch, validSessionId, parseProfile });
