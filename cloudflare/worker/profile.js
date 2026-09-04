import { readBodyText } from './body.js';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_PROFILE_BYTES = 512 * 1024;
const PROFILE_VALUE_LIMITS = Object.freeze({
  depth: 12,
  arrayLength: 4096,
  objectKeys: 512,
  stringLength: 8192,
});
const DANGEROUS_OBJECT_KEYS = new Set([
  '__proto__', 'prototype', 'constructor',
  'userId', 'user_id', 'ownerId', 'owner_id', 'accountId', 'account_id',
  'firebaseUid', 'firebase_uid', 'isAdmin', 'is_admin',
]);
const PROFILE_FIELDS = new Set([
  'detective_name', 'avatar', 'signature', 'identity_badge', 'detective_tags',
  'level', 'xp', 'rank_title', 'energy', 'energy_updated_at', 'diamonds', 'gold',
  'last_checkin', 'checkin_streak', 'checkin_history', 'achievements', 'solved_cases',
  'unsolved_count', 'rename_count', 'inventory', 'equipped_items', 'tech_unlocks',
  'case_records', 'activity_stats', 'reward_claims', 'journey_started_on',
  'mail_read_ids', 'mail_reply_choices', 'rewarded_runs', 'weekly_records',
  'agent_progression', 'skill_loadout', 'saved_team_config', 'home_progress_version',
]);

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function error(code, message, status = 400, extra = {}, headers = {}) {
  return json({ error: code, code, message, ...extra }, status, headers);
}

function validSessionId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validOperationId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeProfileValue(value, depth = 0) {
  if (depth > PROFILE_VALUE_LIMITS.depth) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= PROFILE_VALUE_LIMITS.stringLength;
  if (Array.isArray(value)) {
    return value.length <= PROFILE_VALUE_LIMITS.arrayLength
      && value.every(item => safeProfileValue(item, depth + 1));
  }
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length <= PROFILE_VALUE_LIMITS.objectKeys
    && keys.every(key => key.length <= 80
      && !DANGEROUS_OBJECT_KEYS.has(key)
      && safeProfileValue(value[key], depth + 1));
}

function cleanPatch(value) {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (!keys.length || keys.some(key => !PROFILE_FIELDS.has(key) || !safeProfileValue(value[key]))) return null;
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

function parseProfile(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    if (isPlainObject(parsed)) return parsed;
  } catch {
    // The stable error below prevents a malformed D1 value from being
    // normalized into an empty profile and written back over player data.
  }
  throw Object.assign(new Error('PROFILE_DATA_CORRUPT'), {
    code: 'PROFILE_DATA_CORRUPT',
    status: 500,
  });
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

async function patchHash(patch) {
  const bytes = new TextEncoder().encode(JSON.stringify(patch));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function readProfileOperation(env, userId, operationId) {
  return env.DB.prepare(`
    SELECT base_revision, result_revision, patch_hash
    FROM profile_operations WHERE user_id = ? AND operation_id = ?
  `).bind(userId, operationId).first();
}

function successPayload(row, session, operationId = '', replayed = false) {
  return {
    profile: profilePayload(row),
    account: accountFromSession(session),
    backend: 'cloudflare',
    ...(operationId ? { operation_id: operationId, replayed } : {}),
  };
}

export async function handleProfileFunction(request, env, session) {
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'POST is required.', 405, {}, { Allow: 'POST' });
  let raw;
  try {
    raw = await readBodyText(request, MAX_BODY_BYTES, 'INVALID_PATCH');
  } catch (cause) {
    if (cause?.status === 413) return error('INVALID_PATCH', 'Request body is too large.', 413);
    throw cause;
  }
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return error('INVALID_PATCH', 'Invalid JSON body.'); }
  if (!validSessionId(body?.session_id)) return error('INVALID_PATCH', 'Invalid session id.');

  const row = await readProfileRow(env, session.user_id);
  const revision = Math.max(0, Number(row?.profile_revision) || 0);
  if (body.action === 'claim_session') {
    await env.DB.prepare(`
      UPDATE profiles SET active_session_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(body.session_id, session.user_id).run();
    const updated = await readProfileRow(env, session.user_id);
    return json(successPayload(updated, session));
  }

  if (row?.active_session_id !== body.session_id) {
    return error('SESSION_TAKEN', 'This account is active on another device.', 409, { profile_revision: revision });
  }
  if (body.action === 'status') {
    return json(successPayload(row, session));
  }
  if (body.action !== 'patch') return error('INVALID_PATCH', 'Unknown action.');
  if (!validOperationId(body.operation_id)) return error('INVALID_OPERATION_ID', 'Invalid operation id.');
  if (!validRevision(body.expected_revision)) return error('INVALID_PATCH', 'Invalid expected revision.');
  const expected = body.expected_revision;
  const patch = cleanPatch(body.patch);
  if (!patch) return error('INVALID_PATCH', 'Patch contains unsupported fields.');
  const hash = await patchHash(patch);
  const prior = await readProfileOperation(env, session.user_id, body.operation_id);
  if (prior) {
    if (prior.patch_hash !== hash
      || Number(prior.base_revision) !== expected
      || Number(prior.result_revision) !== expected + 1) {
      return error('OPERATION_ID_REUSED', 'Operation id was already used for a different profile operation.', 409);
    }
    const replayRow = await readProfileRow(env, session.user_id);
    if ((Number(replayRow?.profile_revision) || 0) < (Number(prior.result_revision) || 0)) {
      return error('DATABASE_UNAVAILABLE', 'The profile operation is still being committed.', 503);
    }
    return json(successPayload(replayRow, session, body.operation_id, true));
  }
  if (expected !== revision) {
    return error('STALE_PROFILE', 'Profile revision is stale.', 409, {
      profile: profilePayload(row), profile_revision: revision,
    });
  }
  const merged = { ...parseProfile(row.profile_json), ...patch };
  const serialized = JSON.stringify(merged);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROFILE_BYTES) {
    return error('PROFILE_TOO_LARGE', 'The merged profile exceeds the storage limit.', 413);
  }
  const results = await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO profile_operations (
        user_id, operation_id, base_revision, result_revision, patch_hash
      )
      SELECT ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM profiles
        WHERE user_id = ? AND profile_revision = ? AND active_session_id = ?
      )
    `).bind(
      session.user_id, body.operation_id, revision, revision + 1, hash,
      session.user_id, revision, body.session_id,
    ),
    env.DB.prepare(`
      UPDATE profiles SET profile_json = ?, profile_revision = profile_revision + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND profile_revision = ? AND active_session_id = ?
        AND EXISTS (
          SELECT 1 FROM profile_operations
          WHERE user_id = ? AND operation_id = ? AND base_revision = ? AND result_revision = ?
           AND patch_hash = ?
        )
    `).bind(
      serialized, session.user_id, revision, body.session_id,
      session.user_id, body.operation_id, revision, revision + 1, hash,
    ),
  ]);
  if (!results?.[1]?.meta?.changes) {
    const duplicate = await readProfileOperation(env, session.user_id, body.operation_id);
    const current = await readProfileRow(env, session.user_id);
    if (duplicate) {
      if (duplicate.patch_hash !== hash
        || Number(duplicate.base_revision) !== expected
        || Number(duplicate.result_revision) !== expected + 1) {
        return error('OPERATION_ID_REUSED', 'Operation id was already used for a different profile operation.', 409);
      }
      if ((Number(current?.profile_revision) || 0) < (Number(duplicate.result_revision) || 0)) {
        return error('DATABASE_UNAVAILABLE', 'The profile operation is still being committed.', 503);
      }
      return json(successPayload(current, session, body.operation_id, true));
    }
    if (current?.active_session_id !== body.session_id) {
      return error('SESSION_TAKEN', 'This account is active on another device.', 409, {
        profile_revision: Number(current?.profile_revision) || 0,
      });
    }
    return error('STALE_PROFILE', 'Profile revision changed during save.', 409, {
      profile: profilePayload(current), profile_revision: Number(current?.profile_revision) || 0,
    });
  }
  const updated = await readProfileRow(env, session.user_id);
  if ((Number(updated?.profile_revision) || 0) < revision + 1) {
    return error('DATABASE_UNAVAILABLE', 'The profile operation is still being committed.', 503);
  }
  return json(successPayload(updated, session, body.operation_id));
}

export async function handleCurrentUser(request, env, session) {
  if (request.method === 'GET') {
    const row = await readProfileRow(env, session.user_id);
    return json({ ...session.user, ...profilePayload(row) });
  }
  return error('METHOD_NOT_ALLOWED', 'GET is required.', 405, {}, { Allow: 'GET' });
}

export const profileInternals = Object.freeze({
  cleanPatch,
  validOperationId,
  validRevision,
  validSessionId,
  parseProfile,
  patchHash,
  safeProfileValue,
  PROFILE_VALUE_LIMITS,
  MAX_PROFILE_BYTES,
});
