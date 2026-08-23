import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBranchOutcome,
  getCaseSecret,
  getClueLabel,
  getNpcHiddenMotive,
  getNpcSecret,
  isKnownValidEdge,
} from '../base44/functions/detectiveLLM/caseSecrets.ts';

test('server registry resolves case and NPC secrets', () => {
  assert.match(getCaseSecret('Lvl_02').truth, /Aria Chen/);
  assert.match(getNpcHiddenMotive('Lvl_03', 'npc_01'), /killed Riku/);
  assert.equal(getNpcSecret('Lvl_01', 'npc_02').name, 'Kenji Mori');
  assert.equal(getClueLabel('Lvl_02', 'd_06'), 'Roof weight sensor');
  assert.equal(getNpcHiddenMotive('Lvl_03', 'npc_missing'), '');
});

test('server registry treats clue edges as undirected', () => {
  assert.equal(isKnownValidEdge('Lvl_01', 'c_01', 'c_02'), true);
  assert.equal(isKnownValidEdge('Lvl_01', 'c_02', 'c_01'), true);
  assert.equal(isKnownValidEdge('Lvl_01', 'c_01', 'c_08'), false);
  assert.equal(isKnownValidEdge('Lvl_01', 'c_01', 'c_03', true), true);
});

test('branch outcomes stay server-side and localize safely', () => {
  const outcome = getBranchOutcome('Lvl_03', 'b_blame_ren', 'en');
  assert.equal(outcome.branch_id, 'b_blame_ren');
  assert.equal(outcome.impact.ap_loss, 30);
  assert.match(outcome.narrative, /Sable/);
  assert.equal(getBranchOutcome('Lvl_03', 'invalid', 'zh'), null);
});
