import test from 'node:test';
import assert from 'node:assert/strict';
import { applySettlementResult, createInitialGameState } from '../src/game/gameState.js';
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
