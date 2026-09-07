import { authoritativeProfile, plainObject, exactKeys } from '../../server/gameAuthority/profileCommands.js';
import { readBodyText } from './body.js';

export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_PROFILE_BYTES = 512 * 1024;
export const MAX_RUN_BYTES = 512 * 1024;

export function json(payload, status = 200, headers = {}) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
export function error(code, message, status = 400, extra = {}, headers = {}) {
  return json({ error: code, code, message, ...extra }, status, headers);
}
export function validId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
export function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
export function parseObject(value, code = 'PROFILE_DATA_CORRUPT') {
  try {
    const parsed = JSON.parse(value || '{}');
    if (plainObject(parsed)) return parsed;
  } catch { /* Never turn corrupt persistent state into free initialization. */ }
  throw Object.assign(new Error(code), { code, status: 500 });
}
export async function readEnvelope(request, run = false) {
  const raw = await readBodyText(request, MAX_BODY_BYTES, 'INVALID_COMMAND');
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Invalid JSON.'), { code: 'INVALID_COMMAND', status: 400 }); }
  if (body?.action === 'patch') throw Object.assign(new Error('Client profile patches are disabled.'), { code: 'PROFILE_AUTHORITY_REQUIRED', status: 400 });
  exactKeys(body, ['action', 'session_id', ...(run ? ['run_id'] : []), 'operation_id', 'expected_revision', 'command'], ['action', 'session_id']);
  if (!validId(body.session_id) || (run && !validId(body.run_id))) {
    throw Object.assign(new Error('Invalid session or run id.'), { code: 'INVALID_COMMAND', status: 400 });
  }
  if (body.action === 'command' && (!validId(body.operation_id) || !validRevision(body.expected_revision))) {
    throw Object.assign(new Error('Invalid operation id or revision.'), { code: 'INVALID_COMMAND', status: 400 });
  }
  return body;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return plainObject(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
export async function commandHash(command) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(command)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function serialize(value, max = MAX_PROFILE_BYTES) {
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > max) {
    throw Object.assign(new Error('State exceeds storage limit.'), { code: 'STATE_TOO_LARGE', status: 413 });
  }
  return serialized;
}
export async function readProfileRow(env, userId, now = new Date()) {
  await env.DB.prepare(`INSERT INTO profiles (user_id, profile_json) VALUES (?, '{}') ON CONFLICT(user_id) DO NOTHING`).bind(userId).run();
  let row = await env.DB.prepare(`SELECT profile_json, profile_revision, active_session_id, authority_version FROM profiles WHERE user_id = ?`).bind(userId).first();
  if (!row) throw Object.assign(new Error('Missing profile.'), { code: 'DATABASE_UNAVAILABLE', status: 503 });
  if (Number(row.authority_version) !== 1) {
    const profile = authoritativeProfile(parseObject(row.profile_json), now);
    await env.DB.prepare(`UPDATE profiles SET profile_json = ?, authority_version = 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND authority_version = 0 AND profile_revision = ? AND profile_json = ?`)
      .bind(serialize(profile), userId, row.profile_revision, row.profile_json).run();
    row = await env.DB.prepare(`SELECT profile_json, profile_revision, active_session_id, authority_version FROM profiles WHERE user_id = ?`).bind(userId).first();
    if (Number(row?.authority_version) !== 1) throw Object.assign(new Error('Profile initialization failed.'), { code: 'DATABASE_UNAVAILABLE', status: 503 });
  }
  return row;
}
export function profilePayload(row, now = new Date()) {
  return { ...authoritativeProfile(parseObject(row.profile_json), now), profile_revision: Number(row.profile_revision), active_session_id: row.active_session_id || '' };
}
export async function readRunRow(env, userId, runId) {
  return env.DB.prepare(`SELECT id, user_id, run_json, run_revision, settled, start_operation_id FROM player_runs WHERE user_id = ? AND id = ?`).bind(userId, runId).first();
}
export async function readActiveRunRow(env, userId) {
  return env.DB.prepare(`SELECT id, user_id, run_json, run_revision, settled, start_operation_id FROM player_runs WHERE user_id = ? AND settled = 0`).bind(userId).first();
}
export function storedRun(row) {
  return { ...parseObject(row.run_json, 'RUN_DATA_CORRUPT'), id: row.id, revision: Number(row.run_revision), ...(row.settled ? { status: 'settled' } : {}) };
}
export async function readProfileOperation(env, userId, operationId) {
  return env.DB.prepare(`SELECT base_revision, result_revision, patch_hash, result_json FROM profile_operations WHERE user_id = ? AND operation_id = ?`).bind(userId, operationId).first();
}
export function matchingOperation(prior, expected, hash, hashKey = 'patch_hash') {
  return prior[hashKey] === hash && Number(prior.base_revision) === expected && Number(prior.result_revision) === expected + 1 && typeof prior.result_json === 'string';
}
