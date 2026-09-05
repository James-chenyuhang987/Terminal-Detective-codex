import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { applyRecoveryTurn, applySettlementResult, createInitialGameState } from '../src/game/gameState.js';
import { advanceCrisisSchedule, settleRoundEvidence } from '../src/game/roundCrisis.js';
import { acquireClues, removeEvidenceLinks } from '../src/game/clueState.js';
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

// Execute the actual UI commit closure with timer/state adapters; no React renderer is installed.
function commitHarness({ failRoll = false, failSchedule = false } = {}) {
  const callbacks = [];
  const stored = { pending: false, crisis: null, pairs: [{ a: 'c_01', b: 'c_02' }, { a: 'c_02', b: 'c_03' }] };
  const context = {
    gameStateRef: { current: null }, activeRunRef: { current: 7 }, finalizingRef: { current: false },
    crisisPendingRef: { current: false }, nextCrisisTurnRef: { current: 3 },
    setGameState: state => { stored.state = state; },
    setLinkedPairs: update => { stored.pairs = update(stored.pairs); },
    setCrisisPending: pending => { stored.pending = pending; },
    setCrisis: crisis => { stored.crisis = crisis; }, setCrisisError: () => {}, addLine: () => {},
    removeEvidenceLinks, advanceCrisisSchedule, nextCrisisIn: () => 4, caseData: Case_Data_Lvl_01,
    publicErrorMessage: () => 'crisis unavailable',
    rollCrisis: () => { if (failRoll) throw new Error('roll failed'); return { type: 'tracker' }; },
    schedule: callback => { if (failSchedule) throw new Error('timer failed'); callbacks.push(callback); },
  };
  const start = terminal.indexOf('  const commitRound = ');
  const end = terminal.indexOf('  // Confusion / crash monitoring', start);
  const commit = runInNewContext(`${terminal.slice(start, end)}\ncommitRound;`, context);
  return { commit, context, callbacks, stored };
}

test('both terminal round branches use the shared settlement and crisis commit', () => {
  assert.match(terminal, /commitRound\(settleRoundEvidence\(recoveredState\), runId, runLang\)/);
  assert.match(terminal, /settleRoundEvidence\(newState, \{ investigativeAction: true \}\)/);
  assert.match(terminal, /commitRound\(roundEvidence, runId, runLang\)/);
});

test('round commit stores the current ref, clears evidence links and locks exactly one scheduled crisis', () => {
  const harness = commitHarness();
  const result = settleRoundEvidence({ ...crisisState(), turn_count: 3 });
  harness.commit(result, 7, 'en');
  assert.equal(harness.context.gameStateRef.current, result.state);
  assert.equal(harness.stored.state, result.state);
  assert.deepEqual(harness.stored.pairs, [{ a: 'c_02', b: 'c_03' }]);
  assert.equal(harness.stored.pending, true);
  harness.commit(result, 7, 'en');
  assert.equal(harness.callbacks.length, 1);
  harness.callbacks[0]();
  assert.equal(harness.stored.crisis.type, 'tracker');
  assert.equal(harness.context.nextCrisisTurnRef.current, 7);
});

test('stale and finalizing crisis timers unlock without presenting an event', () => {
  for (const finalize of [true, false]) {
    const harness = commitHarness();
    harness.commit(settleRoundEvidence({ ...crisisState(), turn_count: 3 }), 7, 'en');
    if (finalize) harness.context.finalizingRef.current = true;
    else harness.context.activeRunRef.current = 8;
    harness.callbacks[0]();
    assert.equal(harness.stored.crisis, null);
    assert.equal(harness.stored.pending, false);
    assert.equal(harness.context.crisisPendingRef.current, false);
  }
});

test('crisis creation and timer failures cannot deadlock recovery or undo its committed round', () => {
  for (const options of [{ failRoll: true }, { failSchedule: true }]) {
    const harness = commitHarness(options);
    harness.commit(settleRoundEvidence({ ...crisisState(), turn_count: 3 }), 7, 'en');
    assert.equal(harness.stored.state.turn_count, 3);
    assert.equal(harness.stored.pending, false);
    assert.equal(harness.context.crisisPendingRef.current, false);
    assert.equal(harness.context.nextCrisisTurnRef.current, 3);
  }
});
