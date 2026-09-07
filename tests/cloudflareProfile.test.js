import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProfileFunction, handleCurrentUser } from '../cloudflare/worker/profile.js';
import { authorityDB, USER_ID, SESSION_ID, session, request } from './cloudflareAuthorityDB.js';

let sequence = 0;
function envelope(command, revision = 0, operationId = `profile-operation-${++sequence}`) {
  return { action: 'command', operation_id: operationId, expected_revision: revision, command };
}
async function send(DB, body, owner = session) {
  const response = await handleProfileFunction(request(body), { DB }, owner);
  return { status: response.status, ...(await response.json()) };
}

test('forged economic patches, raw snapshots and summaries all fail closed without writes', async () => {
  const DB = authorityDB({ gold: 50, rewarded_runs: ['legitimate-run'] });
  const initial = DB.profile().profile_json;
  for (const body of [
    { action: 'patch', patch: { gold: 99999999, diamonds: 99999999, energy: 120, rewarded_runs: [] } },
    envelope({ type: 'reset' }), envelope({ type: 'import', profile: { gold: 99999999 } }),
    envelope({ type: 'identity', patch: { gold: 99999999 } }),
    envelope({ type: 'checkin', now: '2099-01-01' }),
    envelope({ type: 'settle_case', run_id: 'forged-run-123456', summary: { score: 'S', xp_gain: 999999 } }),
    { ...envelope({ type: 'checkin' }), profile: { gold: 9999999 } },
  ]) assert.equal((await send(DB, body)).status, 400);
  assert.equal(DB.profile().profile_revision, 0);
  assert.equal(DB.count('profile_operations'), 0);
  assert.equal(JSON.parse(DB.profile().profile_json).gold, JSON.parse(initial).gold);
});

test('malformed revisions, IDs, JSON and oversized bodies are rejected', async () => {
  const DB = authorityDB();
  for (const expected_revision of [-1, 1.5, '0', Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.equal((await send(DB, envelope({ type: 'checkin' }, expected_revision))).status, 400);
  }
  for (const operation_id of ['', 'short', 'invalid-operation-漢字']) {
    assert.equal((await send(DB, { ...envelope({ type: 'checkin' }), operation_id })).status, 400);
  }
  for (const payload of ['{broken', 'x'.repeat(33 * 1024)]) {
    const response = await handleProfileFunction(new Request('https://game.example/profile', { method: 'POST', body: payload }), { DB }, session);
    assert.ok([400, 413].includes(response.status));
  }
  assert.equal(DB.count('profile_operations'), 0);
});

test('empty profiles initialize once; status cannot reset consumed energy or reward markers', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-05T00:00:00Z') });
  const DB = authorityDB();
  const initial = await send(DB, { action: 'status' });
  assert.equal(initial.authority_version, 1);
  assert.equal(initial.profile.energy, 120);
  assert.equal(initial.profile.home_progress_version, 2);
  assert.equal(initial.profile.agent_progression.length, 3);
  assert.equal(DB.profile().authority_version, 1);
  const started = await send(DB, envelope({ type: 'start_case', case_id: 'Lvl_01' }));
  assert.equal(started.status, 200);
  assert.equal(started.profile.energy, 100);
  const status = await send(DB, { action: 'status' });
  assert.equal(status.profile.energy, 100);
  assert.equal(status.active_run.id, started.result.run.id);
  const current = await handleCurrentUser(new Request('https://game.example/me'), { DB }, session);
  const me = await current.json();
  assert.equal(me.authority_version, 1);
  assert.equal(me.profile.energy, 100);
  assert.equal(me.gold, me.profile.gold);
});

test('existing D1 baseline is preserved instead of reinitialized from default resources', async () => {
  const DB = authorityDB({ gold: 2500, diamonds: 45, energy: 12, rewarded_runs: ['old-paid-run'], xp: 55, level: 2 });
  const result = await send(DB, { action: 'claim_session' });
  assert.equal(result.profile.gold, 2500);
  assert.equal(result.profile.diamonds, 45);
  assert.equal(result.profile.energy, 12);
  assert.deepEqual(result.profile.rewarded_runs, ['old-paid-run']);
  assert.equal(result.profile.xp, 55);
  assert.equal(result.profile.profile_revision, 0);
});

test('corrupt stored profile fails without replacement', async () => {
  const DB = authorityDB('{"gold":');
  await assert.rejects(send(DB, { action: 'status' }), cause => cause.code === 'PROFILE_DATA_CORRUPT');
  assert.equal(DB.profile().profile_json, '{"gold":');
  assert.equal(DB.profile().authority_version, 0);
});

test('purchases use server prices and reject unaffordable or repeated spending', async () => {
  const DB = authorityDB({ gold: 500 });
  const first = await send(DB, envelope({ type: 'purchase_item', item_id: 'energy_cell', quantity: 1 }));
  assert.equal(first.status, 200);
  assert.equal(first.profile.gold, 100);
  assert.equal(first.profile.inventory.energy_cell, 1);
  const rejected = await send(DB, envelope({ type: 'purchase_item', item_id: 'energy_cell', quantity: 1 }, 1));
  assert.equal(rejected.status, 200);
  assert.equal(rejected.result.error, 'insufficient_funds');
  assert.equal(rejected.profile.gold, 100);
  assert.equal(rejected.profile.inventory.energy_cell, 1);
  assert.equal(rejected.profile.profile_revision, 2);
});

test('checkin uses trusted server clock, one daily claim, and identical lost-response replay', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-05T00:00:00Z') });
  const DB = authorityDB();
  const body = envelope({ type: 'checkin' });
  const first = await send(DB, body);
  assert.equal(first.profile.gold, 500);
  assert.equal(first.profile.last_checkin, '2026-09-05');
  const duplicate = await send(DB, envelope({ type: 'checkin' }, 1));
  assert.equal(duplicate.result.error, 'already_claimed');
  t.mock.timers.tick(86400000);
  const replay = await send(DB, body);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.profile.gold, 500);
  const next = await send(DB, envelope({ type: 'checkin' }, 2));
  assert.equal(next.profile.diamonds, 10);
  assert.equal(next.profile.checkin_streak, 2);
});

test('business rejection is replayed unchanged even after later balance changes', async () => {
  const DB = authorityDB();
  const body = envelope({ type: 'purchase_item', item_id: 'energy_cell' });
  const failed = await send(DB, body);
  await send(DB, envelope({ type: 'checkin' }, 1));
  const replay = await send(DB, body);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, failed.result);
  assert.equal(replay.profile.gold, 500);
});

test('profile CAS prevents concurrent spending and ledger operation ID reuse', async () => {
  const DB = authorityDB({ gold: 800 });
  const body = envelope({ type: 'purchase_item', item_id: 'energy_cell' });
  const results = await Promise.all([send(DB, body), send(DB, envelope({ type: 'purchase_item', item_id: 'energy_cell' }))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(DB.count('profile_operations'), 1);
  assert.equal(JSON.parse(DB.profile().profile_json).gold, 400);
  const reused = await send(DB, { ...body, command: { type: 'checkin' } });
  assert.equal(reused.code, 'OPERATION_ID_REUSED');
});

test('duplicate concurrent request commits only once and returns same result', async () => {
  const DB = authorityDB({ gold: 800 });
  const body = envelope({ type: 'purchase_item', item_id: 'energy_cell' });
  const [first, second] = await Promise.all([send(DB, body), send(DB, body)]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(first.result, second.result);
  assert.equal(DB.count('profile_operations'), 1);
  assert.equal(JSON.parse(DB.profile().profile_json).gold, 400);
});

test('takeover rejects pending command including a race at commit and replay', async () => {
  let takeover = false;
  const DB = authorityDB({ gold: 800 }, { beforeBatch(sqlite) {
    if (takeover) sqlite.prepare('UPDATE profiles SET active_session_id = ? WHERE user_id = ?').run('other-session-123456', USER_ID);
  } });
  const firstBody = envelope({ type: 'purchase_item', item_id: 'energy_cell' });
  await send(DB, firstBody);
  takeover = true;
  const refused = await send(DB, envelope({ type: 'purchase_item', item_id: 'energy_cell' }, 1));
  assert.equal(refused.code, 'SESSION_TAKEN');
  assert.equal((await send(DB, firstBody)).code, 'SESSION_TAKEN');
  assert.equal(DB.profile().profile_revision, 1);
  assert.equal(DB.count('profile_operations'), 1);
  const claimed = await send(DB, { action: 'claim_session' });
  assert.equal(claimed.profile.active_session_id, SESSION_ID);
  assert.equal(claimed.profile.profile_revision, 1);
});

test('newly claimed device can replay a prior intent without including device in operation hash', async () => {
  const DB = authorityDB({ gold: 800 });
  const body = envelope({ type: 'purchase_item', item_id: 'energy_cell' });
  const first = await send(DB, body);
  const replacement = 'replacement-device-123456';
  await send(DB, { action: 'claim_session', session_id: replacement });
  const replay = await send(DB, { ...body, session_id: replacement });
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.profile.active_session_id, replacement);
  assert.equal(replay.profile.gold, 400);
  assert.equal((await send(DB, body)).code, 'SESSION_TAKEN');
});

test('owner comes solely from verified Firebase session, not headers or command owner', async () => {
  const DB = authorityDB({ gold: 50 });
  assert.equal((await send(DB, { action: 'status' })).profile.gold, 50);
  assert.equal(DB.profile('another-user-123'), undefined);
  assert.equal((await send(DB, { ...envelope({ type: 'checkin' }), user_id: 'another-user-123' })).status, 400);
});

test('invalid task namespaces cannot bypass day/claim gates and renames are not unlimited', async () => {
  const DB = authorityDB();
  assert.equal((await send(DB, envelope({ type: 'claim_task', kind: 'forged', task_id: 'day1' }))).status, 400);
  assert.equal((await send(DB, envelope({ type: 'identity', patch: { detective_name: 'First' } }))).profile.rename_count, 1);
  assert.equal((await send(DB, envelope({ type: 'identity', patch: { detective_name: 'Second' } }, 1))).result.error, 'rename_used');
});

test('raw team effects, specialty inflation, unowned agents and locked skills cannot deploy', async () => {
  const DB = authorityDB();
  for (const team_config of [
    { specs: [{}, {}, {}], initial_ap_bonus: 999 },
    { specs: [{ logic_power: 21 }, {}, {}] },
    { specs: [{ logic_power: -1 }, {}, {}] },
    { specs: [{ hack_level: 20 }, {}, {}] },
    { specs: [{}, {}, {}], core_agent_ids: ['SOVEREIGN-01', 'AURORA-09', 'CIPHER-47'] },
  ]) assert.equal((await send(DB, envelope({ type: 'start_case', case_id: 'Lvl_01', team_config }))).status, 400);
  const locked = await send(DB, envelope({ type: 'skill_loadout', skill_loadout: [['s0_1'], [], []] }));
  assert.equal(locked.result.error, 'skill_locked');
  assert.equal(DB.count('player_runs'), 0);
});

test('paid start response replays identically after regeneration and duplicate starts never charge', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-05T00:00:00Z') });
  const DB = authorityDB();
  const body = envelope({ type: 'start_case', case_id: 'Lvl_01' });
  const started = await send(DB, body);
  assert.equal(started.result.cost, 20);
  assert.equal(started.profile.energy, 100);
  t.mock.timers.tick(30 * 60 * 1000);
  const replay = await send(DB, body);
  assert.deepEqual(replay.result, started.result);
  assert.equal(replay.profile.energy, 106);
  const duplicate = await send(DB, envelope({ type: 'start_case', case_id: 'Lvl_03' }, 1));
  assert.equal(duplicate.result.error, 'active_run_exists');
  assert.equal(duplicate.profile.energy, 106);
  assert.equal(DB.count('player_runs'), 1);
});

test('paid start transaction rollback leaves neither debit nor orphaned run/ledger', async () => {
  const DB = authorityDB({}, { failBatch: () => true });
  await assert.rejects(send(DB, envelope({ type: 'start_case', case_id: 'Lvl_01' })), /Simulated storage failure/);
  assert.equal(DB.profile().profile_revision, 0);
  assert.equal(JSON.parse(DB.profile().profile_json).energy, 120);
  assert.equal(DB.count('player_runs'), 0);
  assert.equal(DB.count('profile_operations'), 0);
});

test('a forged or active run cannot settle, and insufficient energy cannot create paid proof', async () => {
  const DB = authorityDB({ energy: 0 });
  const start = await send(DB, envelope({ type: 'start_case', case_id: 'Lvl_01' }));
  assert.equal(start.result.error, 'insufficient_energy');
  assert.equal(DB.count('player_runs'), 0);
  assert.equal((await send(DB, envelope({ type: 'settle_case', run_id: 'forged-run-123456' }, 1))).status, 404);
  const ready = authorityDB();
  const run = (await send(ready, envelope({ type: 'start_case', case_id: 'Lvl_01' }))).result.run;
  const settlement = await send(ready, envelope({ type: 'settle_case', run_id: run.id }, 1));
  assert.notEqual(settlement.status, 200);
  assert.equal(ready.profile().profile_revision, 1);
});
