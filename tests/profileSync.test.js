import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySettlementToProfile,
  clearPendingProfileWrite,
  diffProfileWrite,
  enqueuePendingProfileWrite,
  enqueuePendingSettlement,
  knownAchievementCount,
  invokePlayerProfile,
  isRetryableProfileError,
  migrateProfileV2,
  normalizeAgentProgression,
  normalizeSkillLoadout,
  readPendingSettlements,
  readPendingProfileWrite,
  removePendingSettlement,
  sanitizeProfileWrite,
  sanitizeProfilePatch,
} from '../src/game/playerProfile.js';
import { normalizeProfile } from '../src/game/homeProgress.js';
import { normalizeSavedTeamConfig } from '../src/game/teamConfig.js';
import {
  applyPendingProfileOperations,
  appendProfileOperation,
  clearProfileOperations,
  createProfileOperationId,
  profileWalInternals,
  readProfileOperations,
  removeProfileOperation,
  updateProfileOperation,
} from '../src/game/profileWal.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('profile writes use an explicit allowlist and never echo provider metadata', () => {
  const clean = sanitizeProfileWrite({
    detective_name: '玄影', gold: 100, id: 'readonly', email: 'secret@example.com',
    role: 'admin', created_date: 'yesterday', updated_date: 'today', created_by: 'system',
    profile_revision: 99, active_session_id: 'other-device', surprise: 'nope',
  });
  assert.equal(clean.detective_name, '玄影');
  assert.equal(clean.gold, 100);
  ['id', 'email', 'role', 'created_date', 'updated_date', 'created_by', 'surprise', 'profile_revision', 'active_session_id']
    .forEach(key => assert.equal(Object.hasOwn(clean, key), false, key));
});

test('profile patches contain only real identity changes', () => {
  const before = normalizeProfile({
    detective_name: '', avatar: '🕵️', energy: 120, energy_updated_at: null,
    gold: 100, diamonds: 10,
  });
  const after = normalizeProfile({
    ...before,
    detective_name: '玄影', avatar: '🦉', signature: '真相只有一个',
    identity_badge: 'bureau', detective_tags: ['冷静', '技术流'],
  });
  assert.deepEqual(diffProfileWrite(before, after), {
    detective_name: '玄影', avatar: '🦉', signature: '真相只有一个',
    identity_badge: 'bureau', detective_tags: ['冷静', '技术流'],
  });
  assert.deepEqual(sanitizeProfilePatch({ detective_name: '  玄影  ' }), { detective_name: '玄影' });
  assert.equal(sanitizeProfilePatch({ detective_name: '玄影', role: 'admin' }), null);
});

test('v1 local migration merges only once and validates chained skills', () => {
  const storage = memoryStorage({
    agent_progression_v1: JSON.stringify([{ xp: 500 }, { xp: 0 }, { xp: 0 }]),
    agent_rewarded_runs_v1: JSON.stringify(['legacy-run']),
    skill_equipped_v1: JSON.stringify([['s0_1', 's0_2'], [], []]),
    save_team_config: JSON.stringify({
      specs: [{ logic_power: 4 }, {}, {}],
      priorities: [['hack_system'], [], []],
      primary_agent_index: 2,
    }),
  });
  const migrated = migrateProfileV2({ home_progress_version: 1, agent_progression: [{ xp: 100 }] }, storage);
  assert.equal(migrated.home_progress_version, 2);
  assert.equal(migrated.agent_progression[0].xp, 500);
  assert.deepEqual(migrated.skill_loadout[0].skill_ids, ['s0_1']);
  assert.ok(migrated.rewarded_runs.includes('legacy-run'));
  assert.equal(migrated.saved_team_config.primary_agent_index, 2);
  assert.equal(migrated.saved_team_config.priorities[0][0], 'hack_terminal');

  storage.setItem('agent_progression_v1', JSON.stringify([{ xp: 9999 }]));
  const repeated = migrateProfileV2(migrated, storage);
  assert.equal(repeated.agent_progression[0].xp, 500);
});

test('agent progression, skill loadout and team primary index normalize deterministically', () => {
  const progression = normalizeAgentProgression([{ agent_id: 'AURORA-09', xp: 300 }]);
  assert.deepEqual(progression.map(row => row.xp), [0, 300, 0]);
  const skills = normalizeSkillLoadout([
    { agent_id: 'AURORA-09', skill_ids: ['s1_1', 'unknown', 's1_2'] },
  ], progression);
  assert.deepEqual(skills[1].skill_ids, ['s1_1']);
  assert.equal(normalizeSavedTeamConfig({ specs: [{}, {}, {}], primary_agent_index: 8 }).primary_agent_index, 2);
  assert.equal(normalizeSavedTeamConfig({ specs: [{}] }), null);
});

test('settlement outbox persists and removes individual runs', () => {
  const storage = memoryStorage();
  enqueuePendingSettlement({ run_id: 'run-a', score: 'A' }, storage);
  enqueuePendingSettlement({ run_id: 'run-b', score: 'B' }, storage);
  enqueuePendingSettlement({ run_id: 'run-a', score: 'S' }, storage);
  assert.deepEqual(
    readPendingSettlements(storage).map(item => [item.run_id, item.score]).sort(),
    [['run-a', 'S'], ['run-b', 'B']],
  );
  removePendingSettlement('run-b', storage);
  assert.deepEqual(readPendingSettlements(storage).map(item => item.run_id), ['run-a']);
  enqueuePendingSettlement({ run_id: 'account-a-run' }, storage, 'account-a');
  enqueuePendingSettlement({ run_id: 'account-b-run' }, storage, 'account-b');
  assert.deepEqual(readPendingSettlements(storage, 'account-a').map(item => item.run_id), ['account-a-run']);
  assert.deepEqual(readPendingSettlements(storage, 'account-b').map(item => item.run_id), ['account-b-run']);
  enqueuePendingSettlement({ run_id: 'slash-owner-run' }, storage, 'account/a');
  enqueuePendingSettlement({ run_id: 'underscore-owner-run' }, storage, 'account_a');
  assert.deepEqual(readPendingSettlements(storage, 'account/a').map(item => item.run_id), ['slash-owner-run']);
  assert.deepEqual(readPendingSettlements(storage, 'account_a').map(item => item.run_id), ['underscore-owner-run']);
});

test('profile WAL isolates owners, verifies records and updates operations atomically', () => {
  const storage = memoryStorage();
  const operationId = createProfileOperationId(() => '12345678-1234-1234-1234-123456789012');
  appendProfileOperation({
    ownerUid: 'firebase-user-a',
    operationId,
    patch: { gold: 125 },
    baseRevision: 7,
    createdAt: '2026-09-02T00:00:00.000Z',
  }, storage);
  appendProfileOperation({
    ownerUid: 'firebase-user-b',
    patch: { gold: 50 },
    baseRevision: 2,
  }, storage);

  assert.equal(readProfileOperations('firebase-user-a', storage).length, 1);
  assert.equal(readProfileOperations('firebase-user-b', storage).length, 1);
  const updated = updateProfileOperation('firebase-user-a', operationId, {
    baseRevision: 8,
    incrementAttempts: true,
  }, storage);
  assert.equal(updated.baseRevision, 8);
  assert.equal(updated.attempts, 1);
  assert.deepEqual(updated.patch, { gold: 125 });
  assert.deepEqual(removeProfileOperation('firebase-user-a', operationId, storage), []);
  assert.equal(readProfileOperations('firebase-user-b', storage).length, 1);
  assert.notEqual(
    profileWalInternals.operationKey('firebase-user-a', operationId),
    profileWalInternals.operationKey('firebase-user-b', operationId),
  );
  clearProfileOperations('firebase-user-b', storage);
  assert.deepEqual(readProfileOperations('firebase-user-b', storage), []);
});

test('profile WAL stores operations independently and migrates legacy documents', () => {
  const ownerUid = 'firebase-user';
  const storage = memoryStorage();
  const firstId = 'profile-operation-0001';
  const secondId = 'profile-operation-0002';
  const first = appendProfileOperation({
    ownerUid,
    operationId: firstId,
    patch: { gold: 10 },
    baseRevision: 0,
    createdAt: '2026-09-02T00:00:00.000Z',
  }, storage);
  appendProfileOperation({
    ownerUid,
    operationId: secondId,
    patch: { gold: 20 },
    baseRevision: 0,
    createdAt: '2026-09-02T00:00:01.000Z',
  }, storage);

  removeProfileOperation(ownerUid, firstId, storage);
  assert.equal(storage.getItem(profileWalInternals.operationKey(ownerUid, firstId)), null);
  assert.notEqual(storage.getItem(profileWalInternals.operationKey(ownerUid, secondId)), null);
  assert.deepEqual(readProfileOperations(ownerUid, storage).map(entry => entry.operationId), [secondId]);

  clearProfileOperations(ownerUid, storage);
  const legacyKey = profileWalInternals.ownerKey(ownerUid);
  storage.setItem(legacyKey, JSON.stringify({
    version: 1,
    ownerUid,
    entries: [first],
  }));
  assert.deepEqual(readProfileOperations(ownerUid, storage).map(entry => entry.operationId), [firstId]);
  assert.equal(storage.getItem(legacyKey), null);
  assert.notEqual(storage.getItem(profileWalInternals.operationKey(ownerUid, firstId)), null);
});

test('legacy WAL migration preserves insertion order when timestamps tie', () => {
  const ownerUid = 'firebase-user';
  const storage = memoryStorage();
  const newerValue = appendProfileOperation({
    ownerUid,
    operationId: 'profile-operation-z',
    patch: { gold: 10 },
    baseRevision: 0,
    createdAt: '2026-09-02T00:00:00.000Z',
  }, storage);
  clearProfileOperations(ownerUid, storage);
  const latestValue = appendProfileOperation({
    ownerUid,
    operationId: 'profile-operation-a',
    patch: { gold: 20 },
    baseRevision: 0,
    createdAt: '2026-09-02T00:00:00.000Z',
  }, storage);
  clearProfileOperations(ownerUid, storage);
  storage.setItem(profileWalInternals.ownerKey(ownerUid), JSON.stringify({
    version: 1,
    ownerUid,
    entries: [newerValue, latestValue],
  }));

  assert.deepEqual(
    readProfileOperations(ownerUid, storage).map(entry => entry.operationId),
    ['profile-operation-z', 'profile-operation-a'],
  );
  assert.equal(applyPendingProfileOperations({}, readProfileOperations(ownerUid, storage)).gold, 20);
});

test('profile WAL rejects conflicting legacy and per-operation records', () => {
  const ownerUid = 'firebase-user';
  const operationId = 'profile-operation-conflict';
  const storage = memoryStorage();
  const entry = appendProfileOperation({
    ownerUid,
    operationId,
    patch: { gold: 10 },
    baseRevision: 0,
    createdAt: '2026-09-02T00:00:00.000Z',
  }, storage);
  const conflictingCore = {
    version: entry.version,
    ownerUid: entry.ownerUid,
    operationId: entry.operationId,
    lineageId: entry.lineageId,
    patch: { gold: 11 },
    baseRevision: entry.baseRevision,
    createdAt: entry.createdAt,
    attempts: entry.attempts,
    status: entry.status,
  };
  const conflictingEntry = {
    ...conflictingCore,
    checksum: profileWalInternals.checksumValue(conflictingCore),
  };
  storage.setItem(profileWalInternals.ownerKey(ownerUid), JSON.stringify({
    version: 1,
    ownerUid,
    entries: [conflictingEntry],
  }));

  assert.throws(
    () => readProfileOperations(ownerUid, storage),
    error => error.code === 'PROFILE_WAL_OPERATION_REUSED',
  );
  clearProfileOperations(ownerUid, storage);
  assert.deepEqual(readProfileOperations(ownerUid, storage), []);
});

test('remaining WAL operations are reapplied in order after a cloud response', () => {
  const cloud = { profile_revision: 8, gold: 100, diamonds: 4 };
  const optimistic = applyPendingProfileOperations(cloud, [
    { patch: { gold: 125 } },
    { patch: { gold: 90, diamonds: 7 } },
  ]);
  assert.deepEqual(optimistic, {
    profile_revision: 8,
    gold: 90,
    diamonds: 7,
  });
  assert.deepEqual(cloud, { profile_revision: 8, gold: 100, diamonds: 4 });
});

test('sequential offline WAL entries preserve patches when their revisions advance', () => {
  const storage = memoryStorage();
  const ownerUid = 'firebase-user';
  appendProfileOperation({
    ownerUid,
    operationId: 'profile-operation-0001',
    lineageId: 'web-session-00000001',
    patch: { gold: 75 },
    baseRevision: 4,
  }, storage);
  appendProfileOperation({
    ownerUid,
    operationId: 'profile-operation-0002',
    lineageId: 'web-session-00000001',
    patch: { diamonds: 5 },
    baseRevision: 4,
  }, storage);

  const advanced = updateProfileOperation(ownerUid, 'profile-operation-0002', {
    baseRevision: 5,
  }, storage);
  assert.equal(advanced.baseRevision, 5);
  assert.equal(advanced.operationId, 'profile-operation-0002');
  assert.deepEqual(advanced.patch, { diamonds: 5 });
  assert.deepEqual(
    readProfileOperations(ownerUid, storage).map(entry => entry.baseRevision),
    [4, 5],
  );
  assert.throws(
    () => appendProfileOperation({
      ownerUid,
      operationId: 'profile-operation-0003',
      lineageId: 'web-session-00000002',
      patch: { gold: 50 },
      baseRevision: 5,
    }, storage),
    error => error.code === 'PROFILE_WAL_DIVERGED',
  );
});

test('new WAL entries stay after persisted future timestamps', () => {
  const storage = memoryStorage();
  const ownerUid = 'firebase-user';
  appendProfileOperation({
    ownerUid,
    operationId: 'profile-operation-future',
    patch: { gold: 10 },
    baseRevision: 0,
    createdAt: '2099-01-01T00:00:00.000Z',
  }, storage);
  appendProfileOperation({
    ownerUid,
    operationId: 'profile-operation-later',
    patch: { gold: 20 },
    baseRevision: 0,
  }, storage);

  const entries = readProfileOperations(ownerUid, storage);
  assert.deepEqual(entries.map(entry => entry.operationId), [
    'profile-operation-future',
    'profile-operation-later',
  ]);
  assert.equal(applyPendingProfileOperations({}, entries).gold, 20);
});

test('profile WAL fails closed when storage is unavailable or records are damaged', () => {
  const unavailable = {
    get length() { return 0; },
    key() { return null; },
    getItem() { return null; },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() {},
  };
  assert.throws(
    () => appendProfileOperation({
      ownerUid: 'firebase-user',
      patch: { gold: 5 },
      baseRevision: 0,
    }, unavailable),
    error => error.code === 'PROFILE_WAL_UNAVAILABLE',
  );

  const storage = memoryStorage({
    'td_profile_wal_v1:firebase-user': '{"version":1,"ownerUid":"firebase-user","entries":[{"tampered":true}]}',
  });
  assert.throws(
    () => readProfileOperations('firebase-user', storage),
    error => error.code === 'PROFILE_WAL_CORRUPT',
  );
  clearProfileOperations('firebase-user', storage);
  assert.deepEqual(readProfileOperations('firebase-user', storage), []);
});

test('profile write journal compacts absolute fields and is owner scoped', () => {
  const storage = memoryStorage();
  const first = enqueuePendingProfileWrite({ gold: 120, inventory: { energy_cell: 1 } }, storage, 'user-a', 100);
  assert.equal(first.stored, true);
  enqueuePendingProfileWrite({ gold: 90, diamonds: 20 }, storage, 'user-a', 200);
  enqueuePendingProfileWrite({ gold: 500 }, storage, 'user-b', 300);
  assert.deepEqual(readPendingProfileWrite(storage, 'user-a').patch, {
    gold: 90,
    inventory: { energy_cell: 1, ap_booster: 0, firewall_shield: 0, clue_scanner: 0 },
    diamonds: 20,
  });
  assert.deepEqual(readPendingProfileWrite(storage, 'user-b').patch, { gold: 500 });
  assert.equal(clearPendingProfileWrite(storage, 'user-a'), true);
  assert.equal(readPendingProfileWrite(storage, 'user-a'), null);
  assert.deepEqual(readPendingProfileWrite(storage, 'user-b').patch, { gold: 500 });
});

test('only transient profile failures enter the durable retry path', () => {
  assert.equal(isRetryableProfileError(Object.assign(new Error('offline'), { name: 'AbortError' })), true);
  assert.equal(isRetryableProfileError(Object.assign(new Error('quota'), { status: 429 })), true);
  assert.equal(isRetryableProfileError(Object.assign(new Error('d1'), { code: 'DATABASE_UNAVAILABLE', status: 503 })), true);
  assert.equal(isRetryableProfileError(Object.assign(new Error('bad patch'), { code: 'INVALID_PATCH', status: 400 })), false);
  assert.equal(isRetryableProfileError(Object.assign(new Error('other device'), { code: 'SESSION_TAKEN', status: 409 })), false);
});

test('unbounded rewarded run ids keep economy and agent XP idempotent after 150 runs', () => {
  const oldRuns = Array.from({ length: 175 }, (_, index) => `old-${index}`);
  const base = normalizeProfile({
    home_progress_version: 2,
    rewarded_runs: oldRuns,
    agent_progression: [
      { agent_id: 'NEXUS-01', xp: 0 }, { agent_id: 'AURORA-09', xp: 0 }, { agent_id: 'CIPHER-47', xp: 0 },
    ],
  });
  const summary = {
    run_id: 'new-run', case_id: 'Lvl_01', difficulty: 'NORMAL', score: 'B', is_passed: true,
    clues: [], valid_links: [], valid_link_count: 0, invalid_link_count: 0,
    turns: 9, ap_left: 4, confusion: 30, bsod_count: 0, clue_ratio: 0, xp_gain: 150,
  };
  const first = applySettlementToProfile(base, summary);
  assert.equal(first.profile.rewarded_runs.length, 176);
  assert.deepEqual(first.profile.agent_progression.map(row => row.xp), [150, 150, 150]);
  const duplicate = applySettlementToProfile(first.profile, summary);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.profile.agent_progression.map(row => row.xp), [150, 150, 150]);
  assert.ok(duplicate.profile.rewarded_runs.includes('old-0'));
});

test('a failed formal report grants process XP once without granting clear rewards', () => {
  const base = normalizeProfile({
    home_progress_version: 2,
    gold: 0,
    diamonds: 0,
    agent_progression: [
      { agent_id: 'NEXUS-01', xp: 0 }, { agent_id: 'AURORA-09', xp: 0 }, { agent_id: 'CIPHER-47', xp: 0 },
    ],
  });
  const summary = {
    run_id: 'failed-run', case_id: 'Lvl_01', difficulty: 'NORMAL', score: 'D', is_passed: false,
    clues: ['c_01', 'c_02', 'c_03'], valid_links: [], valid_link_count: 0, invalid_link_count: 0,
    turns: 6, ap_left: 14, confusion: 10, bsod_count: 0, clue_ratio: 1 / 3, xp_gain: 65,
  };
  const first = applySettlementToProfile(base, summary);
  assert.deepEqual(first.profile.agent_progression.map(row => row.xp), [65, 65, 65]);
  assert.equal(first.profile.xp, 65);
  assert.equal(first.profile.gold, 0);
  assert.equal(first.profile.diamonds, 0);
  assert.equal(first.profile.solved_cases.includes('Lvl_01'), false);

  const duplicate = applySettlementToProfile(first.profile, summary);
  assert.deepEqual(duplicate.profile.agent_progression.map(row => row.xp), [65, 65, 65]);
  assert.equal(duplicate.profile.xp, 65);
});

test('known achievement count ignores preserved legacy badges', () => {
  assert.equal(knownAchievementCount({ achievements: ['first_deploy', 'legacy_badge'] }), 1);
});

test('profile function preserves stable session and revision error codes', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: 'SESSION_TAKEN', message: 'active elsewhere', profile_revision: 9,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(
      invokePlayerProfile('status', { session_id: 'web-1234567890123456' }),
      error => error.code === 'SESSION_TAKEN' && error.payload.profile_revision === 9,
    );

    globalThis.fetch = async () => new Response(JSON.stringify({
      error: 'STALE_PROFILE', message: 'refresh required', profile: { profile_revision: 10 },
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(
      invokePlayerProfile('patch', { session_id: 'web-1234567890123456', expected_revision: 9, patch: {} }),
      error => error.code === 'STALE_PROFILE' && error.payload.profile.profile_revision === 10,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing profile function fails closed without writing through another endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ detail: 'Function not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    await assert.rejects(
      invokePlayerProfile('patch', {
        session_id: 'web-1234567890123456',
        expected_revision: 0,
        operation_id: 'profile-1234567890123456',
        patch: { detective_name: '玄影', avatar: '🦉' },
      }, { ownerId: 'firebase-user' }),
      error => error.code === 'PROFILE_UNAVAILABLE' && error.status === 404,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(new Headers(calls[0].options.headers).get('x-profile-owner'), 'firebase-user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('empty successful profile envelope fails closed', async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  try {
    globalThis.fetch = async () => {
      call += 1;
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await assert.rejects(
      invokePlayerProfile('status', { session_id: 'web-1234567890123456' }),
      error => error.code === 'PROFILE_UNAVAILABLE' && error.status === 502,
    );
    assert.equal(call, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
