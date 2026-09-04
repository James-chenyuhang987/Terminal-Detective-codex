import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySettlementResult,
  buildLastActionContext,
  createInitialGameState,
} from '../src/game/gameState.js';
import { Case_Data_Lvl_01, Case_Data_Lvl_02 } from '../src/game/caseData.js';

test('initial state uses the selected case start zone and a unique run id', () => {
  const first = createInitialGameState(Case_Data_Lvl_02);
  const second = createInitialGameState(Case_Data_Lvl_02);

  assert.equal(first.current_zone, 'zone_lab_core');
  assert.deepEqual(first.visited_zones, ['zone_lab_core']);
  assert.notEqual(first.run_id, second.run_id);
});

test('settlement applies legacy fields, validates clues, and moves zones', () => {
  const state = createInitialGameState(Case_Data_Lvl_02);
  const { newState, newClues } = applySettlementResult(state, {
    new_clues: ['d_04', 'not-a-real-clue'],
    ap_cost: 2,
    next_zone: 'zone_server',
  }, {}, Case_Data_Lvl_02);

  assert.deepEqual(newClues, ['d_04']);
  assert.equal(newState.action_points_left, 18);
  assert.equal(newState.current_zone, 'zone_server');
  assert.deepEqual(newState.visited_zones, ['zone_lab_core', 'zone_server']);
});

test('settlement cannot inject a valid clue from another zone', () => {
  const state = createInitialGameState(Case_Data_Lvl_02);
  const { newState, newClues } = applySettlementResult(state, {
    new_clues_unlocked: ['d_05'],
    time_cost: 1,
  }, {}, Case_Data_Lvl_02);

  assert.deepEqual(newClues, []);
  assert.deepEqual(newState.unlocked_clues, []);
  assert.equal(newState.current_zone, 'zone_lab_core');
});

test('fractional AP discounts accumulate instead of disappearing to rounding', () => {
  const strategy = { engine_modifiers: { ap_cost_discount: 0.5 } };
  const first = applySettlementResult(createInitialGameState(Case_Data_Lvl_02), {
    action_name: 'search_area',
    time_cost: 1,
  }, strategy, Case_Data_Lvl_02).newState;
  const second = applySettlementResult(first, {
    action_name: 'search_area',
    time_cost: 1,
  }, strategy, Case_Data_Lvl_02).newState;

  assert.equal(first.action_points_left, 19);
  assert.equal(first.ap_discount_credit, 0.5);
  assert.equal(second.action_points_left, 19);
  assert.equal(second.ap_discount_credit, 0);
});

test('free decrypt and passive scan skill effects change settlement', () => {
  const freeDecrypt = applySettlementResult(createInitialGameState(Case_Data_Lvl_02), {
    action_name: 'hack_terminal',
    time_cost: 3,
  }, { skill_effects: { free_decrypt: true } }, Case_Data_Lvl_02).newState;
  assert.equal(freeDecrypt.action_points_left, 20);

  const labState = {
    ...createInitialGameState(Case_Data_Lvl_01),
    current_zone: 'zone_lab',
    visited_zones: ['zone_datacenter', 'zone_lab'],
    unlocked_clues: ['c_04', 'c_05'],
    unlocked_clues_set: new Set(['c_04', 'c_05']),
  };
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const result = applySettlementResult(labState, {
      action_name: 'search_area',
      time_cost: 1,
    }, { skill_effects: { passive_scan_chance: 1 } }, Case_Data_Lvl_01);
    assert.deepEqual(result.newClues, ['c_secret_99']);
  } finally {
    Math.random = originalRandom;
  }
});

test('command AP credits apply to one successful action and are then consumed', () => {
  const state = {
    ...createInitialGameState(Case_Data_Lvl_02),
    command_ap_credit: 2,
  };
  const first = applySettlementResult(state, {
    action_name: 'search_area',
    time_cost: 4,
  }, { command_effects: { ap_reduction: 1 } }, Case_Data_Lvl_02).newState;
  assert.equal(first.action_points_left, 19);
  assert.equal(first.command_ap_credit, 0);

  const second = applySettlementResult(first, {
    action_name: 'search_area',
    time_cost: 4,
  }, {}, Case_Data_Lvl_02).newState;
  assert.equal(second.action_points_left, 15);
});

test('last action context stores only bounded public settlement facts', () => {
  const previous = createInitialGameState(Case_Data_Lvl_01);
  const hiddenClueId = Case_Data_Lvl_01.hidden_clues[0].clue_id;
  const next = {
    ...previous,
    turn_count: 1,
    current_zone: 'zone_lab',
    action_points_left: 17,
    confusion_score: 9,
    current_hp: 92,
    unlocked_clues: ['c_04', hiddenClueId],
  };
  const context = buildLastActionContext(previous, next, {
    action_name: 'analyze_forensics',
    outcome: 'clue',
    action_narration: 'UNTRUSTED SERVER NARRATION',
    new_clues_unlocked: ['c_04', hiddenClueId],
  }, Case_Data_Lvl_01, {
    actionTag: 'analyze_forensics',
    executorAgentId: 'AURORA-09',
    assistAgentId: 'CIPHER-47',
  });

  assert.deepEqual(context, {
    version: 1,
    turn: 1,
    action_tag: 'analyze_forensics',
    executor_agent_id: 'AURORA-09',
    assist_agent_id: 'CIPHER-47',
    outcome: 'clue',
    public_clue_ids: ['c_04'],
    from_zone: 'zone_datacenter',
    to_zone: 'zone_lab',
    moved: true,
    ap_spent: 3,
    hp_delta: -8,
    confusion_delta: 9,
    trap_triggered: false,
  });
  assert.doesNotMatch(JSON.stringify(context), /UNTRUSTED|secret_99/);
  assert.deepEqual(JSON.parse(JSON.stringify(context)), context);
});

test('last action context reflects the final trap and no-yield result', () => {
  const previous = createInitialGameState(Case_Data_Lvl_02);
  const next = {
    ...previous,
    turn_count: 1,
    action_points_left: 19,
    traps_triggered: 1,
  };
  const trapped = buildLastActionContext(previous, next, {
    action_name: 'hack_terminal',
    outcome: 'progress',
  }, Case_Data_Lvl_02, {
    actionTag: 'hack_terminal',
    executorAgentId: 'CIPHER-47',
    actualTrapTriggered: true,
  });
  const noYield = buildLastActionContext(previous, next, {
    action_name: 'check_alibi',
    outcome: 'no_yield',
  }, Case_Data_Lvl_02, {
    actionTag: 'check_alibi',
    executorAgentId: 'NEXUS-01',
  });

  assert.equal(trapped.outcome, 'trap');
  assert.equal(trapped.trap_triggered, true);
  assert.equal(noYield.outcome, 'no_yield');
});
