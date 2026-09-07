import { getAvailableClueIds, getZoneClueIds, resolveNextZone } from '../../src/game/caseRuntime.js';
import { applySettlementResult } from '../../src/game/gameState.js';
import { agentExpertise } from '../../src/game/commandSystem.js';
import { renderNarrative, stableNarrativeHash } from '../../src/game/narrativeEngine.js';
import { normalizeSettlementResult } from '../../src/game/settlementResult.js';

export function runRoll(seed, label, size = 100) {
  return stableNarrativeHash(`${seed}:${label}`) % size;
}

// The browser facade imports its HTTP client and keeps mutable language state.
// Keep its action formula here, with the same seeds and no browser dependency.
export function settleRunAction(state, caseData, strategy, card, lang) {
  const action = card.actionTag;
  const nextZone = resolveNextZone({
    caseData, currentZone: state.current_zone, actionName: action,
    visitedZones: state.visited_zones,
    canBypassRequirements: strategy.skill_effects?.zone_unlock_bonus === true,
  });
  const available = getAvailableClueIds(caseData, nextZone, state.unlocked_clues,
    state.turn_count + 1, state.destroyed_clue_ids);
  const executor = strategy.team.find(agent => agent.agent_id === strategy.executing_agent_id);
  const values = { ...executor, ...strategy.combat_attributes,
    confusion_resistance: Number(executor.confusion_resistance) || 0 };
  const capability = agentExpertise(values, action) / 100 * 40;
  const seed = [state.run_id, state.turn_count + 1, action, strategy.executing_agent_id, nextZone].join(':');
  const roll = stableNarrativeHash(seed) % 1000;
  const clueChance = Math.min(900, Math.round((0.4 + Math.max(0, capability - 10) / 100) * 1000));
  const baseTrapChance = { low: 2, medium: 7, high: 16 }[card.risk_level];
  const trap = runRoll(seed, 'trap') < Math.max(1, baseTrapChance - Math.floor(Math.max(0, capability - 10) / 8));
  const clueId = !trap && available.length && roll < clueChance
    ? available[runRoll(seed, 'clue', available.length)] : null;
  const confusion = trap ? 6 + runRoll(seed, 'confusion', 7) : runRoll(seed, 'confusion', 6);
  const clue = caseData.clue_dictionary.find(item => item.clue_id === clueId);
  const outcome = trap ? 'trap' : clueId ? 'clue' : roll < 920 ? 'progress' : 'no_yield';
  const narrative = renderNarrative({
    runId: state.run_id, caseId: caseData.case_id, zoneId: nextZone,
    zoneName: caseData.scene?.zones?.[nextZone]?.label || caseData.zone_layout?.[nextZone]?.label,
    turn: state.turn_count + 1, actionTag: action, outcome,
    agentId: strategy.executing_agent_id, clueIds: clueId ? [clueId] : [],
    clueName: clue?.keyword, lang, seed,
  }, state.narrative_template_history);
  const settlement = normalizeSettlementResult({
    action_narration: narrative.text, action_name: action, outcome,
    narrative_template_id: narrative.templateId, new_clues_unlocked: clueId ? [clueId] : [],
    confusion_increase: confusion, time_cost: 1, health_change: 0,
    is_trap: trap, trap_narration: trap ? narrative.text : null, next_zone: nextZone,
  });

  // Reuse canonical AP, shield, stamina, confusion and ban-list settlement. The
  // three legacy Math.random bonuses are resolved by domain-separated run seeds.
  const fx = strategy.skill_effects || {};
  const incoming = [...settlement.new_clues_unlocked];
  const locked = available.filter(id => !incoming.includes(id));
  const pickBonus = (label, chance, pool = locked) => {
    if (pool.length && runRoll(seed, `${label}:chance`, 10000) < Math.max(0, chance || 0) * 10000) {
      const id = pool[runRoll(seed, `${label}:clue`, pool.length)];
      if (!incoming.includes(id)) incoming.push(id);
    }
  };
  const forensicActions = ['analyze_forensics', 'hack_terminal', 'check_cctv', 'access_database'];
  if (strategy.synergy_skills?.includes('digital_forensics')
    && (forensicActions.includes(action) || forensicActions.includes(state.last_action))) {
    pickBonus('digital-forensics', 0.2);
  }
  pickBonus('bonus-clue', fx.bonus_clue_chance);
  const zoneIds = new Set(getZoneClueIds(caseData, nextZone));
  const passive = caseData.clue_dictionary.map(item => item.clue_id).filter(id => zoneIds.has(id)
    && !state.unlocked_clues.includes(id) && !state.destroyed_clue_ids.includes(id) && !incoming.includes(id));
  const hiddenIds = new Set((caseData.hidden_clues || []).map(item => item.clue_id));
  const hiddenPool = passive.filter(id => hiddenIds.has(id));
  pickBonus('passive-scan', fx.passive_scan_chance, hiddenPool.length ? hiddenPool : passive);
  settlement.new_clues_unlocked = incoming;
  const deterministicStrategy = {
    ...strategy,
    synergy_skills: (strategy.synergy_skills || []).filter(id => id !== 'digital_forensics'),
    skill_effects: { ...fx, bonus_clue_chance: 0, passive_scan_chance: 0 },
  };
  const settled = applySettlementResult(state, settlement, deterministicStrategy, caseData);
  return { ...settled, settlement };
}
