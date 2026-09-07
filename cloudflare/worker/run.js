import { applyRunCommand, publicRun, validateRunCommand } from '../../server/gameAuthority/runAuthority.js';
import { plainObject } from '../../server/gameAuthority/profileCommands.js';
import {
  json, error, readEnvelope, readProfileRow, commandHash, serialize, matchingOperation,
  parseObject, readRunRow, storedRun, MAX_RUN_BYTES,
} from './authorityStore.js';

async function readOperation(env, userId, operationId) {
  return env.DB.prepare(`SELECT run_id, base_revision, result_revision, command_hash, result_json
    FROM run_operations WHERE user_id = ? AND operation_id = ?`).bind(userId, operationId).first();
}
function payload(row, result, body, replayed = false) {
  return {
    run: publicRun(storedRun(row)), backend: 'cloudflare', authority_version: 1,
    ...(result !== undefined ? { result } : {}),
    ...(body.operation_id ? { operation_id: body.operation_id, replayed } : {}),
  };
}
async function replayOrConflict(env, session, body, hash, prior) {
  const profile = await readProfileRow(env, session.user_id);
  if (profile.active_session_id !== body.session_id) return error('SESSION_TAKEN', 'This account is active on another device.', 409);
  const row = await readRunRow(env, session.user_id, body.run_id);
  if (!row) return error('RUN_NOT_FOUND', 'Paid run not found.', 404);
  if (prior) {
    if (prior.run_id !== body.run_id || !matchingOperation(prior, body.expected_revision, hash, 'command_hash')) {
      return error('OPERATION_ID_REUSED', 'Operation id has different content.', 409);
    }
    if (Number(row.run_revision) < Number(prior.result_revision)) return error('DATABASE_UNAVAILABLE', 'Operation not yet visible.', 503);
    return json(payload(row, parseObject(prior.result_json, 'RUN_DATA_CORRUPT'), body, true));
  }
  return error('STALE_RUN', 'Run revision changed.', 409, { run: publicRun(storedRun(row)) });
}

export async function handleRunFunction(request, env, session) {
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'POST is required.', 405, {}, { Allow: 'POST' });
  const context = { writeAttempted: false };
  try {
    return await runRequest(request, env, session, context);
  } catch (cause) {
    if (cause?.status && cause.status < 500) {
      if (context.writeAttempted) return error('DATABASE_UNAVAILABLE', 'Command outcome needs reconciliation.', 503);
      return error(cause.code || 'INVALID_COMMAND', cause.message, cause.status);
    }
    throw cause;
  }
}
async function runRequest(request, env, session, context) {
  const body = await readEnvelope(request, true);
  const profile = await readProfileRow(env, session.user_id);
  if (profile.active_session_id !== body.session_id) return error('SESSION_TAKEN', 'This account is active on another device.', 409);
  const row = await readRunRow(env, session.user_id, body.run_id);
  if (!row) return error('RUN_NOT_FOUND', 'Paid run not found.', 404);
  if (body.action === 'status') return json(payload(row, undefined, body));
  if (body.action !== 'command' || !plainObject(body.command)) return error('INVALID_COMMAND', 'Unknown command.');
  const hash = await commandHash(body.command);
  const prior = await readOperation(env, session.user_id, body.operation_id);
  if (prior || body.expected_revision !== Number(row.run_revision)) return replayOrConflict(env, session, body, hash, prior);
  if (row.settled) return error('RUN_SETTLED', 'This run has already settled.', 409);
  validateRunCommand(body.command);
  const original = storedRun(row);
  let outcome;
  try {
    outcome = applyRunCommand(original, body.command, new Date());
  } catch (cause) {
    if (cause?.status !== 400) throw cause;
    outcome = { run: original, result: { error: cause.code || 'INVALID_COMMAND' } };
  }
  const revision = Number(row.run_revision);
  const nextRun = { ...outcome.run, revision: revision + 1 };
  const result = outcome.result || {};
  const serialized = serialize(nextRun, MAX_RUN_BYTES);
  const resultJson = serialize(result, MAX_RUN_BYTES);
  context.writeAttempted = true;
  const committed = await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO run_operations (user_id, run_id, operation_id, base_revision, result_revision, command_hash, result_json)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM player_runs r JOIN profiles p ON p.user_id = r.user_id
        WHERE r.user_id = ? AND r.id = ? AND r.run_revision = ? AND r.settled = 0 AND p.active_session_id = ?
      )
    `).bind(session.user_id, body.run_id, body.operation_id, revision, revision + 1, hash, resultJson,
      session.user_id, body.run_id, revision, body.session_id),
    env.DB.prepare(`
      UPDATE player_runs SET run_json = ?, run_revision = run_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND id = ? AND run_revision = ? AND settled = 0
        AND EXISTS (SELECT 1 FROM profiles WHERE user_id = ? AND active_session_id = ?)
        AND EXISTS (SELECT 1 FROM run_operations WHERE user_id = ? AND run_id = ? AND operation_id = ?
          AND base_revision = ? AND result_revision = ? AND command_hash = ?)
    `).bind(serialized, session.user_id, body.run_id, revision, session.user_id, body.session_id,
      session.user_id, body.run_id, body.operation_id, revision, revision + 1, hash),
  ]);
  if (!committed?.[1]?.meta?.changes) return replayOrConflict(env, session, body, hash, await readOperation(env, session.user_id, body.operation_id));
  const currentProfile = await readProfileRow(env, session.user_id);
  if (currentProfile.active_session_id !== body.session_id) return error('SESSION_TAKEN', 'This account is active on another device.', 409);
  const updated = await readRunRow(env, session.user_id, body.run_id);
  return json(payload(updated, result, body));
}
