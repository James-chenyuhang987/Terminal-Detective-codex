import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvailableClueIds,
  getInitialZone,
  isValidZoneTransition,
  resolveNextZone,
} from '../src/game/caseRuntime.js';
import {
  Case_Data_Lvl_01,
  Case_Data_Lvl_02,
  Case_Data_Lvl_03,
  Case_Data_Lvl_04,
  Case_Data_Lvl_05,
} from '../src/game/caseData.js';

test('each case starts in a zone that belongs to its own map', () => {
  assert.equal(getInitialZone(Case_Data_Lvl_01), 'zone_datacenter');
  assert.equal(getInitialZone(Case_Data_Lvl_02), 'zone_lab_core');
  assert.equal(getInitialZone(Case_Data_Lvl_03), 'zone_booth3');
  assert.equal(getInitialZone(Case_Data_Lvl_04), 'zone_cryo_chamber');
  assert.equal(getInitialZone(Case_Data_Lvl_05), 'zone_docking_hub');
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
