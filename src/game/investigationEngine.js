// Compatibility facade retained for existing imports. Investigation text and
// action settlement are now deterministic and local; secret-sensitive checks
// are delegated to detectiveRules, never to a model.

import { getAvailableClueIds, resolveNextZone } from '@/game/caseRuntime';
import { normalizeSettlementResult } from '@/game/settlementResult';
import { agentExpertise } from '@/game/commandSystem';
import { buildLocalThought, renderNarrative, stableNarrativeHash } from '@/game/narrativeEngine';
import { checkDeterministicLink, setRulesLang } from '@/game/detectiveRulesClient';

const LEGAL_ACTIONS = new Set([
  'talk_to_npc', 'search_area', 'examine_clue', 'check_alibi',
  'present_evidence', 'interrogate_suspect', 'access_database',
  'analyze_forensics', 'tail_suspect', 'bribe_informant',
  'hack_terminal', 'check_cctv',
]);

let currentLang = 'zh';
export function setInvestigationLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'zh';
  setRulesLang(currentLang);
}

function abortError() {
  const error = new Error(currentLang === 'en' ? 'The investigation turn was aborted.' : '本轮调查已中止。');
  error.name = 'AbortError';
  return error;
}

export async function streamThink({ gameState, caseData, agentStrategy, observation, onChunk, onDone, signal }) {
  const text = buildLocalThought({ gameState, caseData, agentStrategy, observation, lang: currentLang });
  let index = 0;
  const speedBoost = Math.max(0, Math.min(0.8, agentStrategy?.skill_effects?.think_speed_boost || 0));
  const intervalMs = Math.max(8, Math.round(20 * (1 - speedBoost)));
  const chunkSize = Math.max(1, Math.ceil(text.length / 90));
  return new Promise(resolve => {
    if (signal?.aborted) {
      onDone?.('');
      resolve('');
      return;
    }
    const timer = window.setInterval(() => {
      if (signal?.aborted || index >= text.length) {
        window.clearInterval(timer);
        const completed = signal?.aborted ? text.slice(0, index) : text;
        onDone?.(completed);
        resolve(completed);
        return;
      }
      const chunk = text.slice(index, index + chunkSize);
      onChunk?.(chunk);
      index += chunk.length;
    }, intervalMs);
  });
}

export const streamInvestigationThought = streamThink;

export async function getAction({ agentStrategy = null, signal = null }) {
  if (signal?.aborted) throw abortError();
  const preferred = (agentStrategy?.priority_list || []).find(action => LEGAL_ACTIONS.has(action)) || 'search_area';
  return `[ACTION: ${preferred}]`;
}

export async function settleAction({ actionName, actionTag = null, riskLevel = 'low', gameState, caseData, agentStrategy = null, isIllegal = false, signal = null }) {
  if (signal?.aborted) throw abortError();
  const effectiveAction = actionTag || actionName || 'search_area';
  const nextZone = resolveNextZone({
    caseData,
    currentZone: gameState.current_zone,
    actionName: effectiveAction,
    visitedZones: gameState.visited_zones,
    canBypassRequirements: agentStrategy?.skill_effects?.zone_unlock_bonus === true,
  });
  const availableClues = getAvailableClueIds(
    caseData,
    nextZone,
    gameState.unlocked_clues,
    gameState.turn_count + 1,
  );
  const executor = (agentStrategy?.team || []).find(agent => agent.agent_id === agentStrategy?.executing_agent_id)
    || agentStrategy?.team?.[0]
    || {};
  const values = {
    ...executor,
    ...(agentStrategy?.combat_attributes || {}),
    confusion_resistance: Number(executor.confusion_resistance) || 0,
  };
  const relevantCapability = (agentExpertise(values, effectiveAction) / 100) * 40;
  const seed = [gameState.run_id, gameState.turn_count + 1, effectiveAction, agentStrategy?.executing_agent_id, nextZone].join(':');
  const roll = stableNarrativeHash(seed) % 1000;
  const clueChance = Math.min(900, Math.round((0.4 + Math.max(0, relevantCapability - 10) / 100) * 1000));
  const normalizedRisk = ['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : 'low';
  const baseTrapChance = { low: 2, medium: 7, high: 16 }[normalizedRisk];
  const trapMitigation = Math.floor(Math.max(0, relevantCapability - 10) / 8);
  const trap = isIllegal
    ? (stableNarrativeHash(`${seed}:trap`) % 100) < 30
    : (stableNarrativeHash(`${seed}:trap`) % 100) < Math.max(1, baseTrapChance - trapMitigation);
  const clueId = !isIllegal && !trap && availableClues.length && roll < clueChance
    ? availableClues[stableNarrativeHash(`${seed}:clue`) % availableClues.length]
    : null;
  const confusionIncrease = isIllegal
    ? 8
    : trap
      ? 6 + (stableNarrativeHash(`${seed}:confusion`) % 7)
      : stableNarrativeHash(`${seed}:confusion`) % 6;
  const clue = clueId ? caseData.clue_dictionary?.find(item => item.clue_id === clueId) : null;
  const outcome = isIllegal ? 'illegal' : trap ? 'trap' : clueId ? 'clue' : roll < 920 ? 'progress' : 'no_yield';
  const narrative = renderNarrative({
    runId: gameState.run_id,
    caseId: caseData.case_id,
    zoneId: nextZone,
    zoneName: caseData.scene?.zones?.[nextZone]?.label || caseData.zone_layout?.[nextZone]?.label,
    turn: gameState.turn_count + 1,
    actionTag: effectiveAction,
    outcome,
    agentId: agentStrategy?.executing_agent_id,
    clueIds: clueId ? [clueId] : [],
    clueName: clue?.keyword,
    lang: currentLang,
    seed,
  }, gameState.narrative_template_history || []);
  return normalizeSettlementResult({
    action_narration: narrative.text,
    action_name: effectiveAction,
    narrative_template_id: narrative.templateId,
    new_clues_unlocked: clueId ? [clueId] : [],
    confusion_increase: confusionIncrease,
    time_cost: isIllegal ? 2 : 1,
    health_change: 0,
    is_trap: trap,
    trap_narration: trap ? narrative.text : null,
    next_zone: nextZone,
  });
}

export async function linkCheck({ clueA, clueB, caseData, synergyActive, signal = null }) {
  return checkDeterministicLink({
    caseData,
    clueAId: clueA.clue_id,
    clueBId: clueB.clue_id,
    synergyActive,
    signal,
  });
}

export async function summarizeHistory({ history }) {
  const count = Array.isArray(history) ? history.length : 0;
  return currentLang === 'en'
    ? `${count} investigation records are archived locally. Review the latest evidence before choosing the next legal action.`
    : `本地已归档 ${count} 条调查记录，请结合最新证据选择下一项合法行动。`;
}

export function parseActionTag(text) {
  const match = String(text || '').match(/\[ACTION:\s*([^\]]+)\]/i);
  return match ? match[1].trim().toLowerCase().replace(/\s+/g, '_') : null;
}
