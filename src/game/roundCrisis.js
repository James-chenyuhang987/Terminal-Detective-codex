import { destroyClues } from './clueState.js';
import { stableNarrativeHash } from './narrativeEngine.js';

// Recovery advances the deadline, but only investigative actions can rescue evidence.
export function settleRoundEvidence(state, { investigativeAction = false } = {}) {
  const evidence = state.evidence_crisis;
  if (!evidence) return { state, evidence, outcome: null };
  if (!state.unlocked_clues.includes(evidence.clue_id)) {
    return { state: { ...state, evidence_crisis: null }, evidence, outcome: null };
  }
  if (state.turn_count > evidence.deadline) {
    return { state: destroyClues(state, [evidence.clue_id]), evidence, outcome: 'destroyed' };
  }
  if (investigativeAction
    && stableNarrativeHash(`${state.run_id}:${state.turn_count}:${evidence.clue_id}:secure`) % 100 < 50) {
    return { state: { ...state, evidence_crisis: null }, evidence, outcome: 'secured' };
  }
  return { state, evidence, outcome: 'pending' };
}

export function advanceCrisisSchedule(turn, nextTurn, nextInterval) {
  if (turn < nextTurn) return { due: false, nextTurn };
  return { due: true, nextTurn: turn + nextInterval() };
}
