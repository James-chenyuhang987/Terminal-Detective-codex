import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { applyRecoveryTurn, applySettlementResult, createInitialGameState } from '../src/game/gameState.js';
import { advanceCrisisSchedule, settleRoundEvidence } from '../src/game/roundCrisis.js';
import { acquireClues } from '../src/game/clueState.js';
import { Case_Data_Lvl_01 } from '../src/game/caseData.js';
import { stableNarrativeHash } from '../src/game/narrativeEngine.js';

function crisisState() {
  const state = acquireClues(createInitialGameState(Case_Data_Lvl_01), ['c_01']);
  return { ...state, turn_count: 1, evidence_crisis: { clue_id: 'c_01', keyword: 'log', deadline: 2 } };
}

test('recovery advances the inclusive deadline, then permanently purges once without spending stamina or AP', () => {
  const before = { ...crisisState(), agent_stamina: { A: 99, B: 5, C: 0 } };
  const first = settleRoundEvidence(applyRecoveryTurn(before, ['A', 'B', 'C']));
  assert.equal(first.state.turn_count, 2);
  assert.equal(first.outcome, 'pending');
  assert.deepEqual(first.state.agent_stamina, { A: 100, B: 9, C: 4 });
  assert.equal(first.state.action_points_left, before.action_points_left);
  const expired = settleRoundEvidence(applyRecoveryTurn(first.state, ['A', 'B', 'C']));
  assert.equal(expired.state.turn_count, 3);
  assert.equal(expired.outcome, 'destroyed');
  assert.deepEqual(expired.state.unlocked_clues, []);
  assert.deepEqual([...expired.state.unlocked_clues_set], []);
  assert.deepEqual(expired.state.destroyed_clue_ids, ['c_01']);
  assert.equal(expired.state.evidence_crisis, null);
  assert.equal(settleRoundEvidence(expired.state).outcome, null);
  assert.deepEqual(before.unlocked_clues, ['c_01']);
});

test('recovery never receives the incidental rescue available to investigation, including on the deadline', () => {
  const before = crisisState();
  let seed = 0;
  while (stableNarrativeHash(`run-${seed}:2:c_01:secure`) % 100 >= 50) seed += 1;
  before.run_id = `run-${seed}`;
  const recovered = applyRecoveryTurn(before);
  assert.equal(settleRoundEvidence(recovered).outcome, 'pending');
  const investigated = applySettlementResult(before, { action_name: 'search_area' }, {}, Case_Data_Lvl_01).newState;
  assert.equal(settleRoundEvidence(investigated, { investigativeAction: true }).outcome, 'secured');
  assert.equal(settleRoundEvidence({ ...investigated, turn_count: 3 }, { investigativeAction: true }).outcome, 'destroyed');
});

test('scheduled crises are claimed once for either round type, including overdue turns', () => {
  let calls = 0;
  const interval = () => { calls += 1; return 5; };
  let threshold = 4;
  for (const turn of [3, 4, 4, 5, 8, 9, 9]) {
    const result = advanceCrisisSchedule(turn, threshold, interval);
    assert.equal(result.due, turn >= threshold);
    threshold = result.nextTurn;
  }
  assert.equal(calls, 2);
  assert.equal(threshold, 14);
  assert.deepEqual(advanceCrisisSchedule(20, threshold, interval), { due: true, nextTurn: 25 });
});

const terminal = readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8');

// Execute the actual cloud snapshot commit; evidence and crisis reducers stay server-side.
function commitHarness() {
  const stored = {};
  const context = {
    useCallback: fn => fn, gameStateRef: { current: null }, bsodCountRef: { current: 0 },
    crisisPendingRef: { current: false }, finalizingRef: { current: false }, finalSettlementRef: { current: null },
  };
  for (const field of ['ServerRun', 'GameState', 'LinkedPairs', 'NpcEmotionState', 'TruthFragments', 'JudgeResult', 'ShowBSoD', 'CrisisPending', 'Crisis', 'IsFinalizing', 'FinalJudgeResult', 'ShowGameOver']) {
    context[`set${field}`] = value => { stored[field] = value; };
  }
  const start = terminal.indexOf('  const commitServerRun = ');
  const end = terminal.indexOf('  const executeRunCommand = ', start);
  const commit = runInNewContext(`${terminal.slice(start, end)}\ncommitServerRun;`, context);
  return { commit, context, stored };
}

test('both terminal round branches submit intents rather than simulating evidence or crises', () => {
  assert.match(terminal, /executeRunCommand\(\{ type: 'rest'/);
  assert.match(terminal, /type: 'round', option_id:/);
  assert.doesNotMatch(terminal, /settleRoundEvidence|rollCrisis|advanceCrisisSchedule/);
});

test('round commit displays server-destroyed clues, remaining links and crisis without a second timer or roll', () => {
  const harness = commitHarness();
  const result = settleRoundEvidence({ ...crisisState(), turn_count: 3 });
  const run = { state: result.state, linked_pairs: [{ a: 'c_02', b: 'c_03' }], pending_crisis: { id: 'tracker' } };
  harness.commit(run);
  assert.strictEqual(harness.context.gameStateRef.current, result.state);
  assert.strictEqual(harness.stored.GameState, result.state);
  assert.strictEqual(harness.stored.LinkedPairs, run.linked_pairs);
  assert.equal(harness.stored.CrisisPending, true);
  assert.strictEqual(harness.stored.Crisis, run.pending_crisis);
  harness.commit({ ...run, pending_crisis: null });
  assert.equal(harness.stored.CrisisPending, false);
  assert.equal(harness.stored.Crisis, null);
});
