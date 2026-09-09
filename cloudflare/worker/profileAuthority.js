import {
  applyProfileCommand, prepareCaseStart, settleAuthoritativeCase, validateProfileCommand,
} from '../../server/gameAuthority/profileCommands.js';
import { createRun, publicRun, deriveRunSummary } from '../../server/gameAuthority/runAuthority.js';
import {
  json, error, readEnvelope, readProfileRow, profilePayload, commandHash, serialize,
  readProfileOperation, matchingOperation, parseObject, readActiveRunRow, readRunRow, storedRun, MAX_RUN_BYTES,
} from './authorityStore.js';

async function successPayload(env, row, session, result, operationId = '', replayed = false) {
  const active = await readActiveRunRow(env, session.user_id);
  return {
    profile: profilePayload(row), account: session.user, backend: 'cloudflare', authority_version: 1,
    active_run: active ? publicRun(storedRun(active)) : null,
    ...(result !== undefined ? { result } : {}),
    ...(operationId ? { operation_id: operationId, replayed } : {}),
  };
}

async function replayOrConflict(env, _row, session, body, hash, prior) {
  const row = await readProfileRow(env, session.user_id);
  if (row.active_session_id !== body.session_id) return error('SESSION_TAKEN', 'This account is active on another device.', 409);
  if (prior) {
    if (!matchingOperation(prior, body.expected_revision, hash)) return error('OPERATION_ID_REUSED', 'Operation id has different content.', 409);
    if (Number(row.profile_revision) < Number(prior.result_revision)) return error('DATABASE_UNAVAILABLE', 'Operation is not yet visible.', 503);
    return json(await successPayload(env, row, session, parseObject(prior.result_json), body.operation_id, true));
  }
  return error('STALE_PROFILE', 'Profile revision changed.', 409, { profile: profilePayload(row), profile_revision: Number(row.profile_revision) });
}

export async function handleProfileFunction(request, env, session) {
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'POST is required.', 405, {}, { Allow: 'POST' });
  try {
    return await profileRequest(request, env, session);
  } catch (cause) {
    if (cause?.status && cause.status < 500) return error(cause.code || 'INVALID_COMMAND', cause.message, cause.status);
    throw cause;
  }
}

async function profileRequest(request, env, session) {
  const body = await readEnvelope(request);
  const now = new Date();
  let row = await readProfileRow(env, session.user_id, now);
  if (body.action === 'claim_session') {
    await env.DB.prepare(`UPDATE profiles SET active_session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
      .bind(body.session_id, session.user_id).run();
    row = await readProfileRow(env, session.user_id, now);
    if (row.active_session_id !== body.session_id) return error('SESSION_TAKEN', 'This account is active on another device.', 409);
    return json(await successPayload(env, row, session));
  }
  if (row.active_session_id !== body.session_id) return error('SESSION_TAKEN', 'This account is active on another device.', 409);
  if (body.action === 'status') return json(await successPayload(env, row, session));
  if (body.action !== 'command') return error('INVALID_COMMAND', 'Unknown action.');
  const command = validateProfileCommand(body.command);
  const hash = await commandHash(command);
  const prior = await readProfileOperation(env, session.user_id, body.operation_id);
  if (prior || body.expected_revision !== Number(row.profile_revision)) {
    return replayOrConflict(env, row, session, body, hash, prior);
  }

  const profile = profilePayload(row, now);
  let outcome;
  let newRun;
  let settleRow;
  if (command.type === 'start_case') {
    const active = await readActiveRunRow(env, session.user_id);
    if (active) outcome = { profile, error: 'active_run_exists', run: publicRun(storedRun(active)) };
    else {
      const prepared = prepareCaseStart(profile, command, now);
      const { caseData, teamConfig, ...startResult } = prepared;
      outcome = startResult;
      if (!prepared.error) {
        newRun = createRun({ id: crypto.randomUUID(), caseData, teamConfig, effects: prepared.effects, now });
        outcome.run = publicRun(newRun);
      }
    }
  } else if (command.type === 'settle_case') {
    const candidate = await readRunRow(env, session.user_id, command.run_id);
    if (!candidate) return error('RUN_NOT_FOUND', 'Paid run not found.', 404);
    if (candidate.settled) outcome = { profile, duplicate: true, run: publicRun(storedRun(candidate)) };
    else {
      const run = storedRun(candidate);
      const summary = deriveRunSummary(run);
      const settlement = settleAuthoritativeCase(profile, summary, now);
      settleRow = candidate;
      outcome = { ...settlement, summary, xp_breakdown: summary.xp_breakdown, run: publicRun({ ...run, status: 'settled', revision: run.revision + 1 }) };
    }
  } else outcome = applyProfileCommand(profile, command, now);

  const { profile: nextProfile, ...result } = outcome;
  const resultJson = serialize(result, MAX_RUN_BYTES);
  const serialized = serialize(nextProfile);
  const revision = Number(row.profile_revision);
  // D1 batches are serial transactions. The ledger insertion is the single gate;
  // each dependent write requires that exact gate and the still-current revision.
  const gate = newRun ? `AND NOT EXISTS (SELECT 1 FROM player_runs WHERE user_id = ? AND settled = 0)`
    : settleRow ? `AND EXISTS (SELECT 1 FROM player_runs WHERE user_id = ? AND id = ? AND run_revision = ? AND settled = 0)` : '';
  const gateArgs = newRun ? [session.user_id]
    : settleRow ? [session.user_id, settleRow.id, settleRow.run_revision] : [];
  const statements = [env.DB.prepare(`
    INSERT OR IGNORE INTO profile_operations (user_id, operation_id, base_revision, result_revision, patch_hash, result_json)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM profiles WHERE user_id = ? AND profile_revision = ? AND active_session_id = ? AND authority_version = 1
    ) ${gate}
  `).bind(session.user_id, body.operation_id, revision, revision + 1, hash, resultJson, session.user_id, revision, body.session_id, ...gateArgs)];
  if (newRun) statements.push(env.DB.prepare(`
    INSERT INTO player_runs (id, user_id, start_operation_id, run_json)
    SELECT ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM profile_operations op JOIN profiles p ON p.user_id = op.user_id
      WHERE op.user_id = ? AND op.operation_id = ? AND op.base_revision = p.profile_revision
        AND op.patch_hash = ? AND p.profile_revision = ? AND p.active_session_id = ?
    )
  `).bind(newRun.id, session.user_id, body.operation_id, serialize(newRun, MAX_RUN_BYTES), session.user_id, body.operation_id, hash, revision, body.session_id));
  if (settleRow) statements.push(env.DB.prepare(`
    UPDATE player_runs SET settled = 1, settlement_operation_id = ?, run_revision = run_revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND id = ? AND run_revision = ? AND settled = 0 AND EXISTS (
      SELECT 1 FROM profile_operations op JOIN profiles p ON p.user_id = op.user_id
      WHERE op.user_id = ? AND op.operation_id = ? AND op.base_revision = p.profile_revision
        AND op.patch_hash = ? AND p.profile_revision = ? AND p.active_session_id = ?
    )
  `).bind(body.operation_id, session.user_id, settleRow.id, settleRow.run_revision, session.user_id, body.operation_id, hash, revision, body.session_id));
  statements.push(env.DB.prepare(`
    UPDATE profiles SET profile_json = ?, profile_revision = profile_revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND profile_revision = ? AND active_session_id = ? AND EXISTS (
      SELECT 1 FROM profile_operations WHERE user_id = ? AND operation_id = ? AND base_revision = ? AND result_revision = ? AND patch_hash = ?
    )
  `).bind(serialized, session.user_id, revision, body.session_id, session.user_id, body.operation_id, revision, revision + 1, hash));
  const committed = await env.DB.batch(statements);
  const updated = await readProfileRow(env, session.user_id);
  if (!committed?.at(-1)?.meta?.changes) {
    return replayOrConflict(env, updated, session, body, hash, await readProfileOperation(env, session.user_id, body.operation_id));
  }
  if (updated.active_session_id !== body.session_id) return error('SESSION_TAKEN', 'This account is active on another device.', 409);
  return json(await successPayload(env, updated, session, result, body.operation_id));
}

export async function handleCurrentUser(request, env, session) {
  if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'GET is required.', 405, {}, { Allow: 'GET' });
  const row = await readProfileRow(env, session.user_id);
  const payload = await successPayload(env, row, session);
  return json({ ...session.user, ...payload.profile, ...payload });
}
