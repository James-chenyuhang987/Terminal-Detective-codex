import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acquireClues, destroyClues, getHiddenCluesDue, normalizeClueState, removeEvidenceLinks } from '../src/game/clueState.js';
import { getAvailableClueIds } from '../src/game/caseRuntime.js';
import { applySettlementResult, createInitialGameState, popCheckpoint, pushCheckpoint } from '../src/game/gameState.js';

const caseData = {
  case_id: 'purge-test', initial_zone: 'room', scene: { zones: { room: {} } },
  clue_dictionary: ['normal', 'hidden', 'safe', 'future'].map(clue_id => ({ clue_id })),
  zone_clue_map: { room: ['normal', 'hidden', 'safe', 'future'] },
  hidden_clues: [{ clue_id: 'hidden', unlock_turn: 2 }, { clue_id: 'future', unlock_turn: 20 }],
};

function purgedState() {
  const state = acquireClues(createInitialGameState(caseData), ['normal', 'hidden']);
  return destroyClues({ ...state, turn_count: 3 }, ['normal', 'hidden']);
}

function assertPurged(state) {
  assert.deepEqual(state.destroyed_clue_ids, ['normal', 'hidden']);
  assert.equal(state.unlocked_clues.includes('normal'), false);
  assert.equal(state.unlocked_clues.includes('hidden'), false);
  assert.deepEqual([...state.unlocked_clues_set], state.unlocked_clues);
  assert.equal(new Set(state.unlocked_clues).size, state.unlocked_clues.length);
}

test('normal settlement cannot reacquire purged normal or hidden clues, including duplicate incoming IDs', () => {
  const result = applySettlementResult(purgedState(), {
    action_name: 'search_area', new_clues_unlocked: ['normal', 'hidden', 'safe', 'safe'],
  }, {}, caseData);
  assertPurged(result.newState);
  assert.deepEqual(result.newClues, ['safe']);
});

test('digital forensics, bonus discovery and passive scanning exclude destroyed evidence from their pools', t => {
  t.mock.method(Math, 'random', () => 0);
  for (const strategy of [
    { synergy_skills: ['digital_forensics'] },
    { skill_effects: { bonus_clue_chance: 1 } },
    { skill_effects: { passive_scan_chance: 1 } },
  ]) {
    const result = applySettlementResult(purgedState(), { action_name: 'analyze_forensics' }, strategy, caseData);
    assertPurged(result.newState);
    assert.equal(result.newClues.length, 1);
    assert.equal(['safe', 'future'].includes(result.newClues[0]), true);
  }
});

test('available clue lookup blocks purged clues forever while preserving zone and hidden release timing', () => {
  const state = purgedState();
  assert.deepEqual(getAvailableClueIds(caseData, 'room', [], 3, state.destroyed_clue_ids), ['safe']);
  assert.deepEqual(getAvailableClueIds(caseData, 'room', [], 100, state.destroyed_clue_ids), ['safe', 'future']);
  assert.deepEqual(getAvailableClueIds(caseData, 'room', ['safe'], 3, state.destroyed_clue_ids), []);
});

test('automatic hidden release and all direct acquisition paths cannot resurrect permanently destroyed clues', () => {
  const state = purgedState();
  assert.deepEqual(getHiddenCluesDue(caseData, state), []);
  const due = getHiddenCluesDue(caseData, { ...state, turn_count: 20 });
  assert.deepEqual(due.map(clue => clue.clue_id), ['future']);
  const released = acquireClues(state, due.map(clue => clue.clue_id));
  assertPurged(released);
  // Opening passive, high-risk bonus, Insight and (re)interrogation all use this acquisition gate.
  for (const incoming of [['normal'], ['hidden'], ['normal', 'hidden', 'safe', 'safe']]) {
    assertPurged(acquireClues(released, incoming));
  }
  assert.deepEqual(getHiddenCluesDue(caseData, { ...released, turn_count: 21 }), []);
});

test('checkpoints serialize destruction and rewinding the same run cannot restore a purged clue or crisis', () => {
  const original = acquireClues(createInitialGameState(caseData), ['normal', 'hidden']);
  original.evidence_crisis = { clue_id: 'normal', deadline: 2 };
  const stack = pushCheckpoint(original);
  const destroyed = destroyClues({ ...original, checkpoint_stack: stack }, ['normal', 'hidden']);
  const serialized = JSON.parse(JSON.stringify(pushCheckpoint(destroyed)));
  assert.deepEqual(serialized.at(-1).destroyed_clue_ids, ['normal', 'hidden']);
  const restored = popCheckpoint(destroyed);
  assertPurged(restored);
  assert.equal(restored.evidence_crisis, null);
  assert.deepEqual(stack[0].unlocked_clues, ['normal', 'hidden'], 'restore must not mutate saved snapshot');
  const secondRestore = popCheckpoint({ ...destroyed, checkpoint_stack: serialized });
  assertPurged(secondRestore);
  assertPurged(popCheckpoint(secondRestore));
});

test('legacy checkpoints normalize malformed markers and fresh runs do not inherit destruction', () => {
  const state = purgedState();
  const legacy = { ...createInitialGameState(caseData), run_id: state.run_id, unlocked_clues: ['normal', 'normal', 'safe'] };
  delete legacy.destroyed_clue_ids;
  const restored = popCheckpoint({ ...state, checkpoint_stack: [legacy] });
  assertPurged(restored);
  assert.deepEqual(restored.unlocked_clues, ['safe']);
  assertPurged(popCheckpoint({ ...state, checkpoint_stack: [{ ...legacy, run_id: undefined }] }));
  const malformed = normalizeClueState({ unlocked_clues: ['normal', 'normal', null], destroyed_clue_ids: 'not-an-array' });
  assert.deepEqual(malformed.destroyed_clue_ids, []);
  assert.deepEqual(malformed.unlocked_clues, ['normal']);
  assert.deepEqual(normalizeClueState({ destroyed_clue_ids: ['normal', 'normal', null, 3] }).destroyed_clue_ids, ['normal']);
  const otherRun = popCheckpoint({ ...state, checkpoint_stack: [{ ...legacy, run_id: 'other-run' }] });
  assert.deepEqual(otherRun.destroyed_clue_ids, []);
  assert.equal(otherRun.unlocked_clues.includes('normal'), true);
  assert.deepEqual(createInitialGameState(caseData).destroyed_clue_ids, []);
});

test('links referencing either end of destroyed evidence are cleared without touching surviving links', () => {
  const pairs = [{ a: 'normal', b: 'safe' }, { a: 'safe', b: 'hidden' }, { a: 'safe', b: 'future' }];
  assert.deepEqual(removeEvidenceLinks(pairs, ['normal', 'hidden']), [{ a: 'safe', b: 'future' }]);
  assert.equal(pairs.length, 3);
});

test('terminal acquisition and investigation candidate wiring use the permanent evidence gate', () => {
  const terminal = readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../src/game/investigationEngine.js', import.meta.url), 'utf8');
  assert.match(terminal, /acquireClues\(prev, \[firstClue\]\)/);
  assert.match(terminal, /getHiddenCluesDue\(caseData, gameStateRef.current\)/);
  assert.match(terminal, /acquireClues\(gameStateRef.current, \[hc.clue_id\]\)/);
  assert.match(terminal, /!newState.destroyed_clue_ids.includes\(id\)/);
  assert.match(terminal, /acquireClues\(newState, \[bonus\]\)/);
  assert.match(terminal, /!nextGameState.destroyed_clue_ids.includes\(clueId\)/);
  assert.match(terminal, /acquireClues\(nextGameState, \[clueId\]\)/);
  assert.match(terminal, /getAvailableClueIds\(caseData, gs.current_zone, gs.unlocked_clues, gs.turn_count, gs.destroyed_clue_ids\)/);
  assert.match(terminal, /acquireClues\(prev, bonus \? \[bonus\] : \[\]\)/);
  assert.match(engine, /getAvailableClueIds\([\s\S]*gameState.turn_count \+ 1,\s*gameState.destroyed_clue_ids/);
});
