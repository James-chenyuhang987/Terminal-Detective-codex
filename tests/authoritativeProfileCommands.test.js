import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProfileCommand, authoritativeProfile, prepareCaseStart, validateProfileCommand,
} from '../server/gameAuthority/profileCommands.js';

const now = new Date('2026-09-05T12:00:00Z');
const initial = overrides => authoritativeProfile(overrides || {}, now);

test('authoritative economy accepts only explicit intent fields', () => {
  for (const command of [null, [], {}, { type: 'toString' }, { type: 'reset' },
    { type: 'checkin', now }, { type: 'claim_task', kind: 'other', task_id: 'day1' },
    { type: 'identity', patch: { energy: 180 } }, { type: 'purchase_item', item_id: 'energy_cell', quantity: -1 },
    { type: 'purchase_item', item_id: 'energy_cell', price: 0 },
    { type: 'start_case', case_id: 'Lvl_01', effects: { initial_ap_bonus: 999 } },
    { type: 'settle_case', run_id: 'test-run', summary: { xp_gain: 99999 } }]) {
    assert.throws(() => validateProfileCommand(command), error => error.code === 'INVALID_COMMAND');
  }
});

test('canonical team is derived from owned slots and specialty budgets', () => {
  const profile = initial();
  const started = prepareCaseStart(profile, { type: 'start_case', case_id: 'Lvl_01' }, now);
  assert.equal(started.cost, 20);
  assert.equal(started.profile.energy, 100);
  assert.ok(started.teamConfig);
  for (const team_config of [
    { specs: [{}, {}, {}], initial_ap_bonus: 999 },
    { specs: [{ logic_power: 21 }, {}, {}] },
    { specs: [{ hack_level: 1 }, {}, {}] },
    { specs: [{ logic_power: -1 }, {}, {}] },
    { specs: [{}, {}, {}], core_agent_ids: ['not-owned', 'not-owned', 'not-owned'] },
  ]) assert.throws(() => prepareCaseStart(profile, { type: 'start_case', case_id: 'Lvl_01', team_config }, now));
});

test('unowned equipped consumables cannot grant a free paid-run bonus', () => {
  const profile = initial({ equipped_items: ['ap_booster'], inventory: { ap_booster: 0 } });
  const normal = prepareCaseStart(initial(), { type: 'start_case', case_id: 'Lvl_01' }, now);
  const noItem = prepareCaseStart(profile, { type: 'start_case', case_id: 'Lvl_01' }, now);
  assert.deepEqual(noItem.effects, normal.effects);
});

test('mail claims require canonical progress and one permitted reply', () => {
  let profile = initial();
  assert.equal(applyProfileCommand(profile, { type: 'mail_read', mail_id: 'case1' }, now).error, 'mail_locked');
  assert.equal(applyProfileCommand(profile, { type: 'mail_read', mail_id: 'tech' }, now).error, 'mail_locked');
  profile = initial({ solved_cases: ['Lvl_01'] });
  assert.throws(() => applyProfileCommand(profile, { type: 'mail_reply', mail_id: 'case1', choice_id: 'case1:9' }, now));
  const reply = applyProfileCommand(profile, { type: 'mail_reply', mail_id: 'case1', choice_id: 'case1:0' }, now);
  assert.deepEqual(reply.profile.mail_reply_choices, ['case1:0']);
  assert.equal(reply.profile.gold, 0);
  assert.equal(applyProfileCommand(reply.profile, { type: 'mail_reply', mail_id: 'case1', choice_id: 'case1:1' }, now).error, 'already_claimed');
});

test('skills cannot be unlocked from caller selected IDs or duplicated identified rows', () => {
  const profile = initial();
  const locked = applyProfileCommand(profile, { type: 'skill_loadout', skill_loadout: [['s0_1'], [], []] }, now);
  assert.equal(locked.error, 'skill_locked');
  assert.throws(() => applyProfileCommand(profile, {
    type: 'skill_loadout', skill_loadout: [{ agent_id: 'fake', skill_ids: [] }, [], []],
  }, now));
});
