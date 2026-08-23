// ═══════════════════════════════════════════════════════════════════════════
// agentProgression.js — Agent leveling, XP, and passive skill system
// ═══════════════════════════════════════════════════════════════════════════

// XP required per level (cumulative)
export const LEVEL_XP_TABLE = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
export const MAX_LEVEL = LEVEL_XP_TABLE.length - 1;

// XP rewards per case outcome
export const XP_REWARDS = {
  case_solved_S: 300,
  case_solved_A: 220,
  case_solved_B: 150,
  case_solved_C: 80,
  case_solved_D: 30,
  clue_found:    15,
  npc_cracked:   25,
  no_bsod:       40,
};

// ── Passive skill trees per agent archetype ────────────────────────────────
// Each skill: { id, name, icon, desc, unlock_level, effect_key, effect_value }
export const SKILL_TREES = [
  // Agent 0 — 隼目 (Observer)
  [
    { id: 's0_1', name: '锐利感知',    icon: '👁️‍🗨️', desc: 'AP消耗降低10%', unlock_level: 2, effect_key: 'ap_cost_discount',      effect_value: 0.10 },
    { id: 's0_2', name: '证据联想',    icon: '🔗',    desc: '每回合有15%概率额外发现一条线索', unlock_level: 4, effect_key: 'bonus_clue_chance', effect_value: 0.15 },
    { id: 's0_3', name: '全息扫描',    icon: '📡',   desc: '混乱值每轮自动降低5点',           unlock_level: 6, effect_key: 'confusion_regen',   effect_value: 5 },
    { id: 's0_4', name: '鹰眼协议',    icon: '🦅',   desc: 'AP消耗再降低15%（叠加）',         unlock_level: 8, effect_key: 'ap_cost_discount',  effect_value: 0.15 },
    { id: 's0_5', name: '全知视界',    icon: '🌐',   desc: '游戏开始自动解锁第一条线索',       unlock_level: 10, effect_key: 'auto_unlock_first', effect_value: true },
  ],
  // Agent 1 — 破心 (Enforcer)
  [
    { id: 's1_1', name: '心理压制',    icon: '🔥',   desc: 'NPC对话时混乱值增加减少20%',      unlock_level: 2, effect_key: 'npc_confusion_reduce', effect_value: 0.20 },
    { id: 's1_2', name: '思维加速',    icon: '⚡',   desc: 'Think阶段速度提升30%',             unlock_level: 4, effect_key: 'think_speed_boost',    effect_value: 0.30 },
    { id: 's1_3', name: '破防审讯',    icon: '💥',   desc: 'NPC拒绝回答时自动追问，有30%概率获得线索', unlock_level: 6, effect_key: 'interrogation_bonus', effect_value: 0.30 },
    { id: 's1_4', name: '铁血逻辑',    icon: '⚔️',  desc: '混乱抵抗提升25%',                 unlock_level: 8, effect_key: 'confusion_resistance', effect_value: 0.25 },
    { id: 's1_5', name: '意志核心',    icon: '🧬',   desc: 'BSOD触发时自动回满混乱值并免除AP罚',unlock_level: 10, effect_key: 'bsod_immunity',       effect_value: true },
  ],
  // Agent 2 — 幽灵 (Phantom Hacker)
  [
    { id: 's2_1', name: '数字渗透',    icon: '💾',   desc: '黑客类动作成功率提升20%',          unlock_level: 2, effect_key: 'hack_success_rate',  effect_value: 0.20 },
    { id: 's2_2', name: '加密破解',    icon: '🔓',   desc: '自动解密加密线索，无需AP',         unlock_level: 4, effect_key: 'free_decrypt',        effect_value: true },
    { id: 's2_3', name: '权限提升',    icon: '🛡️',  desc: '系统黑入动作解锁隐藏区域',         unlock_level: 6, effect_key: 'zone_unlock_bonus',   effect_value: true },
    { id: 's2_4', name: '神经接口',    icon: '🔌',   desc: '每回合被动扫描，5%概率发现隐藏线索', unlock_level: 8, effect_key: 'passive_scan_chance', effect_value: 0.05 },
    { id: 's2_5', name: '量子幽灵',    icon: '👻',   desc: '完全免疫陷阱事件(is_trap)',        unlock_level: 10, effect_key: 'trap_immunity',       effect_value: true },
  ],
];

// ── Helper functions ───────────────────────────────────────────────────────
export function getLevelFromXP(xp) {
  let level = 0;
  for (let i = 1; i <= MAX_LEVEL; i++) {
    if (xp >= LEVEL_XP_TABLE[i]) level = i;
    else break;
  }
  return level;
}

export function getXPToNextLevel(xp) {
  const level = getLevelFromXP(xp);
  if (level >= MAX_LEVEL) return { current: 0, needed: 0, pct: 100 };
  const base = LEVEL_XP_TABLE[level];
  const next = LEVEL_XP_TABLE[level + 1];
  const current = xp - base;
  const needed = next - base;
  return { current, needed, pct: Math.round((current / needed) * 100) };
}

export function getUnlockedSkills(xp, agentIdx) {
  const level = getLevelFromXP(xp);
  return (SKILL_TREES[agentIdx] || []).filter(s => level >= s.unlock_level);
}

export function getSkillEffects(xp, agentIdx) {
  const skills = getUnlockedSkills(xp, agentIdx);
  const effects = {};
  skills.forEach(s => {
    if (effects[s.effect_key] !== undefined) {
      // Additive stacking for numeric values
      if (typeof s.effect_value === 'number') {
        effects[s.effect_key] = (effects[s.effect_key] || 0) + s.effect_value;
      } else {
        effects[s.effect_key] = s.effect_value;
      }
    } else {
      effects[s.effect_key] = s.effect_value;
    }
  });
  return effects;
}

// ── Progression LocalStorage ───────────────────────────────────────────────
const STORAGE_KEY = 'agent_progression_v1';
const REWARDED_RUNS_KEY = 'agent_rewarded_runs_v1';

function resolveStorage(storage) {
  if (storage) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadProgression(storage) {
  const target = resolveStorage(storage);
  try {
    const raw = target?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Default: 3 agents, 0 XP each
  return [{ xp: 0 }, { xp: 0 }, { xp: 0 }];
}

export function saveProgression(prog, storage) {
  const target = resolveStorage(storage);
  try {
    target?.setItem(STORAGE_KEY, JSON.stringify(prog));
  } catch {}
}

export function addXP(progression, agentIdx, amount) {
  const updated = [...progression];
  updated[agentIdx] = { ...updated[agentIdx], xp: (updated[agentIdx].xp || 0) + amount };
  return updated;
}

export function addXPAll(progression, amount) {
  return progression.map(p => ({ ...p, xp: (p.xp || 0) + amount }));
}

export function grantXPAllOnce(runId, amount, storage) {
  const target = resolveStorage(storage);
  const current = loadProgression(target);
  if (!target || !runId || !Number.isFinite(amount) || amount <= 0) {
    return { progression: current, awarded: false };
  }

  try {
    const rewarded = JSON.parse(target.getItem(REWARDED_RUNS_KEY) || '[]');
    if (Array.isArray(rewarded) && rewarded.includes(runId)) {
      return { progression: current, awarded: false };
    }

    const updated = addXPAll(current, amount);
    target.setItem(STORAGE_KEY, JSON.stringify(updated));
    const nextRewarded = [...(Array.isArray(rewarded) ? rewarded : []), runId].slice(-100);
    target.setItem(REWARDED_RUNS_KEY, JSON.stringify(nextRewarded));
    return { progression: updated, awarded: true };
  } catch {
    return { progression: current, awarded: false };
  }
}
