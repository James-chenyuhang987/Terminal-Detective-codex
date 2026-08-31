import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBranchOutcome,
  getCaseSecret,
  getClueLabel,
  getNpcHiddenMotive,
  getNpcSecret,
  isKnownValidEdge,
} from '../server/detectiveRules/caseSecrets.js';
import { ALL_CASES } from '../src/game/caseData.js';

test('all public cases have a matching server secret and clue-label registry', () => {
  ALL_CASES.forEach(caseData => {
    assert.ok(getCaseSecret(caseData.case_id), `${caseData.case_id} secret registry`);
    caseData.clue_dictionary.forEach(clue => {
      assert.ok(getClueLabel(caseData.case_id, clue.clue_id), `${caseData.case_id}:${clue.clue_id}`);
    });
  });
});

test('server registry resolves case and NPC secrets', () => {
  assert.match(getCaseSecret('Lvl_02').truth, /Aria Chen/);
  assert.match(getNpcHiddenMotive('Lvl_03', 'npc_01'), /killed Riku/);
  assert.equal(getNpcSecret('Lvl_01', 'npc_02').name, 'Kenji Mori');
  assert.equal(getClueLabel('Lvl_02', 'd_06'), 'Roof weight sensor');
  assert.equal(getNpcHiddenMotive('Lvl_03', 'npc_missing'), '');
  assert.match(getCaseSecret('Lvl_04').truth, /Elias Venn/);
  assert.equal(getNpcSecret('Lvl_05', 'npc_01').name, 'Cassian Rook');
  assert.equal(getClueLabel('Lvl_05', 'g_01'), 'Directed lifeboat depressurization');
  assert.equal(getNpcSecret('Lvl_06', 'npc_01').name, 'Tessa Vale');
  assert.equal(getClueLabel('Lvl_07', 'i_secret_99'), 'Sampler command black box');
  assert.match(getCaseSecret('Lvl_08').truth, /Lucan Veil/);
});

test('server registry treats clue edges as undirected', () => {
  assert.equal(isKnownValidEdge('Lvl_01', 'c_01', 'c_02'), true);
  assert.equal(isKnownValidEdge('Lvl_01', 'c_02', 'c_01'), true);
  assert.equal(isKnownValidEdge('Lvl_01', 'c_01', 'c_08'), false);
  assert.equal(isKnownValidEdge('Lvl_01', 'c_01', 'c_03', true), true);
  assert.equal(isKnownValidEdge('Lvl_04', 'f_01', 'f_03'), true);
  assert.equal(isKnownValidEdge('Lvl_05', 'g_01', 'g_04'), true);
  assert.equal(isKnownValidEdge('Lvl_06', 'h_02', 'h_03'), true);
  assert.equal(isKnownValidEdge('Lvl_07', 'i_secret_99', 'i_01'), true);
  assert.equal(isKnownValidEdge('Lvl_08', 'j_01', 'j_03'), true);
});

test('branch outcomes stay server-side and localize safely', () => {
  const outcome = getBranchOutcome('Lvl_03', 'b_blame_ren', 'en');
  assert.equal(outcome.branch_id, 'b_blame_ren');
  assert.equal(outcome.impact.ap_loss, 30);
  assert.match(outcome.narrative, /Sable/);
  assert.equal(getBranchOutcome('Lvl_03', 'invalid', 'zh'), null);
});
