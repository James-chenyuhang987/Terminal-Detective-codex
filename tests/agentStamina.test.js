import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_STAMINA_INITIAL,
  applyStaminaToTeam,
  canAgentInvestigate,
  normalizeAgentStamina,
  recoverAgentStaminaTurn,
  spendAgentStamina,
  staminaAbilityMultiplier,
} from '../src/game/agentStamina.js';
import { recommendExecutor } from '../src/game/commandSystem.js';

const ids = ['LOGIC-01', 'HACK-02', 'OBSERVE-03'];

test('agent stamina normalizes to an initial 50% and stays within 0-100', () => {
  assert.deepEqual(normalizeAgentStamina(null, ids), {
    'LOGIC-01': AGENT_STAMINA_INITIAL,
    'HACK-02': AGENT_STAMINA_INITIAL,
    'OBSERVE-03': AGENT_STAMINA_INITIAL,
  });
  assert.deepEqual(normalizeAgentStamina({
    'LOGIC-01': -30,
    'HACK-02': 140,
    'OBSERVE-03': 'bad',
  }, ids), {
    'LOGIC-01': 0,
    'HACK-02': 100,
    'OBSERVE-03': 50,
  });
});

test('interrogation spends 10% without recovery and rejects depleted agents', () => {
  const first = spendAgentStamina({ 'LOGIC-01': 50 }, 'LOGIC-01', ['LOGIC-01']);
  assert.equal(first.spent, true);
  assert.equal(first.stamina['LOGIC-01'], 40);

  const denied = spendAgentStamina({ 'LOGIC-01': 9 }, 'LOGIC-01', ['LOGIC-01']);
  assert.equal(denied.spent, false);
  assert.equal(denied.stamina['LOGIC-01'], 9);
  assert.equal(spendAgentStamina({ 'LOGIC-01': 50 }, 'UNKNOWN', ['LOGIC-01']).spent, false);
  assert.equal(canAgentInvestigate(6, true), true);
  assert.equal(canAgentInvestigate(5, true), false);
});

test('recovery adds 4% per turn and caps stamina at 100%', () => {
  assert.deepEqual(recoverAgentStaminaTurn({
    'LOGIC-01': 97,
    'HACK-02': 50,
    'OBSERVE-03': 0,
  }, ids), {
    'LOGIC-01': 100,
    'HACK-02': 54,
    'OBSERVE-03': 4,
  });
});

test('low stamina reduces effective intellect and changes executor recommendations', () => {
  const team = applyStaminaToTeam([
    { agent_id: 'LOGIC-01', logic_power: 40, observation_focus: 20, hack_level: 40, confusion_resistance: 20 },
    { agent_id: 'HACK-02', logic_power: 30, observation_focus: 30, hack_level: 30, confusion_resistance: 30 },
  ], {
    'LOGIC-01': 0,
    'HACK-02': 100,
  });

  assert.equal(staminaAbilityMultiplier(0), 0.5);
  assert.equal(team[0].logic_power, 20);
  assert.equal(team[0].hack_level, 20);
  assert.equal(team[1].hack_level, 30);
  assert.equal(recommendExecutor(team, 'hack_terminal'), 'HACK-02');
});
