// ═══════════════════════════════════════════════════════════════════════════
// specialtySystem.js — 专长槽 + 组队协同技能系统
// 每位探员：固定 base_attrs + 有限 20 点专长分配（仅限 specialty_slots 内）
// 三人组合触发协同技能，随部署打包进 teamConfig
// ═══════════════════════════════════════════════════════════════════════════

import { SKILL_TREES } from './agentProgression.js';

export const SPECIALTY_BUDGET = 20;

export const ATTR_MAX = {
  logic_power: 40,
  observation_focus: 40,
  confusion_resistance: 40,
  ap_cost_discount: 30,
  hack_level: 40,
};

export const ATTR_META = [
  { key: 'logic_power',          label: 'LOGIC POWER', labelZh: '逻辑强度', color: '#00e5ff' },
  { key: 'observation_focus',    label: 'OBSERVATION', labelZh: '观察专注', color: '#a78bfa' },
  { key: 'confusion_resistance', label: 'ANTI-CHAOS',  labelZh: '抗干扰',   color: '#00ff88' },
  { key: 'ap_cost_discount',     label: 'AP DISCOUNT', labelZh: '行动折扣', color: '#ffaa00', isPercent: true },
  { key: 'hack_level',           label: 'HACK LEVEL',  labelZh: '黑客等级', color: '#ff6b35' },
];

// 职业固定基础属性 + 可强化的专长方向
export const AGENT_SPECIALTIES = [
  {
    id: 'NEXUS-01',
    base_attrs: { logic_power: 20, observation_focus: 10, confusion_resistance: 10, ap_cost_discount: 10, hack_level: 10 },
    specialty_slots: ['logic_power', 'confusion_resistance'],
  },
  {
    id: 'AURORA-09',
    base_attrs: { logic_power: 10, observation_focus: 20, confusion_resistance: 10, ap_cost_discount: 10, hack_level: 10 },
    specialty_slots: ['observation_focus', 'logic_power'],
  },
  {
    id: 'CIPHER-47',
    base_attrs: { logic_power: 10, observation_focus: 10, confusion_resistance: 10, ap_cost_discount: 10, hack_level: 20 },
    specialty_slots: ['hack_level', 'ap_cost_discount'],
  },
];

export function specUsed(spec) {
  return Object.values(spec || {}).reduce((s, v) => s + (v || 0), 0);
}

export function specRemaining(spec) {
  return Math.max(0, SPECIALTY_BUDGET - specUsed(spec));
}

// 有效属性 = 基础 + 专长加成（受属性上限约束）
export function effectiveAttrs(agentIdx, spec) {
  const def = AGENT_SPECIALTIES[agentIdx];
  const out = {};
  Object.entries(def.base_attrs).forEach(([k, base]) => {
    const bonus = def.specialty_slots.includes(k) ? (spec?.[k] || 0) : 0;
    out[k] = Math.min(ATTR_MAX[k], base + bonus);
  });
  return out;
}

// 该属性还能加多少点（余额 + 上限双重约束）
export function maxBonusFor(agentIdx, spec, attrKey) {
  const def = AGENT_SPECIALTIES[agentIdx];
  if (!def.specialty_slots.includes(attrKey)) return 0;
  const current = spec?.[attrKey] || 0;
  const byBudget = current + specRemaining(spec);
  const byCap = ATTR_MAX[attrKey] - def.base_attrs[attrKey];
  return Math.min(byBudget, byCap);
}

// ── 协同技能定义 ────────────────────────────────────────────────────────────
// check 接收三人有效属性数组 [nexus, aurora, cipher]
export const SYNERGY_SKILLS = [
  {
    id: 'cross_validation',
    name: '交叉验证',
    icon: '🔗',
    color: '#00e5ff',
    condition: 'NEXUS 逻辑≥30 + AURORA 观察≥30',
    desc: '推理连线难度降低，AI 更容易认可线索间的逻辑关联',
    check: (a) => a[0].logic_power >= 30 && a[1].observation_focus >= 30,
  },
  {
    id: 'digital_forensics',
    name: '数字法证',
    icon: '🧪',
    color: '#a78bfa',
    condition: 'CIPHER 黑客≥30 + AURORA 观察≥30',
    desc: '法证/黑客类行动线索发现率 +20%',
    check: (a) => a[2].hack_level >= 30 && a[1].observation_focus >= 30,
  },
  {
    id: 'ghost_protocol',
    name: '幽灵协议',
    icon: '👻',
    color: '#ff6b35',
    condition: 'CIPHER 黑客≥30 + NEXUS 抗干扰≥25',
    desc: '危机事件惩罚额外降低 20%',
    check: (a) => a[2].hack_level >= 30 && a[0].confusion_resistance >= 25,
  },
];

// ── 协同计算（升级版）──────────────────────────────────────────────────────
// specs: [{...spec}, {...spec}, {...spec}]
export function calcTeamSynergy(specs) {
  const attrs = specs.map((spec, i) => effectiveAttrs(i, spec));

  const active = SYNERGY_SKILLS.filter(s => s.check(attrs));
  const inactive = SYNERGY_SKILLS.filter(s => !s.check(attrs));

  // 专长过载：三人把大部分点数堆在同一属性方向
  const primaries = specs.map((spec, i) => {
    const slots = AGENT_SPECIALTIES[i].specialty_slots;
    let best = null, bestVal = 0;
    slots.forEach(k => {
      const v = spec?.[k] || 0;
      if (v > bestVal) { bestVal = v; best = k; }
    });
    return bestVal >= SPECIALTY_BUDGET * 0.6 ? best : null;
  });
  const allocated = primaries.filter(Boolean);
  const overload = allocated.length === 3 && new Set(allocated).size === 1;

  // 专长匹配度：主攻方向越分散越互补
  const distinct = new Set(specs.map((spec, i) => {
    const slots = AGENT_SPECIALTIES[i].specialty_slots;
    let best = slots[0], bestVal = -1;
    slots.forEach(k => { const v = spec?.[k] || 0; if (v > bestVal) { bestVal = v; best = k; } });
    return best;
  })).size;
  const matchScore = distinct / 3; // 0.33 / 0.66 / 1.0

  return { attrs, active, inactive, overload, matchScore };
}

// ── 已装备技能效果汇总（读取技能树装备状态）──────────────────────────────────
export function getEquippedSkillEffects(loadout) {
  const equipped = Array.isArray(loadout)
    ? loadout.map(row => Array.isArray(row) ? row : row?.skill_ids || [])
    : [[], [], []];

  const effects = {};
  equipped.forEach((ids, agentIdx) => {
    (ids || []).forEach(id => {
      const skill = (SKILL_TREES[agentIdx] || []).find(s => s.id === id);
      if (!skill) return;
      if (typeof skill.effect_value === 'number') {
        effects[skill.effect_key] = (effects[skill.effect_key] || 0) + skill.effect_value;
      } else {
        effects[skill.effect_key] = skill.effect_value;
      }
    });
  });
  return effects;
}
