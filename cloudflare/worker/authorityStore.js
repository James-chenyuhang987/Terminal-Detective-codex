import { authoritativeProfile, plainObject, exactKeys, invalidCommand } from '../../server/gameAuthority/profileCommands.js';
import { readBodyText } from './body.js';

export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_PROFILE_BYTES = 512 * 1024;
export const MAX_RUN_BYTES = 512 * 1024;
export const SAVE_LIBRARY_LIMIT = 20;
const MAX_ENVELOPE_DEPTH = 16;

function validateEnvelopeDepth(body) {
  // A small JSON body can still contain thousands of nested arrays. Check it
  // without recursion before command hashing or any command-specific reducer.
  const pending = [{ value: body, depth: 0 }];
  while (pending.length) {
    const { value, depth } = pending.pop();
    if (depth > MAX_ENVELOPE_DEPTH) throw invalidCommand('Command exceeds the nesting limit.');
    if (!value || typeof value !== 'object') continue;
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') pending.push({ value: child, depth: depth + 1 });
    }
  }
}

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
  validateEnvelopeDepth(body);
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
    const raw = parseObject(row.profile_json);
    // A pre-library profile has one paid run at most. Preserve that selection
    // before normalization adds the new nullable pointer.
    const legacy = Object.hasOwn(raw, 'active_run_id') ? null : await readLegacyActiveRunRow(env, userId);
    const profile = authoritativeProfile({ ...raw, active_run_id: raw.active_run_id ?? legacy?.id ?? null }, now);
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
  return env.DB.prepare(`SELECT id, user_id, run_json, run_revision, settled, start_operation_id, created_at, updated_at
    FROM player_runs WHERE user_id = ? AND id = ?`).bind(userId, runId).first();
}
async function readLegacyActiveRunRow(env, userId) {
  return env.DB.prepare(`SELECT id, user_id, run_json, run_revision, settled, start_operation_id, created_at, updated_at
    FROM player_runs WHERE user_id = ? AND settled = 0
    ORDER BY julianday(updated_at) DESC, julianday(created_at) DESC, id DESC LIMIT 1`)
    .bind(userId).first();
}
export async function readActiveRunRow(env, userId, profileRow) {
  const row = profileRow || await readProfileRow(env, userId);
  const raw = parseObject(row.profile_json);
  if (!Object.hasOwn(raw, 'active_run_id')) return readLegacyActiveRunRow(env, userId);
  if (!validId(raw.active_run_id)) return null;
  const run = await readRunRow(env, userId, raw.active_run_id);
  return run && !run.settled ? run : null;
}
export async function countUnsettledRuns(env, userId) {
  const row = await env.DB.prepare(`SELECT count(*) AS count FROM player_runs WHERE user_id = ? AND settled = 0`)
    .bind(userId).first();
  return Number(row?.count) || 0;
}
function isoTimestamp(value) {
  const text = typeof value === 'string' ? value : '';
  // SQLite CURRENT_TIMESTAMP values are UTC even though they omit a suffix.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const time = new Date(normalized);
  if (!Number.isFinite(time.getTime())) throw Object.assign(new Error('Invalid run timestamp.'), { code: 'RUN_DATA_CORRUPT', status: 500 });
  return time.toISOString();
}
export async function runLibrary(env, userId, selectedId = null) {
  // Project a fixed public summary in SQL: never load or return all private
  // case snapshots just to render the save picker.
  // Validate the JSON envelope before using SQLite JSON functions. A damaged
  // historical save must fail closed with a stable, actionable error instead
  // of surfacing a generic gateway failure (or being silently omitted).
  const invalid = await env.DB.prepare(`
    SELECT 1 AS invalid FROM player_runs
    WHERE user_id = ? AND (json_valid(run_json) = 0 OR json_type(run_json) <> 'object')
    LIMIT 1
  `).bind(userId).first();
  if (invalid) throw Object.assign(new Error('Run data is corrupt.'), { code: 'RUN_DATA_CORRUPT', status: 500 });
  const columns = `id, run_revision, settled, created_at, updated_at,
    json_extract(run_json, '$.case_id') AS case_id,
    json_extract(run_json, '$.status') AS run_status,
    json_extract(run_json, '$.state.current_zone') AS zone_id,
    json_extract(run_json, '$.state.turn_count') AS turn_count,
    json_extract(run_json, '$.state.action_points_left') AS action_points_left,
    json_array_length(run_json, '$.state.unlocked_clues') AS clue_count,
    json_array_length(run_json, '$.case_data.clue_dictionary') AS clue_total,
    json_extract(run_json, '$.judge_result.score') AS grade`;
  const pages = await Promise.all([0, 1].map(settled => env.DB.prepare(`SELECT ${columns}
    FROM player_runs WHERE user_id = ? AND settled = ?
    ORDER BY julianday(updated_at) DESC, julianday(created_at) DESC, id DESC LIMIT ?`)
    .bind(userId, settled, SAVE_LIBRARY_LIMIT).all()));
  return pages.flatMap(page => page.results || []).map(row => ({
    id: row.id, case_id: row.case_id, status: row.settled ? 'settled' : row.run_status,
    revision: Number(row.run_revision), created_at: isoTimestamp(row.created_at), updated_at: isoTimestamp(row.updated_at),
    zone_id: row.zone_id || null, turn_count: Number(row.turn_count) || 0,
    action_points_left: Number(row.action_points_left) || 0, clue_count: Number(row.clue_count) || 0,
    clue_total: Number(row.clue_total) || 0,
    grade: row.run_status !== 'active' && ['S', 'A', 'B', 'C', 'D'].includes(row.grade) ? row.grade : null,
    selected: !row.settled && row.id === selectedId,
  }));
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
