import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCommandContingency,
  applyDecisionCommandCost,
  applyEmergencyStabilize,
  awardCommandMilestone,
  buildExecutingStrategy,
  createCommandState,
  decisionForecast,
  normalizeCommandPlan,
  recommendExecutor,
} from '../src/game/commandSystem.js';
import { buildTeamConfig, defaultPriorities, defaultSpecs, normalizeSavedTeamConfig } from '../src/game/teamConfig.js';
import { getCaseMatchConfig, calcCaseMatchScore } from '../src/game/casePresets.js';

const baseSaved = {
  specs: defaultSpecs(), priorities: defaultPriorities(), primary_agent_index: 1,
  command_plan: { doctrine_id: 'evidence_control', contingency_id: 'cognitive_stabilizer' },
};

test('legacy and invalid command plans normalize to safe defaults', () => {
  assert.deepEqual(normalizeCommandPlan(null), {
    doctrine_id: 'evidence_control', contingency_id: 'cognitive_stabilizer',
  });
  assert.deepEqual(normalizeCommandPlan({ doctrine_id: 'invalid', contingency_id: 'invalid' }), {
    doctrine_id: 'evidence_control', contingency_id: 'cognitive_stabilizer',
  });
  assert.deepEqual(normalizeSavedTeamConfig({ specs: [{}, {}, {}] }).command_plan, normalizeCommandPlan());
});

test('doctrines initialize command points and milestones are capped and idempotent', () => {
  assert.equal(createCommandState({ doctrine_id: 'rapid_pursuit' }).points, 4);
  let state = createCommandState({ doctrine_id: 'evidence_control' });
  state = awardCommandMilestone(state, 'checkpoint:one').state;
  state = awardCommandMilestone(state, 'checkpoint:one').state;
  state = awardCommandMilestone(state, 'checkpoint:two', 9).state;
  assert.equal(state.points, 5);
  assert.deepEqual(state.earned_milestones, ['checkpoint:one', 'checkpoint:two']);
});

test('executor recommendation and joint action use real agent attributes', () => {
  const strategy = buildTeamConfig(baseSaved);
  assert.equal(strategy.primary_agent_id, 'AURORA-09');
  assert.equal(recommendExecutor(strategy.team, 'hack_terminal'), 'CIPHER-47');
  assert.equal(recommendExecutor(strategy.team, 'examine_clue'), 'AURORA-09');
  assert.equal(recommendExecutor(strategy.team, 'present_evidence'), 'NEXUS-01');

  const executing = buildExecutingStrategy(strategy, 'hack_terminal', 'AURORA-09', 'CIPHER-47', true);
  assert.equal(executing.executing_agent_id, 'AURORA-09');
  assert.equal(executing.assisting_agent_id, 'CIPHER-47');
  assert.equal(executing.combat_attributes.hack_level, 20);
  assert.equal(executing.command_effects.ap_reduction, 1);
  assert.ok(executing.synergy_skills === strategy.synergy_skills);
});

test('decision commands only spend after an explicit commit', () => {
  const gameState = { command_state: createCommandState() };
  const result = applyDecisionCommandCost(gameState, ['tactical_preview', 'joint_action']);
  assert.equal(result.error, null);
  assert.equal(result.gameState.command_state.points, 1);
  const denied = applyDecisionCommandCost(result.gameState, ['joint_action', 'tactical_preview']);
  assert.equal(denied.error, 'insufficient_command_points');
  assert.equal(denied.gameState.command_state.points, 1);
});

test('emergency stabilize follows doctrine cost and can only run once', () => {
  const base = { confusion_score: 62, command_state: createCommandState({ doctrine_id: 'steady_control' }) };
  const used = applyEmergencyStabilize(base);
  assert.equal(used.cost, 1);
  assert.equal(used.gameState.confusion_score, 50);
  assert.equal(used.gameState.command_state.points, 2);
  assert.equal(applyEmergencyStabilize(used.gameState).error, 'command_already_used');
});

test('all contingencies trigger once and report insufficient points', () => {
  const cognitive = applyCommandContingency({
    confusion_score: 54, action_points_left: 20,
    command_state: createCommandState({ contingency_id: 'cognitive_stabilizer' }),
  });
  assert.equal(cognitive.gameState.confusion_score, 42);
  assert.equal(cognitive.gameState.command_state.contingency_status, 'used');

  const throttle = applyCommandContingency({
    confusion_score: 0, action_points_left: 6,
    command_state: createCommandState({ contingency_id: 'emergency_throttle' }),
  });
  assert.equal(throttle.gameState.command_ap_credit, 2);

  const evidence = applyCommandContingency({
    confusion_score: 0, action_points_left: 20,
    evidence_crisis: { clue_id: 'e1', deadline: 4 },
    command_state: createCommandState({ contingency_id: 'evidence_lockdown' }),
  });
  assert.equal(evidence.gameState.evidence_crisis.deadline, 5);

  const missedState = createCommandState({ contingency_id: 'cognitive_stabilizer' });
  missedState.points = 0;
  const missed = applyCommandContingency({ confusion_score: 80, command_state: missedState });
  assert.equal(missed.event.type, 'error');
  assert.equal(missed.gameState.command_state.contingency_status, 'missed');
});

test('case forecasts use independent public requirements without hidden data', () => {
  const strategy = buildTeamConfig(baseSaved);
  const scores = ['Lvl_01', 'Lvl_02', 'Lvl_03', 'Lvl_04', 'Lvl_05', 'Lvl_06', 'Lvl_07', 'Lvl_08'].map(id => calcCaseMatchScore(strategy.team, getCaseMatchConfig(id)).score);
  assert.equal(scores.length, 8);
  scores.forEach(score => assert.ok(score >= 0 && score <= 100));
  assert.deepEqual(Object.keys(getCaseMatchConfig('Lvl_03').weights), [
    'observation_focus', 'confusion_resistance', 'logic_power',
  ]);
  assert.deepEqual(decisionForecast('hack_terminal', 'high'), {
    ap: [3, 5], confusion: [8, 20], trap: 40,
  });
});
