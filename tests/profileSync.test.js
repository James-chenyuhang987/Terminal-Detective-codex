import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySettlementToProfile,
  diffProfileWrite,
  enqueuePendingSettlement,
  knownAchievementCount,
  invokePlayerProfile,
  migrateProfileV2,
  normalizeAgentProgression,
  normalizeSkillLoadout,
  readPendingSettlements,
  removePendingSettlement,
  sanitizeProfileWrite,
  sanitizeProfilePatch,
} from '../src/game/playerProfile.js';
import { normalizeProfile } from '../src/game/homeProgress.js';
import { normalizeSavedTeamConfig } from '../src/game/teamConfig.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('profile writes use an explicit allowlist and never echo Base44 metadata', () => {
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
  assert.deepEqual(readPendingSettlements(storage).map(item => [item.run_id, item.score]), [['run-b', 'B'], ['run-a', 'S']]);
  removePendingSettlement('run-b', storage);
  assert.deepEqual(readPendingSettlements(storage).map(item => item.run_id), ['run-a']);
  enqueuePendingSettlement({ run_id: 'account-a-run' }, storage, 'account-a');
  enqueuePendingSettlement({ run_id: 'account-b-run' }, storage, 'account-b');
  assert.deepEqual(readPendingSettlements(storage, 'account-a').map(item => item.run_id), ['account-a-run']);
  assert.deepEqual(readPendingSettlements(storage, 'account-b').map(item => item.run_id), ['account-b-run']);
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

test('missing profile function falls back to the authenticated user profile without false success', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/functions/playerProfile')) {
        return new Response(JSON.stringify({ detail: 'Function not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        id: 'user-1', email: 'detective@example.com', detective_name: '玄影', avatar: '🦉',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const result = await invokePlayerProfile('patch', {
      session_id: 'web-1234567890123456',
      expected_revision: 0,
      patch: { detective_name: '  玄影  ', avatar: '🦉' },
    });
    assert.equal(result.profile.detective_name, '玄影');
    assert.equal(result.compatibility_mode, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[1].options.method, 'PUT');
    assert.deepEqual(JSON.parse(calls[1].options.body), { detective_name: '玄影', avatar: '🦉' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('empty successful function envelope is treated as incompatible and reloads the real profile', async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  try {
    globalThis.fetch = async () => {
      call += 1;
      if (call === 1) {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ id: 'user-2', detective_name: '夜鸦' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const result = await invokePlayerProfile('status', { session_id: 'web-1234567890123456' });
    assert.equal(call, 2);
    assert.equal(result.profile.detective_name, '夜鸦');
    assert.equal(result.compatibility_mode, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
