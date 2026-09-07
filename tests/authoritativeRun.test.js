import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProfileFunction } from '../cloudflare/worker/profile.js';
import { handleRunFunction } from '../cloudflare/worker/run.js';
import { authConfig } from '../cloudflare/worker/auth.js';
import { authorityDB, request, session, USER_ID, SESSION_ID } from './cloudflareAuthorityDB.js';

let sequence = 0;
const operation = (command, revision, extra = {}) => ({
  action: 'command', operation_id: `authoritative-op-${++sequence}`, expected_revision: revision, command, ...extra,
});
async function send(DB, body, owner = session, handler = handleRunFunction) {
  const response = await handler(request(body), { DB }, owner);
  return { status: response.status, ...(await response.json()) };
}
async function start(DB, case_id = 'Lvl_01') {
  const response = await send(DB, operation({ type: 'start_case', case_id }, 0), session, handleProfileFunction);
  assert.equal(response.status, 200);
  assert.ok(response.result.run?.id);
  return response.result.run;
}

test('real migrated D1 schema satisfies readiness and removing authority migration fails closed', async () => {
  const DB = authorityDB();
  assert.equal((await authConfig({ DB, FIREBASE_PROJECT_ID: 'authority-test' })).ready, true);
  const incomplete = authorityDB();
  incomplete.sqlite.exec('DELETE FROM d1_migrations');
  assert.equal((await authConfig({ DB: incomplete, FIREBASE_PROJECT_ID: 'authority-test' })).ready, false);
});

test('run reads and actions require an owned paid start, never caller owner or gameState', async () => {
  const DB = authorityDB();
  assert.equal((await send(DB, { action: 'status', run_id: 'forged-unpaid-run-1234' })).code, 'RUN_NOT_FOUND');
  const run = await start(DB);
  const other = { user_id: 'another-user-123', user: { id: 'another-user-123' } };
  await send(DB, { action: 'claim_session' }, other, handleProfileFunction);
  assert.equal((await send(DB, { action: 'status', run_id: run.id }, other)).code, 'RUN_NOT_FOUND');
  for (const command of [
    { type: 'patch', state: { case_solved: true } },
    { type: 'rest', gameState: { current_ap: 999 } },
    { type: 'abandon', xp_gain: 99999999 },
    { type: 'report', summary: { score: 'S', is_failed: false } },
  ]) assert.equal((await send(DB, operation(command, 0, { run_id: run.id }))).status, 400);
  assert.equal(DB.count('run_operations'), 0);
});

test('run command retries replay identical result and changed content cannot reuse IDs', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  const body = operation({ type: 'rest' }, 0, { run_id: run.id });
  const [first, duplicate] = await Promise.all([send(DB, body), send(DB, body)]);
  assert.equal(first.status, 200);
  assert.equal(duplicate.status, 200);
  assert.equal(first.run.revision, 1);
  assert.equal(duplicate.run.revision, 1);
  assert.deepEqual(first.result, duplicate.result);
  assert.equal(DB.count('run_operations'), 1);
  assert.equal((await send(DB, { ...body, command: { type: 'abandon' } })).code, 'OPERATION_ID_REUSED');
  const stale = await send(DB, operation({ type: 'rest' }, 0, { run_id: run.id }));
  assert.equal(stale.code, 'STALE_RUN');
});

test('valid-intent business rejections are immutable ledger results without gameplay mutations', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  const body = operation({ type: 'round', option_id: 'never-issued-option' }, 0, { run_id: run.id });
  const [first, duplicate] = await Promise.all([send(DB, body), send(DB, body)]);
  assert.equal(first.status, 200);
  assert.equal(first.result.error, 'STALE_OPTIONS');
  assert.equal(first.run.revision, 1);
  assert.deepEqual(first.run.state, run.state);
  assert.deepEqual(duplicate.result, first.result);
  assert.equal(duplicate.run.revision, 1);
  assert.equal(DB.count('run_operations'), 1);
  const progressed = await send(DB, operation({ type: 'rest' }, 1, { run_id: run.id }));
  assert.equal(progressed.status, 200);
  const replay = await send(DB, body);
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.run.revision, 2);
  const malformed = await send(DB, operation({ type: 'round', option_id: 'another-option', state: {} }, 2, { run_id: run.id }));
  assert.equal(malformed.status, 400);
  assert.equal(DB.count('run_operations'), 2);
});

test('run CAS allows only one concurrent distinct action at a revision', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  const responses = await Promise.all([
    send(DB, operation({ type: 'rest' }, 0, { run_id: run.id })),
    send(DB, operation({ type: 'rest' }, 0, { run_id: run.id })),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(DB.count('run_operations'), 1);
});

test('run takeover before commit rejects both action and old-device replay', async () => {
  let takeover = false;
  const DB = authorityDB({}, { beforeBatch(sqlite) {
    if (takeover) sqlite.prepare('UPDATE profiles SET active_session_id = ? WHERE user_id = ?').run('taken-session-123456', USER_ID);
  } });
  const run = await start(DB);
  const first = operation({ type: 'rest' }, 0, { run_id: run.id });
  assert.equal((await send(DB, first)).status, 200);
  takeover = true;
  assert.equal((await send(DB, operation({ type: 'rest' }, 1, { run_id: run.id }))).code, 'SESSION_TAKEN');
  assert.equal((await send(DB, first)).code, 'SESSION_TAKEN');
  assert.equal(DB.count('run_operations'), 1);
});

test('run transaction rollback leaves no accepted action or ledger entry', async () => {
  let fail = false;
  const DB = authorityDB({}, { failBatch: () => fail });
  const run = await start(DB);
  fail = true;
  await assert.rejects(send(DB, operation({ type: 'rest' }, 0, { run_id: run.id })), /Simulated storage failure/);
  assert.equal(DB.count('run_operations'), 0);
  assert.equal((await send(DB, { action: 'status', run_id: run.id })).run.revision, 0);
});

test('a write-attempt error cannot masquerade as definitive syntax rejection after commit', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  const batch = DB.batch.bind(DB);
  const body = operation({ type: 'rest' }, 0, { run_id: run.id });
  DB.batch = async statements => {
    await batch(statements);
    throw Object.assign(new Error('Lost committed response'), { status: 400, code: 'UNEXPECTED_STORAGE_ERROR' });
  };
  const unknown = await send(DB, body);
  assert.equal(unknown.status, 503);
  assert.equal(unknown.code, 'DATABASE_UNAVAILABLE');
  assert.equal(DB.count('run_operations'), 1);
  DB.batch = batch;
  const replay = await send(DB, body);
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  assert.equal(replay.run.revision, 1);
  assert.equal(replay.result.rested, true);
});

test('abandon and server settlement release active slot, award once and survive lost responses', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  const abandon = await send(DB, operation({ type: 'abandon' }, 0, { run_id: run.id }));
  assert.equal(abandon.status, 200);
  assert.equal(abandon.run.status, 'abandoned');
  const body = operation({ type: 'settle_case', run_id: run.id }, 1);
  const [settled, replay] = await Promise.all([
    send(DB, body, session, handleProfileFunction), send(DB, body, session, handleProfileFunction),
  ]);
  assert.equal(settled.status, 200);
  assert.equal(replay.status, 200);
  assert.deepEqual(settled.result, replay.result);
  assert.ok(settled.result.xp_breakdown);
  assert.equal(settled.result.summary.is_failed, true);
  assert.equal(settled.active_run, null);
  assert.equal(settled.profile.solved_cases.length, 0);
  assert.deepEqual(settled.profile.rewarded_runs, [run.id]);
  assert.equal(DB.count('profile_operations'), 2);
  const again = await send(DB, operation({ type: 'settle_case', run_id: run.id }, 2), session, handleProfileFunction);
  assert.equal(again.result.duplicate, true);
  assert.deepEqual(again.profile.agent_progression, settled.profile.agent_progression);
  assert.equal(again.profile.gold, settled.profile.gold);
  const restarted = await send(DB, operation({ type: 'start_case', case_id: 'Lvl_03' }, 3), session, handleProfileFunction);
  assert.ok(restarted.result.run.id);
  assert.notEqual(restarted.result.run.id, run.id);
});

test('lost start replay keeps the immutable receipt run separate from current active run', async () => {
  const DB = authorityDB();
  const body = operation({ type: 'start_case', case_id: 'Lvl_01' }, 0);
  const started = await send(DB, body, session, handleProfileFunction);
  const run = started.result.run;
  await send(DB, operation({ type: 'rest' }, 0, { run_id: run.id }));
  const advanced = await send(DB, body, session, handleProfileFunction);
  assert.deepEqual(advanced.result, started.result);
  assert.equal(advanced.result.run.revision, 0);
  assert.equal(advanced.active_run.revision, 1);
  await send(DB, operation({ type: 'abandon' }, 1, { run_id: run.id }));
  await send(DB, operation({ type: 'settle_case', run_id: run.id }, 1), session, handleProfileFunction);
  const settled = await send(DB, body, session, handleProfileFunction);
  assert.deepEqual(settled.result, started.result);
  assert.equal(settled.active_run, null);
  assert.equal(settled.profile.profile_revision, 2);
  const next = await send(DB, operation({ type: 'start_case', case_id: 'Lvl_03' }, 2), session, handleProfileFunction);
  const replay = await send(DB, body, session, handleProfileFunction);
  assert.deepEqual(replay.result, started.result);
  assert.equal(replay.active_run.id, next.result.run.id);
  assert.notEqual(replay.active_run.id, run.id);
  assert.equal(replay.profile.profile_revision, 3);
});

test('paid public-intent playthrough completes and settles through real SQLite handlers', async (t) => {
  t.mock.method(crypto, 'randomUUID', () => 'full-intent-investigation');
  const DB = authorityDB();
  let run = await start(DB);
  const commit = async command => {
    const response = await send(DB, operation(command, run.revision, { run_id: run.id }));
    assert.equal(response.status, 200, JSON.stringify(response));
    assert.equal(response.result.error, undefined);
    run = response.run;
  };
  for (let turn = 0; turn < 45 && run.status === 'active'; turn++) {
    if (run.state.is_crashed) await commit({ type: 'recover' });
    if (run.pending_crisis) await commit({ type: 'crisis', option_id:
      { tracker: 'hide', evidence: 'defer', npc_recant: 'ignore' }[run.pending_crisis.type] });
    const evidence_ids = run.state.unlocked_clues.filter(id => ['c_01', 'c_02', 'c_03'].includes(id));
    if (evidence_ids.length === 3 || (run.state.action_points_left === 0 && evidence_ids.length)) {
      await commit({ type: 'report', conclusion_id: 'conclusion:mei', method_id: 'method:emp',
        motive_id: 'motive:revenge', timeline_id: 'timeline:2317', evidence_ids });
      break;
    }
    assert.ok(run.state.action_points_left > 0);
    await commit({ type: 'decision_options' });
    const cards = Object.entries(run.decision_options.packs).flatMap(([id, pack]) =>
      run.state.agent_stamina[id] >= 6 ? pack.cards : []).sort((a, b) => b.estimatedAlignment - a.estimatedAlignment);
    await commit(cards.length ? { type: 'round', option_id: cards[0].optionId } : { type: 'rest' });
  }
  assert.equal(run.status, 'completed');
  const body = operation({ type: 'settle_case', run_id: run.id }, 1);
  const settled = await send(DB, body, session, handleProfileFunction);
  assert.equal(settled.status, 200);
  assert.equal(settled.result.summary.is_passed, true);
  assert.ok(settled.result.summary.xp_gain > 0);
  assert.deepEqual(settled.profile.rewarded_runs, [run.id]);
  assert.equal(settled.active_run, null);
  const replay = await send(DB, body, session, handleProfileFunction);
  assert.deepEqual(replay.result, settled.result);
  assert.deepEqual(replay.profile, settled.profile);
});

test('server-stored evidence and judged completion award canonical rewards exactly once', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  // Seed a trusted persisted evidence fixture; no HTTP endpoint accepts this state.
  const row = DB.sqlite.prepare('SELECT run_json FROM player_runs WHERE id = ?').get(run.id);
  const fixture = JSON.parse(row.run_json);
  fixture.state.unlocked_clues = ['c_01', 'c_02', 'c_03'];
  DB.sqlite.prepare('UPDATE player_runs SET run_json = ? WHERE id = ?').run(JSON.stringify(fixture), run.id);
  const report = await send(DB, operation({ type: 'report', conclusion_id: 'conclusion:mei',
    method_id: 'method:emp', motive_id: 'motive:revenge', timeline_id: 'timeline:2317',
    evidence_ids: ['c_01', 'c_02', 'c_03'] }, 0, { run_id: run.id }));
  assert.equal(report.status, 200);
  assert.equal(report.run.status, 'completed');
  const body = operation({ type: 'settle_case', run_id: run.id }, 1);
  const settled = await send(DB, body, session, handleProfileFunction);
  assert.equal(settled.status, 200);
  assert.equal(settled.result.summary.is_passed, true);
  assert.ok(settled.result.summary.xp_gain > 0);
  assert.ok(settled.profile.gold > 0);
  assert.ok(settled.profile.diamonds > 0);
  assert.deepEqual(settled.profile.solved_cases, ['Lvl_01']);
  assert.deepEqual(settled.profile.rewarded_runs, [run.id]);
  const replay = await send(DB, body, session, handleProfileFunction);
  assert.deepEqual(replay.result, settled.result);
  assert.deepEqual(replay.profile, settled.profile);
});

test('competing settlement IDs award one result and keep run/profile revisions atomic', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  await send(DB, operation({ type: 'abandon' }, 0, { run_id: run.id }));
  const responses = await Promise.all([
    send(DB, operation({ type: 'settle_case', run_id: run.id }, 1), session, handleProfileFunction),
    send(DB, operation({ type: 'settle_case', run_id: run.id }, 1), session, handleProfileFunction),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(DB.count('profile_operations'), 2);
  const row = DB.sqlite.prepare('SELECT settled, run_revision FROM player_runs WHERE id = ?').get(run.id);
  assert.equal(row.settled, 1);
  assert.equal(row.run_revision, 2);
  assert.equal(DB.profile().profile_revision, 2);
  assert.equal((await send(DB, operation({ type: 'rest' }, 2, { run_id: run.id }))).code, 'RUN_SETTLED');
});

test('settlement racing a run revision change leaves neither ledger nor rewards', async () => {
  let changeRun = false;
  const DB = authorityDB({}, { beforeBatch(sqlite) {
    if (changeRun) {
      changeRun = false;
      sqlite.prepare('UPDATE player_runs SET run_revision = run_revision + 1 WHERE user_id = ?').run(USER_ID);
    }
  } });
  const run = await start(DB);
  await send(DB, operation({ type: 'abandon' }, 0, { run_id: run.id }));
  changeRun = true;
  const rejected = await send(DB, operation({ type: 'settle_case', run_id: run.id }, 1), session, handleProfileFunction);
  assert.equal(rejected.status, 409);
  assert.equal(DB.count('profile_operations'), 1);
  assert.equal(DB.profile().profile_revision, 1);
  assert.deepEqual(JSON.parse(DB.profile().profile_json).rewarded_runs, []);
  const settled = await send(DB, operation({ type: 'settle_case', run_id: run.id }, 1), session, handleProfileFunction);
  assert.equal(settled.status, 200);
  assert.deepEqual(settled.profile.rewarded_runs, [run.id]);
});

test('accepted run result still replays after reward settlement and a new device claim', async () => {
  const DB = authorityDB();
  const run = await start(DB);
  const body = operation({ type: 'abandon' }, 0, { run_id: run.id });
  const first = await send(DB, body);
  await send(DB, operation({ type: 'settle_case', run_id: run.id }, 1), session, handleProfileFunction);
  const replacement = 'replacement-device-123456';
  await send(DB, { action: 'claim_session', session_id: replacement }, session, handleProfileFunction);
  const replay = await send(DB, { ...body, session_id: replacement });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.run.status, 'settled');
});

test('paid-proof and active-run uniqueness constraints are enforced by actual SQLite', async () => {
  const DB = authorityDB();
  assert.throws(() => DB.sqlite.prepare('INSERT INTO player_runs(id,user_id,start_operation_id,run_json) VALUES (?,?,?,?)')
    .run('fake-paid-proof-123456', USER_ID, 'missing-operation', '{}'), /FOREIGN KEY/);
  const run = await start(DB);
  const proof = DB.sqlite.prepare('SELECT start_operation_id FROM player_runs WHERE id = ?').get(run.id);
  assert.throws(() => DB.sqlite.prepare('INSERT INTO player_runs(id,user_id,start_operation_id,run_json) VALUES (?,?,?,?)')
    .run('another-paid-run-123456', USER_ID, proof.start_operation_id, '{}'), /UNIQUE/);
  assert.equal(DB.profile().active_session_id, SESSION_ID);
});
