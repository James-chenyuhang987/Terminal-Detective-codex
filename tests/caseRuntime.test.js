import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvailableClueIds,
  getInitialZone,
  isValidZoneTransition,
  resolveNextZone,
} from '../src/game/caseRuntime.js';
import {
  ALL_CASES,
  Case_Data_Lvl_01,
  Case_Data_Lvl_02,
  Case_Data_Lvl_03,
  Case_Data_Lvl_04,
  Case_Data_Lvl_05,
  Case_Data_Lvl_06,
  Case_Data_Lvl_07,
  Case_Data_Lvl_08,
} from '../src/game/caseData.js';

test('expanded case catalog contains eight complete and internally consistent cases', () => {
  assert.equal(ALL_CASES.length, 8);
  assert.equal(new Set(ALL_CASES.map(item => item.case_id)).size, 8);
  ALL_CASES.forEach(caseData => {
    const clueIds = caseData.clue_dictionary.map(clue => clue.clue_id);
    const zoneIds = Object.keys(caseData.scene.zones);
    assert.equal(clueIds.length, 9, `${caseData.case_id} clue count`);
    assert.equal(new Set(clueIds).size, 9, `${caseData.case_id} unique clues`);
    assert.deepEqual(new Set(Object.keys(caseData.zone_layout)), new Set(zoneIds), `${caseData.case_id} map zones`);
    assert.ok(zoneIds.includes(caseData.initial_zone), `${caseData.case_id} initial zone`);
    assert.deepEqual(
      new Set(Object.values(caseData.zone_clue_map).flat()),
      new Set(clueIds),
      `${caseData.case_id} zone clue coverage`,
    );
  });
});

test('each case starts in a zone that belongs to its own map', () => {
  assert.equal(getInitialZone(Case_Data_Lvl_01), 'zone_datacenter');
  assert.equal(getInitialZone(Case_Data_Lvl_02), 'zone_lab_core');
  assert.equal(getInitialZone(Case_Data_Lvl_03), 'zone_booth3');
  assert.equal(getInitialZone(Case_Data_Lvl_04), 'zone_cryo_chamber');
  assert.equal(getInitialZone(Case_Data_Lvl_05), 'zone_docking_hub');
  assert.equal(getInitialZone(Case_Data_Lvl_06), 'zone_auction_floor');
  assert.equal(getInitialZone(Case_Data_Lvl_07), 'zone_moon_pool');
  assert.equal(getInitialZone(Case_Data_Lvl_08), 'zone_summit_court');
});

test('specialist actions move through the selected case graph', () => {
  assert.equal(resolveNextZone({
    caseData: Case_Data_Lvl_02,
    currentZone: 'zone_lab_core',
    actionName: 'hack_terminal',
  }), 'zone_server');

  assert.equal(resolveNextZone({
    caseData: Case_Data_Lvl_03,
    currentZone: 'zone_booth3',
    actionName: 'tail_suspect',
  }), 'zone_alley');

  assert.equal(resolveNextZone({
    caseData: Case_Data_Lvl_05,
    currentZone: 'zone_docking_hub',
    actionName: 'check_cctv',
  }), 'zone_observation_ring');

  assert.equal(resolveNextZone({
    caseData: Case_Data_Lvl_08,
    currentZone: 'zone_summit_court',
    actionName: 'access_database',
  }), 'zone_memory_vault');
});

test('broad search prefers an accessible unvisited adjacent zone', () => {
  assert.equal(resolveNextZone({
    caseData: Case_Data_Lvl_02,
    currentZone: 'zone_lab_core',
    actionName: 'search_area',
    visitedZones: ['zone_lab_core'],
  }), 'zone_lounge');
});

test('zone clue lookup never leaks clues assigned to another zone', () => {
  const available = getAvailableClueIds(Case_Data_Lvl_03, 'zone_booth3', ['e_01']);
  assert.deepEqual(available, ['e_07']);
  assert.equal(isValidZoneTransition(Case_Data_Lvl_03, 'zone_bar', 'zone_backroom'), false);
});

test('protected clues remain unavailable until their configured unlock turn', () => {
  const hidden = Case_Data_Lvl_01.hidden_clues[0];
  const zone = Object.entries(Case_Data_Lvl_01.zone_clue_map)
    .find(([, clueIds]) => clueIds.includes(hidden.clue_id))?.[0];
  assert.ok(zone);
  assert.equal(
    getAvailableClueIds(Case_Data_Lvl_01, zone, [], hidden.unlock_turn - 1).includes(hidden.clue_id),
    false,
  );
  assert.equal(
    getAvailableClueIds(Case_Data_Lvl_01, zone, [], hidden.unlock_turn).includes(hidden.clue_id),
    true,
  );
});
