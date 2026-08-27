import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_MARKET_CATALOG, DEFAULT_AGENT_IDS, activateSupportAgent, getActiveSupportAgentId,
  getOwnedAgentIds, getOwnedAgents, purchaseAgent,
} from '../src/game/agentMarket.js';
import { buildTeamConfig, defaultPriorities, defaultSpecs } from '../src/game/teamConfig.js';

function profile(patch = {}) {
  return { diamonds: 0, reward_claims: [], ...patch };
}

test('new detectives always own exactly the three core agents', () => {
  assert.deepEqual(getOwnedAgentIds(profile()), DEFAULT_AGENT_IDS);
  assert.equal(getOwnedAgents(profile()).length, 3);
  assert.ok(getOwnedAgents(profile()).every(agent => agent.core));
});

test('market price increases with agent power', () => {
  const market = AGENT_MARKET_CATALOG.filter(agent => !agent.core);
  for (let index = 1; index < market.length; index += 1) {
    assert.ok(market[index].power > market[index - 1].power);
    assert.ok(market[index].cost > market[index - 1].cost);
  }
});

test('agent purchases are diamond-backed, idempotent and cloud-field compatible', () => {
  const denied = purchaseAgent(profile({ diamonds: 59 }), 'WISP-13');
  assert.equal(denied.error, 'insufficient_funds');

  const bought = purchaseAgent(profile({ diamonds: 500 }), 'WISP-13');
  assert.equal(bought.profile.diamonds, 440);
  assert.ok(bought.profile.reward_claims.includes('agent:WISP-13'));
  assert.equal(getActiveSupportAgentId(bought.profile), 'WISP-13');
  assert.equal(getOwnedAgents(bought.profile).length, 4);

  const duplicate = purchaseAgent(bought.profile, 'WISP-13');
  assert.equal(duplicate.error, 'already_owned');
  assert.equal(duplicate.profile.diamonds, 440);
});

test('owned support agents can be switched without losing purchase claims', () => {
  let current = purchaseAgent(profile({ diamonds: 1000 }), 'WISP-13').profile;
  current = purchaseAgent(current, 'WARDEN-08').profile;
  const activated = activateSupportAgent(current, 'WARDEN-08');
  assert.equal(getActiveSupportAgentId(activated.profile), 'WARDEN-08');
  assert.ok(activated.profile.reward_claims.includes('agent:WISP-13'));
  assert.ok(activated.profile.reward_claims.includes('agent:WARDEN-08'));
  assert.equal(activated.profile.reward_claims.filter(id => id.startsWith('support-agent:')).length, 1);
});

test('active support effects are composed into the existing three-agent strategy', () => {
  const saved = { specs: defaultSpecs(), priorities: defaultPriorities(), primary_agent_index: 0 };
  const oracle = buildTeamConfig(saved, 0, [], 'ORACLE-00');
  assert.equal(oracle.team.length, 3);
  assert.equal(oracle.support_agent.agent_id, 'ORACLE-00');
  assert.equal(oracle.skill_effects.bonus_clue_chance, 0.04);
  assert.equal(oracle.support_effects.initial_ap_bonus, 2);
});

