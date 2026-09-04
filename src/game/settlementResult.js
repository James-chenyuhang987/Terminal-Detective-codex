const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const SETTLEMENT_OUTCOMES = new Set(['clue', 'progress', 'no_yield', 'trap', 'illegal']);

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Keep one settlement contract at the boundary between the LLM client and the
 * deterministic game-state reducer. Legacy aliases are accepted so existing
 * callers and saved sessions do not silently lose clues or AP costs.
 */
export function normalizeSettlementResult(value = {}) {
  /** @type {Record<string, any>} */
  const source = value && typeof value === 'object' ? value : {};
  const rawClues = source.new_clues_unlocked ?? source.new_clues ?? [];
  const clues = Array.isArray(rawClues)
    ? [...new Set(rawClues.filter(id => typeof id === 'string' && id.trim()))]
    : [];

  return {
    ...source,
    action_narration: typeof source.action_narration === 'string' ? source.action_narration : '',
    action_name: typeof source.action_name === 'string' ? source.action_name : null,
    outcome: SETTLEMENT_OUTCOMES.has(source.outcome) ? source.outcome : null,
    new_clues_unlocked: clues,
    confusion_increase: clamp(finiteNumber(source.confusion_increase), 0, 100),
    time_cost: clamp(finiteNumber(source.time_cost ?? source.ap_cost, 1), 0, 20),
    health_change: clamp(finiteNumber(source.health_change), -100, 100),
    is_trap: source.is_trap === true,
    trap_narration: typeof source.trap_narration === 'string' ? source.trap_narration : null,
    next_zone: typeof source.next_zone === 'string' ? source.next_zone : null,
  };
}
