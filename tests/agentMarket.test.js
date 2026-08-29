import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_MARKET_CATALOG, DEFAULT_AGENT_IDS, activateSupportAgent, getActiveSupportAgentId,
  getCoreAgentsForSlot, getOwnedAgentIds, getOwnedAgents, getSelectedCoreAgentIds, normalizeCoreAgentIds,
  prepareCoreAgentReplacement, purchaseAgent,
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

test('expanded support roster exposes nine distinct recruitable agents', () => {
  const market = AGENT_MARKET_CATALOG.filter(agent => !agent.core);
  assert.equal(market.length, 9);
  assert.equal(new Set(market.map(agent => agent.id)).size, 9);
  assert.equal(market.at(-1).id, 'ATLAS-X');
});

test('six premium core operatives are assigned to compatible replacement slots', () => {
  const supportMax = Math.max(...AGENT_MARKET_CATALOG.filter(agent => !agent.core).map(agent => agent.cost));
  const premium = AGENT_MARKET_CATALOG.filter(agent => agent.core && agent.purchasable);
  assert.equal(premium.length, 6);
  assert.ok(premium.every(agent => agent.cost > supportMax));
  assert.deepEqual([0, 1, 2].map(slot => getCoreAgentsForSlot(slot).length), [3, 3, 3]);
  assert.deepEqual(normalizeCoreAgentIds(['SPECTRA-18', 'ARGUS-21', 'OMEGA-77']), [
    'NEXUS-01', 'AURORA-09', 'OMEGA-77',
  ]);
});

test('premium core purchases do not replace or activate the support channel', () => {
  const bought = purchaseAgent(profile({ diamonds: 3000 }), 'ARGUS-21');
  assert.equal(bought.error, undefined);
  assert.equal(bought.profile.diamonds, 1500);
  assert.ok(bought.profile.reward_claims.includes('agent:ARGUS-21'));
  assert.equal(getActiveSupportAgentId(bought.profile), null);
  assert.equal(bought.activated, false);
});

test('saved core replacements cannot be activated before they are purchased', () => {
  const forged = profile({ saved_team_config: { core_agent_ids: ['SOVEREIGN-01', 'SERAPH-88', 'OMEGA-77'] } });
  assert.deepEqual(getSelectedCoreAgentIds(forged), DEFAULT_AGENT_IDS);
  const owned = purchaseAgent(profile({ diamonds: 3000 }), 'SOVEREIGN-01').profile;
  owned.saved_team_config = { core_agent_ids: ['SOVEREIGN-01', 'SERAPH-88', 'OMEGA-77'] };
  assert.deepEqual(getSelectedCoreAgentIds(owned), ['SOVEREIGN-01', 'AURORA-09', 'CIPHER-47']);
});

test('core replacement plans preserve the team and reject unowned or incompatible agents', () => {
  const team = { specs: defaultSpecs(), priorities: defaultPriorities(), primary_agent_index: 1 };
  assert.equal(prepareCoreAgentReplacement(profile(), team, 0, 'SOVEREIGN-01').error, 'not_owned');
  assert.equal(prepareCoreAgentReplacement(profile(), team, 0, 'SERAPH-88').error, 'invalid_core_slot');

  const owned = purchaseAgent(profile({ diamonds: 3000 }), 'SOVEREIGN-01').profile;
  const planned = prepareCoreAgentReplacement(owned, team, 0, 'SOVEREIGN-01');
  assert.equal(planned.error, undefined);
  assert.equal(planned.config.specs, team.specs);
  assert.deepEqual(planned.config.core_agent_ids, ['SOVEREIGN-01', 'AURORA-09', 'CIPHER-47']);
  assert.equal(planned.previousAgent.id, 'NEXUS-01');
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

test('selected core replacements enter the runtime team with their real attribute bonuses', () => {
  const saved = {
    specs: defaultSpecs(), priorities: defaultPriorities(), primary_agent_index: 2,
    core_agent_ids: ['ARGUS-21', 'SERAPH-88', 'OMEGA-77'],
  };
  const strategy = buildTeamConfig(saved, 2);
  assert.deepEqual(strategy.team.map(agent => agent.agent_id), ['ARGUS-21', 'SERAPH-88', 'OMEGA-77']);
  assert.equal(strategy.primary_agent_id, 'OMEGA-77');
  assert.equal(strategy.team[0].logic_power, 24);
  assert.equal(strategy.team[1].observation_focus, 27);
  assert.equal(strategy.team[2].hack_level, 27);
  assert.equal(strategy.team[2].ap_cost_discount, 15);
});
