import {
  applyProfileCommand, prepareCaseStart, settleAuthoritativeCase, validateProfileCommand,
} from '../../server/gameAuthority/profileCommands.js';
import { createRun, publicRun, deriveRunSummary } from '../../server/gameAuthority/runAuthority.js';
import { ALL_CASES } from '../../src/game/caseData.js';
import {
  json, error, readEnvelope, readProfileRow, profilePayload, commandHash, serialize,
  readProfileOperation, matchingOperation, parseObject, readActiveRunRow, readRunRow, storedRun, MAX_RUN_BYTES,
  countUnsettledRuns, runLibrary, SAVE_LIBRARY_LIMIT,
} from './authorityStore.js';

async function successPayload(env, row, session, result, operationId = '', replayed = false) {
  const active = await readActiveRunRow(env, session.user_id, row);
  const profile = { ...profilePayload(row), active_run_id: active?.id || null };
  const archiveClueLabels = Object.fromEntries(profile.case_records.map(record => {
    const catalog = ALL_CASES.find(item => item.case_id === record.case_id);
    const discovered = new Set(record.discovered_clues);
    return [record.case_id, Object.fromEntries((catalog?.clue_dictionary || [])
      .filter(clue => discovered.has(clue.clue_id)).map(clue => [clue.clue_id, {
        zh: clue.keyword,
        en: catalog.en?.clue_dictionary?.find(item => item.clue_id === clue.clue_id)?.keyword || clue.keyword,
      }]))];
  }));
  return {
    profile, archive_clue_labels: archiveClueLabels,
    account: session.user, backend: 'cloudflare', authority_version: 1,
    supported_investigation_versions: [1, 2],
    save_library_version: 1, save_library_limit: SAVE_LIBRARY_LIMIT,
    run_library: await runLibrary(env, session.user_id, active?.id),
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
  const context = { writeAttempted: false };
  try {
    return await profileRequest(request, env, session, context);
  } catch (cause) {
    if (cause?.status && cause.status < 500) {
      // Once a transaction was sent, only its receipt can establish whether it
      // committed. A late storage/response error must not discard a paid intent.
      if (context.writeAttempted) return error('DATABASE_UNAVAILABLE', 'Command outcome needs reconciliation.', 503);
      return error(cause.code || 'INVALID_COMMAND', cause.message, cause.status);
    }
    throw cause;
  }
}

async function profileRequest(request, env, session, context) {
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

  const active = await readActiveRunRow(env, session.user_id, row);
  // Persist a legacy selection with the next ordinary profile command. Merely
  // browsing an old account must never detach its already-paid investigation.
  const profile = { ...profilePayload(row, now), active_run_id: active?.id || null };
  let outcome;
  let newRun;
  let settleRow;
  let resumeRow;
  if (command.type === 'start_case') {
    if (active && command.new_save !== true) outcome = { profile, error: 'active_run_exists', run: publicRun(storedRun(active)) };
    else if (await countUnsettledRuns(env, session.user_id) >= SAVE_LIBRARY_LIMIT) outcome = { profile, error: 'save_library_full' };
    else {
      const prepared = prepareCaseStart(profile, command, now);
      const { caseData, teamConfig, investigationVersion, ...startResult } = prepared;
      outcome = startResult;
      if (!prepared.error) {
        newRun = createRun({ id: crypto.randomUUID(), caseData, teamConfig, investigationVersion, effects: prepared.effects, now });
        outcome.profile = { ...outcome.profile, active_run_id: newRun.id };
        outcome.run = publicRun(newRun);
      }
    }
  } else if (command.type === 'resume_run') {
    const candidate = await readRunRow(env, session.user_id, command.run_id);
    if (!candidate) return error('RUN_NOT_FOUND', 'Saved investigation not found.', 404);
    if (candidate.settled) outcome = { profile, error: 'run_not_resumable' };
    else {
      resumeRow = candidate;
      outcome = { profile: { ...profile, active_run_id: candidate.id }, run: publicRun(storedRun(candidate)) };
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
      outcome = { ...settlement,
        profile: { ...settlement.profile, active_run_id: profile.active_run_id === run.id ? null : profile.active_run_id },
        summary, xp_breakdown: summary.xp_breakdown, run: publicRun({ ...run, status: 'settled', revision: run.revision + 1 }) };
    }
  } else outcome = applyProfileCommand(profile, command, now);

  const { profile: nextProfile, ...result } = outcome;
  const resultJson = serialize(result, MAX_RUN_BYTES);
  const serialized = serialize(nextProfile);
  const revision = Number(row.profile_revision);
  // D1 batches are serial transactions. The ledger insertion is the single gate;
  // each dependent write requires that exact gate and the still-current revision.
  const gate = newRun ? `AND (SELECT count(*) FROM player_runs WHERE user_id = ? AND settled = 0) < ?`
    : settleRow ? `AND EXISTS (SELECT 1 FROM player_runs WHERE user_id = ? AND id = ? AND run_revision = ? AND settled = 0)`
      : resumeRow ? `AND EXISTS (SELECT 1 FROM player_runs WHERE user_id = ? AND id = ? AND settled = 0)` : '';
  const gateArgs = newRun ? [session.user_id, SAVE_LIBRARY_LIMIT]
    : settleRow ? [session.user_id, settleRow.id, settleRow.run_revision]
      : resumeRow ? [session.user_id, resumeRow.id] : [];
  const statements = [env.DB.prepare(`
    INSERT OR IGNORE INTO profile_operations (user_id, operation_id, base_revision, result_revision, patch_hash, result_json)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM profiles WHERE user_id = ? AND profile_revision = ? AND active_session_id = ? AND authority_version = 1
    ) ${gate}
  `).bind(session.user_id, body.operation_id, revision, revision + 1, hash, resultJson, session.user_id, revision, body.session_id, ...gateArgs)];
  if (newRun) statements.push(env.DB.prepare(`
    INSERT INTO player_runs (id, user_id, start_operation_id, run_json, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM profile_operations op JOIN profiles p ON p.user_id = op.user_id
      WHERE op.user_id = ? AND op.operation_id = ? AND op.base_revision = p.profile_revision
        AND op.patch_hash = ? AND p.profile_revision = ? AND p.active_session_id = ?
    )
  `).bind(newRun.id, session.user_id, body.operation_id, serialize(newRun, MAX_RUN_BYTES), newRun.created_at, newRun.updated_at,
    session.user_id, body.operation_id, hash, revision, body.session_id));
  if (settleRow) statements.push(env.DB.prepare(`
    UPDATE player_runs SET settled = 1, settlement_operation_id = ?, run_revision = run_revision + 1, updated_at = ?
    WHERE user_id = ? AND id = ? AND run_revision = ? AND settled = 0 AND EXISTS (
      SELECT 1 FROM profile_operations op JOIN profiles p ON p.user_id = op.user_id
      WHERE op.user_id = ? AND op.operation_id = ? AND op.base_revision = p.profile_revision
        AND op.patch_hash = ? AND p.profile_revision = ? AND p.active_session_id = ?
    )
  `).bind(body.operation_id, now.toISOString(), session.user_id, settleRow.id, settleRow.run_revision,
    session.user_id, body.operation_id, hash, revision, body.session_id));
  statements.push(env.DB.prepare(`
    UPDATE profiles SET profile_json = ?, profile_revision = profile_revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND profile_revision = ? AND active_session_id = ? AND EXISTS (
      SELECT 1 FROM profile_operations WHERE user_id = ? AND operation_id = ? AND base_revision = ? AND result_revision = ? AND patch_hash = ?
    )
  `).bind(serialized, session.user_id, revision, body.session_id, session.user_id, body.operation_id, revision, revision + 1, hash));
  context.writeAttempted = true;
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
