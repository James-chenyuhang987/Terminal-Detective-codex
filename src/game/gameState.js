// ═══════════════════════════════════════════════════════════════════════════
// core_state.js — Single Source of Truth
// All game state lives here. No component may mutate state directly.
// ═══════════════════════════════════════════════════════════════════════════

import { DEFAULT_AGENT_CONFIG } from './caseData.js';
import { getInitialZone, getZoneClueIds, isValidZoneTransition } from './caseRuntime.js';
import { normalizeSettlementResult } from './settlementResult.js';

// ── Initial State Factory ─────────────────────────────────────────────────
export function createInitialGameState(caseData, runtimeEffects = {}) {
  const initialZone = getInitialZone(caseData);
  return {
    run_id: `${caseData.case_id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    case_id: caseData.case_id,
    case_title: caseData.title,
    current_hp: 100,
    action_points_left: 20 + Math.max(0, Number(runtimeEffects.initial_ap_bonus) || 0),
    ap_discount_credit: 0,
    unlocked_clues: [],
    unlocked_clues_set: new Set(), // fast lookup
    current_zone: initialZone,
    visited_zones: initialZone ? [initialZone] : [],
    turn_count: 0,
    react_state: 'IDLE',
    confusion_score: 0,
    vision_penalty: 0,
    action_ban_list: [],
    chat_history: [],
    thought_log: [],
    last_observation: '',
    last_action: null,
    is_crashed: false,
    trap_shield_charges: runtimeEffects.ignore_first_trap ? 1 : 0,
    traps_triggered: 0,
    evidence_crisis: null,
    reputation: 100,
    checkpoint_stack: [],
  };
}

// ── LocalStorage Manager ──────────────────────────────────────────────────
export const LocalStorage = {
  saveStrategy(payload) {
    try { localStorage.setItem('save_strategy_current', JSON.stringify(payload)); } catch { /* storage unavailable */ }
  },
  loadStrategy() {
    try {
      return JSON.parse(localStorage.getItem('save_strategy_current')) || { ...DEFAULT_AGENT_CONFIG };
    } catch { return { ...DEFAULT_AGENT_CONFIG }; }
  },
  saveTeamConfig(config) {
    try { localStorage.setItem('save_team_config', JSON.stringify(config)); } catch { /* storage unavailable */ }
  },
  loadTeamConfig() {
    try {
      return JSON.parse(localStorage.getItem('save_team_config')) || null;
    } catch { return null; }
  },
  saveCheckpoints(stack) {
    try {
      // store only last 3 checkpoints to avoid quota issues
      localStorage.setItem('save_checkpoints', JSON.stringify(stack.slice(-3)));
    } catch {}
  },
  loadCheckpoints() {
    try {
      return JSON.parse(localStorage.getItem('save_checkpoints')) || [];
    } catch { return []; }
  },
  clearAll() {
    try {
      localStorage.removeItem('save_strategy_current');
      localStorage.removeItem('save_team_config');
      localStorage.removeItem('save_checkpoints');
    } catch { /* storage unavailable */ }
  }
};

// ── Checkpoint Manager ────────────────────────────────────────────────────
export function pushCheckpoint(state) {
  // Deep-clone safe snapshot (exclude non-serializable Set)
  const snap = JSON.parse(JSON.stringify({ ...state, unlocked_clues_set: undefined }));
  const stack = [...(state.checkpoint_stack || []), snap].slice(-3);
  LocalStorage.saveCheckpoints(stack);
  return stack;
}

export function popCheckpoint(state) {
  const stack = [...(state.checkpoint_stack || [])];
  if (stack.length === 0) return null;
  const snap = stack.pop();
  snap.checkpoint_stack = stack;
  snap.unlocked_clues_set = new Set(snap.unlocked_clues || []);
  return snap;
}

// ── State Mutation Helper ─────────────────────────────────────────────────
export function applySettlementResult(state, settlement, agentStrategy, caseData) {
  settlement = normalizeSettlementResult(settlement);
  const newState = { ...state };
  // 已装备技能效果 + 协同技能（大厅配置真实生效）
  const fx = agentStrategy?.skill_effects || {};
  const synergySkills = agentStrategy?.synergy_skills || [];
  const nextZone = settlement.next_zone && isValidZoneTransition(caseData, state.current_zone, settlement.next_zone)
    ? settlement.next_zone
    : state.current_zone;

  // 仓库防火墙优先抵消一次陷阱；量子幽灵则完全免疫。
  if (settlement.is_trap && newState.trap_shield_charges > 0) {
    settlement = { ...settlement, is_trap: false, trap_narration: null };
    newState.trap_shield_charges -= 1;
  } else if (settlement.is_trap && fx.trap_immunity) {
    settlement = { ...settlement, is_trap: false, trap_narration: null };
  }
  if (settlement.is_trap) newState.traps_triggered = (newState.traps_triggered || 0) + 1;

  // HP change
  newState.current_hp = Math.max(0, Math.min(100,
    newState.current_hp + (settlement.health_change || 0)
  ));

  // AP cost — apply discount from agent modifier + skill effects
  const apDiscount = Math.min(0.6,
    (agentStrategy?.engine_modifiers?.ap_cost_discount || 0) + (fx.ap_cost_discount || 0));
  const rawApCost = Math.max(1, settlement.time_cost || 1);
  const isFreeDecrypt = fx.free_decrypt === true &&
    ['hack_terminal', 'access_database'].includes(settlement.action_name);
  const exactApCost = rawApCost * (1 - apDiscount);
  const priorCredit = Math.max(0, Number(state.ap_discount_credit) || 0);
  const apCost = isFreeDecrypt
    ? 0
    : Math.max(0, Math.ceil(exactApCost - priorCredit - Number.EPSILON));
  newState.ap_discount_credit = isFreeDecrypt
    ? priorCredit
    : Math.max(0, priorCredit + apCost - exactApCost);
  newState.action_points_left = Math.max(0, newState.action_points_left - apCost);

  // New clues — strict ID validation
  let incomingClues = settlement.new_clues_unlocked || [];

  // 数字法证协同：法证/黑客类行动线索发现率 +20%
  const forensicActions = ['analyze_forensics', 'hack_terminal', 'check_cctv', 'access_database'];
  const isForensic = forensicActions.includes(state.last_action) || forensicActions.includes(settlement.action_name);
  const allIds = caseData?.clue_dictionary?.map(c => c.clue_id) || [];
  const zoneIds = new Set(getZoneClueIds(caseData, nextZone));
  const lockedIds = allIds.filter(id =>
    zoneIds.has(id) && !state.unlocked_clues.includes(id) && !incomingClues.includes(id)
  );
  if (synergySkills.includes('digital_forensics') && isForensic && lockedIds.length > 0 && Math.random() < 0.20) {
    incomingClues = [...incomingClues, lockedIds[Math.floor(Math.random() * lockedIds.length)]];
  }
  // 证据联想技能：每回合概率额外发现一条线索
  if (fx.bonus_clue_chance && lockedIds.length > 0 && Math.random() < fx.bonus_clue_chance) {
    const pick = lockedIds[Math.floor(Math.random() * lockedIds.length)];
    if (!incomingClues.includes(pick)) incomingClues = [...incomingClues, pick];
  }
  // 神经接口：被动扫描优先发现当前区域的隐藏线索。
  if (fx.passive_scan_chance && lockedIds.length > 0 && Math.random() < fx.passive_scan_chance) {
    const hiddenIds = new Set((caseData?.hidden_clues || []).map(clue => clue.clue_id));
    const hiddenPool = lockedIds.filter(id => hiddenIds.has(id) && !incomingClues.includes(id));
    const fallbackPool = lockedIds.filter(id => !incomingClues.includes(id));
    const pool = hiddenPool.length ? hiddenPool : fallbackPool;
    if (pool.length) incomingClues = [...incomingClues, pool[Math.floor(Math.random() * pool.length)]];
  }

  const newClues = incomingClues.filter(id =>
    id && allIds.includes(id) && zoneIds.has(id) && !newState.unlocked_clues.includes(id)
  );
  newState.unlocked_clues = [...newState.unlocked_clues, ...newClues];
  newState.unlocked_clues_set = new Set(newState.unlocked_clues);

  // Zone movement is deterministic and validated against the case graph.
  if (nextZone && nextZone !== state.current_zone) {
    newState.current_zone = nextZone;
    newState.visited_zones = [...new Set([...(state.visited_zones || []), nextZone])];
  }

  // Confusion — apply confusion_resistance modifier + skill/synergy effects
  const resistance = Math.min(0.8,
    (agentStrategy?.engine_modifiers?.confusion_resistance || 0) + (fx.confusion_resistance || 0));
  const baseConfusion = settlement.confusion_increase || 0;
  let actualConfusion = Math.round(baseConfusion * (1 - resistance));
  // 专长过载惩罚：混乱增长 +15%
  if (agentStrategy?.specialty_overload) {
    actualConfusion = Math.round(actualConfusion * 1.15);
  }
  newState.confusion_score = Math.min(100, newState.confusion_score + actualConfusion);
  // 全息扫描技能：混乱值每轮自动回落
  if (fx.confusion_regen) {
    newState.confusion_score = Math.max(0, newState.confusion_score - fx.confusion_regen);
  }

  // Conflict dictionary check — extra confusion if mutually exclusive clues both held
  // (checked here locally so no extra API call)
  // (handled in InvestigationTerminal via caseData.conflict_dictionary)

  // Zero-yield action ban list tracking
  const isZeroYield = newClues.length === 0 && (settlement.health_change || 0) === 0;
  if (isZeroYield) {
    // Push current action to ban list, keep max 3
    const banned = [newState.last_action, ...(newState.action_ban_list || [])].filter(Boolean);
    newState.action_ban_list = [...new Set(banned)].slice(0, 3);
    // Extra confusion penalty for consecutive zero-yield
    if (newState.action_ban_list.length >= 2) {
      newState.confusion_score = Math.min(100, newState.confusion_score + 10);
    }
  } else {
    newState.action_ban_list = [];
  }

  // Reputation update
  if (settlement.is_trap) {
    newState.reputation = Math.max(0, newState.reputation - 5);
  }

  newState.turn_count = newState.turn_count + 1;

  return { newState, newClues };
}

// ── Observation Generator ─────────────────────────────────────────────────
export function generateObservation(gameState, caseData) {
  const zone = caseData.scene.zones[gameState.current_zone];
  const clueCount = gameState.unlocked_clues.length;
  const clueTotal = caseData.clue_dictionary.length;

  const npcList = caseData.npcs.map(n => `${n.avatar} ${n.name} [${n.role}]`).join(' | ');

  const clueDetails = gameState.unlocked_clues.length > 0
    ? gameState.unlocked_clues.map(id => {
        const c = caseData.clue_dictionary.find(x => x.clue_id === id);
        return c ? `  ${c.visual_icon} [${c.clue_id}] ${c.keyword}: ${c.description}` : `  ${id}`;
      }).join('\n')
    : '  None secured. Begin investigation.';

  const bannedText = gameState.action_ban_list?.length > 0
    ? `⛔ ZERO-YIELD (ban): ${gameState.action_ban_list.join(', ')}`
    : '';

  const confusionWarning = gameState.confusion_score >= 60
    ? `⚠️  WARNING: Logic matrix destabilizing at ${gameState.confusion_score}% — agent coherence at risk!`
    : '';

  return `╔══ SYSTEM SCAN · TURN ${gameState.turn_count + 1} ══╗
📍 Location : ${zone?.label || gameState.current_zone}
👥 Contacts : ${npcList}
🔍 Evidence : ${clueCount}/${clueTotal} secured
💢 Confusion: ${gameState.confusion_score}%  ❤️ HP: ${gameState.current_hp}%  ⚡ AP: ${gameState.action_points_left}/20
🏆 Reputation: ${gameState.reputation}pts
${bannedText}
${confusionWarning}

── SECURED EVIDENCE ──
${clueDetails}
╚══════════════════════╝`;
}

// ── Conflict Dictionary Checker ───────────────────────────────────────────
// Returns true if current unlocked clues contain mutually exclusive pairs
export function checkConflictClues(unlockedClues, conflictDictionary) {
  if (!conflictDictionary?.length) return false;
  const ids = new Set(unlockedClues);
  return conflictDictionary.some(c => ids.has(c.clue_A) && ids.has(c.clue_B));
}
