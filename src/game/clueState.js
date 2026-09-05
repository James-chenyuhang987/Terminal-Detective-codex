function clueIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(id => typeof id === 'string' && id.length > 0))];
}

export function normalizeClueState(state, destroyedIds = []) {
  const destroyed_clue_ids = clueIds([...clueIds(state.destroyed_clue_ids), ...clueIds(destroyedIds)]);
  const destroyed = new Set(destroyed_clue_ids);
  const unlocked_clues = clueIds(state.unlocked_clues).filter(id => !destroyed.has(id));
  return {
    ...state,
    destroyed_clue_ids,
    unlocked_clues,
    unlocked_clues_set: new Set(unlocked_clues),
    evidence_crisis: destroyed.has(state.evidence_crisis?.clue_id) ? null : state.evidence_crisis,
  };
}

export function acquireClues(state, incomingIds) {
  return normalizeClueState({
    ...state,
    unlocked_clues: [...(state.unlocked_clues || []), ...clueIds(incomingIds)],
  });
}

export function destroyClues(state, ids) {
  return normalizeClueState(state, ids);
}

export function getHiddenCluesDue(caseData, state) {
  const unavailable = new Set([...(state.unlocked_clues || []), ...clueIds(state.destroyed_clue_ids)]);
  return (caseData.hidden_clues || []).filter(clue =>
    state.turn_count >= clue.unlock_turn && !unavailable.has(clue.clue_id)
  );
}

export function removeEvidenceLinks(pairs, removedIds) {
  const removed = new Set(removedIds);
  return pairs.filter(pair => !removed.has(pair.a) && !removed.has(pair.b));
}
