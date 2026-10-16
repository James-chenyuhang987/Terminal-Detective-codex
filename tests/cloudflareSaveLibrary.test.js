import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleProfileFunction } from '../cloudflare/worker/profile.js';
import { handleRunFunction } from '../cloudflare/worker/run.js';
import { authorityDB, USER_ID, SESSION_ID, session, request } from './cloudflareAuthorityDB.js';

let sequence = 0;
const operationId = () => `save-library-operation-${++sequence}`;
const rowFor = (DB, id) => DB.sqlite.prepare('SELECT * FROM player_runs WHERE id = ?').get(id);
const profileCommand = (DB, command, extra = {}) => ({
  action: 'command', expected_revision: Number(DB.profile().profile_revision), operation_id: operationId(), command, ...extra,
});
async function send(DB, body, handler = handleProfileFunction, owner = session) {
  const response = await handler(request(body), { DB }, owner);
  return { status: response.status, ...(await response.json()) };
}
const profile = (DB, command, extra) => send(DB, profileCommand(DB, command, extra));
const start = (DB, args = {}) => profile(DB, { type: 'start_case', case_id: 'Lvl_01', investigation_version: 2, new_save: true, ...args });
const act = (DB, id, command, extra = {}) => send(DB, {
  action: 'command', operation_id: operationId(), run_id: id, expected_revision: Number(rowFor(DB, id).run_revision), command, ...extra,
}, handleRunFunction);

function seedSave(DB, sourceId, index, settled = false) {
  const id = `seeded-save-run-${String(index).padStart(4, '0')}`;
  const proof = `seeded-save-proof-${String(index).padStart(4, '0')}`;
  const run = JSON.parse(rowFor(DB, sourceId).run_json);
  run.id = id;
  run.state.run_id = id;
  const time = new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString();
  DB.sqlite.prepare(`INSERT INTO profile_operations(user_id,operation_id,base_revision,result_revision,patch_hash,result_json)
    VALUES (?,?,0,1,'seed-proof','{}')`).run(USER_ID, proof);
  DB.sqlite.prepare(`INSERT INTO player_runs(id,user_id,start_operation_id,run_json,settled,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`).run(id, USER_ID, proof, JSON.stringify(run), settled ? 1 : 0, time, time);
  return id;
}

test('new saves preserve independent same-case progress and resume without another fee', async () => {
  const DB = authorityDB({ inventory: { ap_booster: 2 }, equipped_items: ['ap_booster'] });
  const first = await start(DB);
  const firstId = first.active_run.id;
  assert.equal(first.active_run.state.action_points_left, 23);
  await act(DB, firstId, { type: 'rest', lang: 'zh' });
  const firstRow = { ...rowFor(DB, firstId) };
  const second = await start(DB);
  const secondId = second.active_run.id;
  assert.notEqual(firstId, secondId);
  assert.equal(second.profile.energy, 80);
  assert.equal(second.profile.inventory.ap_booster, 1);
  assert.equal(second.active_run.state.action_points_left, 20);
  assert.deepEqual({ ...rowFor(DB, firstId) }, firstRow);
  assert.equal(second.save_library_version, 1);
  assert.equal(second.save_library_limit, 20);
  assert.equal(second.run_library.length, 2);
  assert.deepEqual(second.run_library.filter(row => row.selected).map(row => row.id), [secondId]);
  const restored = await profile(DB, { type: 'resume_run', run_id: firstId });
  assert.equal(restored.active_run.id, firstId);
  assert.equal(restored.active_run.state.turn_count, 1);
  assert.equal(restored.active_run.revision, 1);
  assert.equal(restored.profile.energy, second.profile.energy);
  assert.deepEqual(restored.profile.inventory, second.profile.inventory);
  assert.deepEqual(restored.profile.activity_stats, second.profile.activity_stats);
  assert.deepEqual({ ...rowFor(DB, firstId) }, firstRow);
  const refreshed = await send(DB, { action: 'status' });
  assert.equal(refreshed.active_run.id, firstId);
  assert.equal(refreshed.profile.active_run_id, firstId);
  assert.equal(refreshed.run_library.find(row => row.id === secondId).turn_count, 0);
});

test('old start protocol still refuses to replace a current paid run', async () => {
  const DB = authorityDB();
  const first = await start(DB, { investigation_version: 1 });
  const response = await profile(DB, { type: 'start_case', case_id: 'Lvl_02' });
  assert.equal(response.result.error, 'active_run_exists');
  assert.equal(response.active_run.id, first.active_run.id);
  assert.equal(response.active_run.investigation, undefined);
  assert.equal(response.profile.energy, 100);
  assert.equal(DB.count('player_runs'), 1);
  const next = await start(DB, { case_id: 'Lvl_02' });
  assert.equal(next.active_run.investigation_version, 2);
  const legacy = await profile(DB, { type: 'resume_run', run_id: first.active_run.id });
  assert.equal(legacy.active_run.investigation, undefined);
  assert.equal(JSON.parse(rowFor(DB, first.active_run.id).run_json).investigation_version, undefined);
});

test('library returns only bounded public summaries and canonical UTC timestamps', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  for (let index = 1; index <= 25; index += 1) seedSave(DB, first.active_run.id, index, true);
  const response = await send(DB, { action: 'status' });
  assert.equal(response.run_library.length, 21);
  assert.equal(response.run_library.filter(row => row.status === 'settled').length, 20);
  assert.equal(response.run_library.some(row => row.id === 'seeded-save-run-0001'), false);
  const keys = ['id', 'case_id', 'status', 'revision', 'created_at', 'updated_at', 'zone_id', 'turn_count',
    'action_points_left', 'clue_count', 'clue_total', 'grade', 'selected'].sort();
  for (const row of response.run_library) {
    assert.deepEqual(Object.keys(row).sort(), keys);
    assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(row.grade, null);
    assert.ok(row.clue_total > 0);
  }
  DB.sqlite.prepare(`UPDATE player_runs SET updated_at = '2026-10-16 01:45:38' WHERE id = ?`).run(first.active_run.id);
  assert.equal((await send(DB, { action: 'status' })).run_library.find(row => row.selected).updated_at, '2026-10-16T01:45:38.000Z');
});

test('save capacity rejects another debit, while existing saves remain resumable', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  for (let index = 1; index < 20; index += 1) seedSave(DB, first.active_run.id, index);
  const before = { ...DB.profile() };
  const rejected = await start(DB);
  assert.equal(rejected.result.error, 'save_library_full');
  assert.equal(rejected.profile.energy, 100);
  assert.equal(rejected.profile.activity_stats.cases_started, 1);
  assert.equal(DB.count('player_runs'), 20);
  assert.equal(rejected.run_library.length, 20);
  assert.equal(Number(DB.profile().profile_revision), Number(before.profile_revision) + 1);
  const resumed = await profile(DB, { type: 'resume_run', run_id: 'seeded-save-run-0001' });
  assert.equal(resumed.active_run.id, 'seeded-save-run-0001');
  assert.equal(resumed.profile.energy, 100);
});

test('recent-history selection compares legacy SQLite and ISO timestamps by time rather than text', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  for (let index = 1; index <= 25; index += 1) {
    const id = seedSave(DB, first.active_run.id, index, true);
    const minute = String(index).padStart(2, '0');
    const updated = index % 2 ? `2026-10-16T00:${minute}:00.000Z` : `2026-10-16 00:${minute}:00`;
    DB.sqlite.prepare('UPDATE player_runs SET updated_at = ? WHERE id = ?').run(updated, id);
  }
  const history = (await send(DB, { action: 'status' })).run_library.filter(row => row.status === 'settled');
  assert.equal(history.length, 20);
  assert.equal(history[0].id, 'seeded-save-run-0025');
  assert.equal(history.at(-1).id, 'seeded-save-run-0006');
  assert.ok(history.every((row, index) => index === 0 || Date.parse(history[index - 1].updated_at) >= Date.parse(row.updated_at)));
});

test('capacity is checked again inside the transaction before a paid save can commit', async () => {
  let addAtCommit = false;
  let sourceId;
  const DB = authorityDB({}, { beforeBatch() {
    if (!addAtCommit) return;
    addAtCommit = false;
    seedSave(DB, sourceId, 19);
  } });
  const first = await start(DB);
  sourceId = first.active_run.id;
  for (let index = 1; index < 19; index += 1) seedSave(DB, sourceId, index);
  const revision = Number(DB.profile().profile_revision);
  addAtCommit = true;
  const raced = await start(DB);
  assert.equal(raced.status, 409);
  assert.equal(DB.count('player_runs'), 20);
  assert.equal(Number(DB.profile().profile_revision), revision);
  assert.equal(JSON.parse(DB.profile().profile_json).energy, 100);
  const retry = await start(DB);
  assert.equal(retry.result.error, 'save_library_full');
  assert.equal(retry.active_run.id, sourceId);
});

test('an unaffordable new save keeps the previous paid run and unused items selected', async () => {
  const DB = authorityDB({ energy: 20, inventory: { ap_booster: 1 } });
  const first = await start(DB);
  await profile(DB, { type: 'equip_item', item_id: 'ap_booster' });
  const rejected = await start(DB);
  assert.equal(rejected.result.error, 'insufficient_energy');
  assert.equal(rejected.profile.energy, 0);
  assert.equal(rejected.active_run.id, first.active_run.id);
  assert.equal(rejected.profile.inventory.ap_booster, 1);
  assert.deepEqual(rejected.profile.equipped_items, ['ap_booster']);
  assert.equal(DB.count('player_runs'), 1);
});

test('library grades expose only an already finished verdict', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  const row = rowFor(DB, first.active_run.id);
  const run = JSON.parse(row.run_json);
  run.judge_result = { score: 'D', is_passed: false };
  DB.sqlite.prepare('UPDATE player_runs SET run_json = ? WHERE id = ?').run(JSON.stringify(run), row.id);
  assert.equal((await send(DB, { action: 'status' })).run_library[0].grade, null);
  await act(DB, row.id, { type: 'abandon' });
  assert.equal((await send(DB, { action: 'status' })).run_library[0].grade, 'D');
});

test('new-save flag and resume arguments reject forged or malformed input without writes', async () => {
  const DB = authorityDB();
  for (const command of [
    { type: 'start_case', case_id: 'Lvl_01', new_save: 'true' },
    { type: 'start_case', case_id: 'Lvl_01', new_save: 1 },
    { type: 'start_case', case_id: 'Lvl_01', new_save: null },
    { type: 'resume_run' }, { type: 'resume_run', run_id: null },
    { type: 'resume_run', run_id: 'another-owned-run-1234', state: {} },
    { type: 'identity', patch: { active_run_id: 'another-owned-run-1234' } },
  ]) assert.equal((await profile(DB, command)).status, 400);
  assert.equal(DB.count('player_runs'), 0);
  assert.equal(DB.count('profile_operations'), 0);
});

test('library, selection, run reads and settlement remain owner scoped', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  const other = { user_id: 'another-user-123', user: { id: 'another-user-123' } };
  await send(DB, { action: 'claim_session' }, handleProfileFunction, other);
  const status = await send(DB, { action: 'status' }, handleProfileFunction, other);
  assert.deepEqual(status.run_library, []);
  assert.equal(status.active_run, null);
  const envelope = { action: 'command', expected_revision: 0, operation_id: operationId() };
  for (const type of ['resume_run', 'settle_case']) {
    const denied = await send(DB, { ...envelope, command: { type, run_id: first.active_run.id } }, handleProfileFunction, other);
    assert.equal(denied.code, 'RUN_NOT_FOUND');
  }
  assert.equal((await send(DB, { action: 'status', run_id: first.active_run.id }, handleRunFunction, other)).code, 'RUN_NOT_FOUND');
  assert.equal(DB.profile().active_session_id, SESSION_ID);
  assert.equal(DB.count('profile_operations'), 1);
});

test('committed old receipts reconcile after switching but new old-page actions cannot mutate saves', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  const command = { action: 'command', operation_id: operationId(), expected_revision: 0,
    run_id: first.active_run.id, command: { type: 'rest' } };
  const acknowledged = await send(DB, command, handleRunFunction);
  const second = await start(DB);
  const old = { ...rowFor(DB, first.active_run.id) };
  const replayed = await send(DB, command, handleRunFunction);
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.result, acknowledged.result);
  assert.equal(replayed.run.id, first.active_run.id);
  const denied = await act(DB, first.active_run.id, { type: 'rest' });
  assert.equal(denied.code, 'RUN_NOT_SELECTED');
  assert.deepEqual({ ...rowFor(DB, first.active_run.id) }, old);
  assert.equal(DB.count('run_operations'), 1);
  assert.equal((await send(DB, { action: 'status' })).active_run.id, second.active_run.id);
  const oldStatus = await send(DB, { action: 'status', run_id: first.active_run.id }, handleRunFunction);
  assert.equal(oldStatus.run.revision, 1);
});

test('duplicate starts and resumes replay once without reselection or repeated fees', async () => {
  const DB = authorityDB();
  const firstBody = profileCommand(DB, { type: 'start_case', case_id: 'Lvl_01', new_save: true });
  const starts = await Promise.all([send(DB, firstBody), send(DB, firstBody)]);
  assert.equal(starts[0].active_run.id, starts[1].active_run.id);
  assert.equal(DB.count('player_runs'), 1);
  const firstId = starts[0].active_run.id;
  const second = await start(DB);
  const resumeBody = profileCommand(DB, { type: 'resume_run', run_id: firstId });
  const resumed = await Promise.all([send(DB, resumeBody), send(DB, resumeBody)]);
  assert.ok(resumed.every(item => item.status === 200 && item.active_run.id === firstId));
  await profile(DB, { type: 'resume_run', run_id: second.active_run.id });
  const replay = await send(DB, resumeBody);
  assert.equal(replay.replayed, true);
  assert.equal(replay.result.run.id, firstId);
  assert.equal(replay.active_run.id, second.active_run.id);
  assert.equal(replay.profile.energy, 80);
  assert.equal(DB.count('player_runs'), 2);
});

test('a lost committed profile response stays retryable instead of rejecting a paid save receipt', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  const body = profileCommand(DB, { type: 'start_case', case_id: 'Lvl_02', new_save: true });
  const batch = DB.batch.bind(DB);
  DB.batch = async statements => {
    await batch(statements);
    throw Object.assign(new Error('Lost committed response'), { status: 400, code: 'UNEXPECTED_STORAGE_ERROR' });
  };
  const uncertain = await send(DB, body);
  assert.equal(uncertain.status, 503);
  assert.equal(uncertain.code, 'DATABASE_UNAVAILABLE');
  assert.equal(DB.count('player_runs'), 2);
  assert.equal(DB.count('profile_operations'), 2);
  DB.batch = batch;
  const replay = await send(DB, body);
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  assert.notEqual(replay.active_run.id, first.active_run.id);
  assert.equal(replay.active_run.case_id, 'Lvl_02');
  assert.equal(replay.profile.energy, 85);
  assert.equal(DB.count('player_runs'), 2);
  assert.equal(DB.count('profile_operations'), 2);
});

test('concurrent new starts or a start versus resume commit only one profile choice', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  const revision = Number(DB.profile().profile_revision);
  const starts = await Promise.all([start(DB), start(DB)]);
  assert.deepEqual(starts.map(item => item.status).sort(), [200, 409]);
  assert.equal(DB.count('player_runs'), 2);
  assert.equal(Number(DB.profile().profile_revision), revision + 1);
  assert.equal(JSON.parse(DB.profile().profile_json).energy, 80);
  const contenders = await Promise.all([
    start(DB), profile(DB, { type: 'resume_run', run_id: first.active_run.id }),
  ]);
  assert.deepEqual(contenders.map(item => item.status).sort(), [200, 409]);
  const current = await send(DB, { action: 'status' });
  assert.equal(current.run_library.filter(row => row.selected).length, 1);
});

test('a switch racing a run commit blocks the old action without an orphaned receipt', async () => {
  let target = null;
  const DB = authorityDB({}, { beforeBatch(sqlite) {
    if (!target) return;
    const raw = JSON.parse(DB.profile().profile_json);
    sqlite.prepare('UPDATE profiles SET profile_json = ?, profile_revision = profile_revision + 1 WHERE user_id = ?')
      .run(JSON.stringify({ ...raw, active_run_id: target }), USER_ID);
    target = null;
  } });
  const first = await start(DB);
  const second = await start(DB);
  target = first.active_run.id;
  const denied = await act(DB, second.active_run.id, { type: 'rest' });
  assert.equal(denied.code, 'RUN_NOT_SELECTED');
  assert.equal(rowFor(DB, second.active_run.id).run_revision, 0);
  assert.equal(DB.count('run_operations'), 0);
});

test('each save settles once, settling another save preserves selection, and terminal history is read only', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  await act(DB, first.active_run.id, { type: 'abandon' });
  const second = await start(DB);
  await act(DB, second.active_run.id, { type: 'abandon' });
  const settledFirst = await profile(DB, { type: 'settle_case', run_id: first.active_run.id });
  assert.equal(settledFirst.active_run.id, second.active_run.id);
  assert.equal(settledFirst.profile.active_run_id, second.active_run.id);
  const same = await profile(DB, { type: 'settle_case', run_id: first.active_run.id });
  assert.equal(same.result.duplicate, true);
  assert.deepEqual(same.profile.rewarded_runs, [first.active_run.id]);
  const settledSecond = await profile(DB, { type: 'settle_case', run_id: second.active_run.id });
  assert.equal(settledSecond.active_run, null);
  assert.equal(settledSecond.profile.active_run_id, null);
  assert.deepEqual(new Set(settledSecond.profile.rewarded_runs), new Set([first.active_run.id, second.active_run.id]));
  const frozen = { ...rowFor(DB, first.active_run.id) };
  const resume = await profile(DB, { type: 'resume_run', run_id: first.active_run.id });
  assert.equal(resume.result.error, 'run_not_resumable');
  assert.equal(resume.active_run, null);
  assert.equal((await act(DB, first.active_run.id, { type: 'rest' })).code, 'RUN_SETTLED');
  assert.deepEqual({ ...rowFor(DB, first.active_run.id) }, frozen);
});

test('settling the selected save does not silently resume an older paused save', async () => {
  const DB = authorityDB();
  const old = await start(DB);
  const current = await start(DB);
  await act(DB, current.active_run.id, { type: 'abandon' });
  await profile(DB, { type: 'settle_case', run_id: current.active_run.id });
  const status = await send(DB, { action: 'status' });
  assert.equal(status.active_run, null);
  assert.equal(status.run_library.find(row => row.id === old.active_run.id).selected, false);
  assert.equal((await profile(DB, { type: 'resume_run', run_id: old.active_run.id })).active_run.id, old.active_run.id);
});

test('new-save and selection transaction rollback preserve original funds and current save', async () => {
  let fail = false;
  const DB = authorityDB({}, { failBatch: () => fail });
  const first = await start(DB);
  const second = await start(DB);
  const before = { ...DB.profile() };
  const operations = DB.count('profile_operations');
  fail = true;
  await assert.rejects(start(DB), /Simulated storage failure/);
  await assert.rejects(profile(DB, { type: 'resume_run', run_id: first.active_run.id }), /Simulated storage failure/);
  assert.deepEqual({ ...DB.profile() }, before);
  assert.equal(DB.count('player_runs'), 2);
  assert.equal(DB.count('profile_operations'), operations);
  fail = false;
  assert.equal((await send(DB, { action: 'status' })).active_run.id, second.active_run.id);
});

test('legacy missing pointers survive reads and ordinary profile writes; explicit null stays empty', async () => {
  const DB = authorityDB();
  const first = await start(DB);
  const raw = JSON.parse(DB.profile().profile_json);
  delete raw.active_run_id;
  DB.sqlite.prepare('UPDATE profiles SET profile_json = ? WHERE user_id = ?').run(JSON.stringify(raw), USER_ID);
  assert.equal((await send(DB, { action: 'status' })).active_run.id, first.active_run.id);
  const written = await profile(DB, { type: 'save_team', team_config: { specs: [{}, {}, {}] } });
  assert.equal(written.active_run.id, first.active_run.id);
  assert.equal(JSON.parse(DB.profile().profile_json).active_run_id, first.active_run.id);
  const explicit = { ...JSON.parse(DB.profile().profile_json), active_run_id: null };
  DB.sqlite.prepare('UPDATE profiles SET profile_json = ? WHERE user_id = ?').run(JSON.stringify(explicit), USER_ID);
  assert.equal((await send(DB, { action: 'status' })).active_run, null);
  assert.equal((await profile(DB, { type: 'save_team', team_config: { specs: [{}, {}, {}] } })).active_run, null);
});

test('run-library migration preserves every row, paid proof and legacy selection without rewriting explicit null', () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql', '0002_reset_for_firebase.sql', '0003_profile_operations.sql', '0004_authoritative_state.sql']) {
    sqlite.exec(readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'));
  }
  for (const [index, raw] of [[1, JSON.stringify({ gold: 2500, rewarded_runs: ['old-paid-run'] })],
    [2, JSON.stringify({ gold: 25, active_run_id: null })], [3, '{"gold":']]) {
    const owner = `migration-user-${index}`;
    sqlite.prepare('INSERT INTO users(id,email) VALUES (?,?)').run(owner, `${index}@example.com`);
    sqlite.prepare('INSERT INTO profiles(user_id,profile_json) VALUES (?,?)').run(owner, raw);
    if (index === 3) continue;
    sqlite.prepare(`INSERT INTO profile_operations(user_id,operation_id,base_revision,result_revision,patch_hash)
      VALUES (?,'migration-paid-start',0,1,'original-hash')`).run(owner);
    sqlite.prepare('INSERT INTO player_runs(id,user_id,start_operation_id,run_json) VALUES (?,?,?,?)')
      .run(`migration-run-${index}`, owner, 'migration-paid-start', '{"original":"unchanged"}');
  }
  sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0005_run_library.sql', import.meta.url), 'utf8'));
  const rows = sqlite.prepare('SELECT * FROM profiles ORDER BY user_id').all();
  assert.deepEqual(JSON.parse(rows[0].profile_json), { gold: 2500, rewarded_runs: ['old-paid-run'], active_run_id: 'migration-run-1' });
  assert.deepEqual(JSON.parse(rows[1].profile_json), { gold: 25, active_run_id: null });
  assert.equal(rows[2].profile_json, '{"gold":');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM player_runs').get().n, 2);
  assert.ok(sqlite.prepare('SELECT run_json FROM player_runs').all().every(row => row.run_json === '{"original":"unchanged"}'));
  const indexes = sqlite.prepare("PRAGMA index_list('player_runs')").all();
  assert.equal(indexes.some(row => row.name === 'idx_player_runs_active'), false);
  assert.equal(indexes.find(row => row.name === 'idx_player_runs_library').unique, 0);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  sqlite.close();
});
