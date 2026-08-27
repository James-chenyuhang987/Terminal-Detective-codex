// ═══════════════════════════════════════════════════════════════════════════
// llmClient.js — Base44 InvokeLLM layer
// All reasoning goes through the `detectiveLLM` backend function, which uses
// the built-in Base44 InvokeLLM integration. No external API keys.
// ═══════════════════════════════════════════════════════════════════════════

import { base44 } from '@/api/base44Client';
import { getAvailableClueIds, resolveNextZone } from '@/game/caseRuntime';
import { normalizeSettlementResult } from '@/game/settlementResult';

const LEGAL_ACTIONS = new Set([
  'talk_to_npc', 'search_area', 'examine_clue', 'check_alibi',
  'present_evidence', 'interrogate_suspect', 'access_database',
  'analyze_forensics', 'tail_suspect', 'bribe_informant',
  'hack_terminal', 'check_cctv',
]);
const LLM_TIMEOUT_MS = 45_000;

// 当前界面语言 — 决定 LLM 输出语言（由界面在语言切换时设置）
let currentLang = 'zh';
export function setLLMLang(lang) { currentLang = lang === 'en' ? 'en' : 'zh'; }

// Calls a named reasoning task on the backend. Returns plain text.
function abortError() {
  const error = new Error(currentLang === 'en' ? 'The investigation turn was aborted.' : '本轮调查已中止。');
  error.name = 'AbortError';
  return error;
}

function withAbort(promise, signal) {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timeoutId = setTimeout(() => {
      const error = new Error(currentLang === 'en' ? 'The reasoning service timed out. Please retry.' : '推理服务响应超时，请重试。');
      error.name = 'TimeoutError';
      finish(reject, error);
    }, LLM_TIMEOUT_MS);

    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => finish(resolve, value),
      error => finish(reject, error),
    );
  });
}

async function llmText(task, payload, signal) {
  const res = await withAbort(
    base44.functions.invoke('detectiveLLM', { task, payload: { ...payload, lang: currentLang } }),
    signal,
  );
  if (res.data?.error) throw new Error(res.data.error);
  return res.data?.text || '';
}

// Calls a named reasoning task that returns structured JSON.
async function llmJson(task, payload, signal) {
  const res = await withAbort(
    base44.functions.invoke('detectiveLLM', { task, payload: { ...payload, lang: currentLang } }),
    signal,
  );
  if (res.data?.error) throw new Error(res.data.error);
  return res.data?.data || null;
}

// ── Think Phase — streaming with typewriter ───────────────────────────────
export async function streamThink({ gameState, agentStrategy, chatHistory, banList, observation, onChunk, onDone, signal }) {
  const team = agentStrategy?.team || [];
  const primary = team[0] || agentStrategy || {};
  const combat = agentStrategy?.combat_attributes || primary.combat_attributes || primary;

  const text = await llmText('think', {
    agent: {
      agent_id: agentStrategy?.agent_id || primary.agent_id,
      role: agentStrategy?.role || primary.role,
      base_stance: agentStrategy?.base_stance || primary.base_stance,
      logic_power: combat.logic_power,
      observation_focus: combat.observation_focus,
    },
    team_summary: team.map(member =>
      `${member.agent_id || member.role}: logic ${member.logic_power || 0}, observation ${member.observation_focus || 0}, hack ${member.hack_level || 0}`
    ),
    priority_list: agentStrategy?.priority_list || primary.priority_list || [],
    chat_history: (chatHistory || []).slice(-6).map(h => ({ role: h.role, content: h.content })),
    observation,
    unlocked_clues: gameState?.unlocked_clues || [],
    ban_list: banList || [],
    confusion_score: gameState?.confusion_score || 0,
    turn_count: gameState?.turn_count || 1,
    linked_core_pairs: gameState?.linked_core_pairs || [],
  }, signal);

  let i = 0;
  const speedBoost = Math.max(0, Math.min(0.8, agentStrategy?.skill_effects?.think_speed_boost || 0));
  const intervalMs = Math.max(12, Math.round(28 * (1 - speedBoost)));
  const chunkSize = Math.max(1, Math.ceil(text.length / 120));
  return new Promise((resolve) => {
    if (signal?.aborted) { onDone(''); resolve(''); return; }
    const interval = setInterval(() => {
      if (signal?.aborted || i >= text.length) {
        clearInterval(interval);
        const completedText = signal?.aborted ? text.slice(0, i) : text;
        onDone(completedText);
        resolve(completedText);
        return;
      }
      const chunk = text.slice(i, i + chunkSize);
      onChunk(chunk);
      i += chunk.length;
    }, intervalMs);
  });
}

export async function streamThinkSSE({ gameState, agentStrategy, chatHistory, banList, observation, onChunk, onDone, signal }) {
  return streamThink({ gameState, agentStrategy, chatHistory, banList, observation, onChunk, onDone, signal });
}

// ── Act Phase ─────────────────────────────────────────────────────────────
export async function getAction({ thoughtProcess, gameState, agentStrategy = null, signal = null }) {
  return llmText('action', {
    thought_process: thoughtProcess,
    unlocked_clues: gameState?.unlocked_clues || [],
    turn_count: gameState?.turn_count || 0,
    priority_list: agentStrategy?.priority_list || [],
  }, signal);
}

// ── Settlement — GM resolves action ──────────────────────────────────────
export async function settleAction({ actionName, actionTag = null, gameState, caseData, agentStrategy = null, isIllegal = false, signal = null }) {
  const knownClues = (gameState.unlocked_clues || []).map(id => {
    const c = caseData.clue_dictionary?.find(x => x.clue_id === id);
    return c ? `${c.keyword}` : id;
  });

  const nextZone = resolveNextZone({
    caseData,
    currentZone: gameState.current_zone,
    actionName: actionTag || actionName,
    visitedZones: gameState.visited_zones,
    canBypassRequirements: agentStrategy?.skill_effects?.zone_unlock_bonus === true,
  });
  const lockedClues = getAvailableClueIds(caseData, nextZone, gameState.unlocked_clues);
  const effectiveAction = actionTag || actionName;
  const isHackAction = ['hack_terminal', 'access_database'].includes(effectiveAction);
  const hackBonus = isHackAction
    ? Math.max(0, agentStrategy?.skill_effects?.hack_success_rate || 0)
    : 0;
  const clueChance = Math.min(0.9, 0.4 + hackBonus);
  const randomNewClue = !isIllegal && Math.random() < clueChance && lockedClues.length > 0
    ? lockedClues[Math.floor(Math.random() * lockedClues.length)]
    : null;

  const narration = await llmText('settle', {
    case_title: caseData.title,
    scene_description: caseData.scene?.description || '',
    action_name: actionName,
    known_clues: knownClues,
    turn_count: gameState.turn_count,
    is_illegal: isIllegal,
    hint_keyword: randomNewClue
      ? (caseData.clue_dictionary?.find(c => c.clue_id === randomNewClue)?.keyword || randomNewClue)
      : null,
  }, signal);

  const confusionIncrease = isIllegal ? 8 : Math.floor(Math.random() * 6);
  const newClues = randomNewClue ? [randomNewClue] : [];

  return normalizeSettlementResult({
    action_narration: narration,
    action_name: actionTag || actionName,
    new_clues_unlocked: newClues,
    confusion_increase: confusionIncrease,
    time_cost: isIllegal ? 2 : 1,
    health_change: 0,
    is_trap: isIllegal && Math.random() < 0.3,
    trap_narration: isIllegal
      ? (currentLang === 'en' ? 'Invalid action triggered an adversarial response!' : '无效行动触发了敌对反制！')
      : null,
    next_zone: nextZone,
  });
}

// ── Link Check — 推理连线判定 ─────────────────────────────────────────────
export async function linkCheck({ clueA, clueB, caseData, synergyActive, signal = null }) {
  const result = await llmJson('link_check', {
    case_id: caseData.case_id,
    clue_a_id: clueA.clue_id,
    clue_b_id: clueB.clue_id,
    synergy_active: !!synergyActive,
  }, signal);
  if (!result || typeof result.is_valid !== 'boolean') {
    return { is_valid: false, reveal: currentLang === 'en' ? 'Deduction check failed, please retry.' : '推理验证失败，请重试。' };
  }
  return result;
}

// ── 决策卡牌生成 ───────────────────────────────────────────────────────────
export async function generateDecisionCards({ gameState, caseData, thoughtProcess, signal = null }) {
  const knownClues = (gameState.unlocked_clues || []).map(id => {
    const c = caseData.clue_dictionary?.find(x => x.clue_id === id);
    return c ? c.keyword : id;
  });
  const result = await llmJson('generate_decision_cards', {
    case_title: caseData.title,
    scene_description: caseData.scene?.description || '',
    known_clues: knownClues,
    confusion_score: gameState.confusion_score || 0,
    action_points_left: gameState.action_points_left || 0,
    turn_count: gameState.turn_count || 0,
    thought_process: thoughtProcess || '',
  }, signal);
  if (!Array.isArray(result?.cards)) return null;
  const cards = result.cards.filter(card =>
    card &&
    ['aggressive', 'steady', 'deceptive'].includes(card.style) &&
    ['high', 'medium', 'low'].includes(card.risk_level) &&
    LEGAL_ACTIONS.has(card.action_tag) &&
    typeof card.label === 'string'
  );
  return cards.length === 3 ? cards.slice(0, 3) : null;
}

// ── 推理重演过场叙事 ───────────────────────────────────────────────────────
export async function linkCinematic({ clueA, clueB, caseData, fragmentsFound, fragmentsTotal = 7, signal = null }) {
  const result = await llmJson('link_cinematic', {
    case_id: caseData.case_id,
    clue_a_id: clueA.clue_id,
    clue_b_id: clueB.clue_id,
    fragments_found: fragmentsFound || 0,
    fragments_total: fragmentsTotal,
  }, signal);
  if (!result?.narrative) return null;
  return {
    ...result,
    hidden_ending_progress: Math.min(fragmentsTotal, Math.max((fragmentsFound || 0) + 1, result.hidden_ending_progress || 0)),
  };
}

// ── NPC Dialogue ──────────────────────────────────────────────────────────
export async function getNPCDialogue({ npcId, agentStatement, gameState, caseData, agentStrategy, emotionLevel = 'calm', refusesTopic = null, signal = null }) {
  const npc = caseData.npcs?.find(n => n.npc_id === npcId);
  if (!npc) return {
    response: currentLang === 'en' ? 'No response.' : '没有回应。',
    npc_name: currentLang === 'en' ? 'Unknown' : '未知人物',
  };

  const main = await llmJson('npc', {
    case_id: caseData.case_id,
    npc_id: npc.npc_id,
    known_clue_ids: gameState.unlocked_clues || [],
    agent_statement: agentStatement,
    emotion_level: emotionLevel,
    refuses_topic: refusesTopic,
  }, signal);
  const response = main?.response || (currentLang === 'en' ? '...silence.' : '……沉默。');
  const emotionShift = Number(main?.emotion_shift) || 0;

  // 破防审讯技能：NPC 回避时自动追问，概率揭示新线索
  const fx = agentStrategy?.skill_effects || {};
  if (fx.interrogation_bonus && Math.random() < fx.interrogation_bonus) {
    const locked = getAvailableClueIds(
      caseData,
      gameState.current_zone,
      gameState.unlocked_clues || [],
    );
    if (locked.length > 0) {
      const bonusClueId = locked[Math.floor(Math.random() * locked.length)];
      const followupRes = await llmJson('npc', {
        case_id: caseData.case_id,
        npc_id: npc.npc_id,
        known_clue_ids: gameState.unlocked_clues || [],
        agent_statement: currentLang === 'en'
          ? `(The agent activates Breakthrough Interrogation and presses the opening.) What are you avoiding? I saw that micro-expression. Tell me the truth about “${caseData.clue_dictionary?.find(c => c.clue_id === bonusClueId)?.keyword || 'that matter'}”.`
          : `（探员发动破防审讯，步步紧逼）你在回避什么？我看到你的微表情了。关于「${caseData.clue_dictionary?.find(c => c.clue_id === bonusClueId)?.keyword || '那件事'}」，说实话。`,
        emotion_level: emotionLevel,
      }, signal);
      return {
        response, npc_name: npc.name, emotion_shift: Math.min(1, emotionShift + 1),
        followup: followupRes?.response || '', bonus_clue: bonusClueId,
      };
    }
  }

  return { response, npc_name: npc.name, emotion_shift: emotionShift };
}

// ── Judge Evaluation ──────────────────────────────────────────────────────
export async function judgeReport({ playerReport, caseData, signal = null }) {
  const result = await llmJson('judge', {
    case_id: caseData.case_id,
    player_report: playerReport,
  }, signal);

  if (!result || typeof result.score !== 'string') {
    return {
      score: 'C',
      is_passed: false,
      critique: currentLang === 'en' ? 'Unable to evaluate report. Please try again.' : '暂时无法评估报告，请重试。',
    };
  }
  return result;
}

// ── Branch Check ──────────────────────────────────────────────────────────
export async function branchCheck({ playerReport, caseData, signal = null }) {
  const result = await llmJson('branch', {
    case_id: caseData.case_id,
    player_report: playerReport,
  }, signal);

  return result || { is_absurd: false };
}

// ── Summarize ─────────────────────────────────────────────────────────────
export async function summarizeHistory({ history, agentName }) {
  return llmText('summarize', {
    agent_name: agentName,
    history: (history || []).map(h => `${h.role}: ${h.content}`),
  });
}

// ── Action Tag Parser ─────────────────────────────────────────────────────
export function parseActionTag(text) {
  const match = text.match(/\[ACTION:\s*([^\]]+)\]/i);
  return match ? match[1].trim().toLowerCase().replace(/\s+/g, '_') : null;
}
