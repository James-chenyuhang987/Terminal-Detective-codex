// ═══════════════════════════════════════════════════════════════════════════
// casePresets.js — 案件匹配度算法 + 配置预设方案
// ═══════════════════════════════════════════════════════════════════════════

import { ATTR_MAX } from './specialtySystem.js';

// 案件难度权重系数（霓虹血迹）
export const CASE_MATCH_CONFIGS = Object.freeze({
  Lvl_01: {
    id: 'Lvl_01', name: '霓虹血迹 · NEON BLOOD', nameEn: 'NEON BLOOD', threat: 'OMEGA',
    weights: { hack_level: 0.40, logic_power: 0.35, observation_focus: 0.25 },
    threats: ['深层网络封锁', '高复杂度推理', '隐蔽物证'],
    threatsEn: ['Deep network lockdown', 'Complex deductions', 'Concealed evidence'],
  },
  Lvl_02: {
    id: 'Lvl_02', name: '幽灵协议 · GHOST PROTOCOL', nameEn: 'GHOST PROTOCOL', threat: 'HARD',
    weights: { logic_power: 0.40, observation_focus: 0.35, hack_level: 0.25 },
    threats: ['密室逻辑', '量子物证', '受限数据库'],
    threatsEn: ['Locked-room logic', 'Quantum evidence', 'Restricted databases'],
  },
  Lvl_03: {
    id: 'Lvl_03', name: '红蝶陷阱 · RED BUTTERFLY', nameEn: 'RED BUTTERFLY', threat: 'NORMAL',
    weights: { observation_focus: 0.35, confusion_resistance: 0.35, logic_power: 0.30 },
    threats: ['感官干扰', '人群证词', '神经混乱'],
    threatsEn: ['Sensory interference', 'Crowd testimony', 'Neural confusion'],
  },
  Lvl_04: {
    id: 'Lvl_04', name: '零度回声 · ZERO ECHO', nameEn: 'ZERO ECHO', threat: 'HARD',
    weights: { observation_focus: 0.40, logic_power: 0.35, hack_level: 0.25 },
    threats: ['极寒物证', '无人机路径', '日志覆写'],
    threatsEn: ['Cryogenic evidence', 'Drone routing', 'Log overwrites'],
  },
  Lvl_05: {
    id: 'Lvl_05', name: '天穹失联 · SKYFALL SILENCE', nameEn: 'SKYFALL SILENCE', threat: 'OMEGA',
    weights: { hack_level: 0.35, confusion_resistance: 0.35, logic_power: 0.30 },
    threats: ['轨道网络封锁', '伪造授权', '高压审讯'],
    threatsEn: ['Orbital network lockdown', 'Forged authorization', 'High-pressure interrogation'],
  },
  Lvl_06: {
    id: 'Lvl_06', name: '午夜拍卖 · MIDNIGHT AUCTION', nameEn: 'MIDNIGHT AUCTION', threat: 'NORMAL',
    weights: { observation_focus: 0.40, logic_power: 0.35, hack_level: 0.25 },
    threats: ['纳米毒物', '底座暗道', '匿名资金'],
    threatsEn: ['Nanofiber toxin', 'Hidden pedestal path', 'Anonymous funds'],
  },
  Lvl_07: {
    id: 'Lvl_07', name: '深潮回声 · ABYSSAL ECHO', nameEn: 'ABYSSAL ECHO', threat: 'HARD',
    weights: { confusion_resistance: 0.40, observation_focus: 0.35, hack_level: 0.25 },
    threats: ['深海高压', '伪造声呐', '远程阀门'],
    threatsEn: ['Abyssal pressure', 'Forged sonar', 'Remote valve control'],
  },
  Lvl_08: {
    id: 'Lvl_08', name: '白塔悖论 · WHITE TOWER PARADOX', nameEn: 'WHITE TOWER PARADOX', threat: 'OMEGA',
    weights: { logic_power: 0.40, hack_level: 0.35, confusion_resistance: 0.25 },
    threats: ['预测核心', '权限覆写', '因果伪装'],
    threatsEn: ['Prediction core', 'Privilege override', 'Causal camouflage'],
  },
});

export const CASE_NEON_BLOOD = CASE_MATCH_CONFIGS.Lvl_01;

export const GENERAL_FORMATION_CONFIG = Object.freeze({
  id: 'GENERAL',
  name: '通用编组',
  nameEn: 'GENERAL FORMATION',
  threat: 'OPEN',
  weights: {
    logic_power: 0.25,
    observation_focus: 0.25,
    confusion_resistance: 0.25,
    hack_level: 0.25,
  },
  threats: ['逻辑复原', '现场重建', '冲突降噪', '终端封锁'],
  threatsEn: ['Logic reconstruction', 'Scene reconstruction', 'Conflict stabilization', 'Terminal lockdown'],
});

export function getCaseMatchConfig(caseId) {
  if (caseId === GENERAL_FORMATION_CONFIG.id) return GENERAL_FORMATION_CONFIG;
  return CASE_MATCH_CONFIGS[caseId] || CASE_NEON_BLOOD;
}

function normalizeAttributeValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

const ATTR_LABEL = {
  logic_power: '逻辑推演',
  hack_level: '黑客渗透',
  observation_focus: '现场观察',
  confusion_resistance: '抗干扰',
  ap_cost_discount: '行动效率',
};

const ATTR_OWNER = {
  logic_power: 'NEXUS',
  hack_level: 'CIPHER',
  observation_focus: 'AURORA',
  confusion_resistance: 'NEXUS',
  ap_cost_discount: 'CIPHER',
};

const ATTR_LABEL_EN = {
  logic_power: 'Logic',
  hack_level: 'Hacking',
  observation_focus: 'Observation',
  confusion_resistance: 'Anti-chaos',
  ap_cost_discount: 'Action efficiency',
};

const ATTR_ACTION = {
  logic_power: { zh: '逻辑复原', en: 'logic reconstruction' },
  hack_level: { zh: '终端封锁', en: 'terminal lockdown' },
  observation_focus: { zh: '现场重建', en: 'scene reconstruction' },
  confusion_resistance: { zh: '冲突降噪', en: 'conflict stabilization' },
  ap_cost_discount: { zh: '快速调度', en: 'rapid dispatch' },
};

// agents: 三人有效属性数组；返回 { score, color, advice }
export function calcCaseMatchScore(agents, caseConfig = CASE_NEON_BLOOD, lang = 'zh') {
  const roster = Array.isArray(agents) ? agents : [];
  const weights = caseConfig?.weights || CASE_NEON_BLOOD.weights;
  let score = 0;
  const ratios = {};
  const owners = {};

  Object.entries(weights).forEach(([key, w]) => {
    const candidates = roster.map((agent, index) => {
      const value = normalizeAttributeValue(agent?.[key]);
      return { agent, index, value };
    });
    const bestEntry = candidates.reduce((winner, entry) => entry.value > winner.value ? entry : winner, { value: 0, agent: null, index: -1 });
    const best = bestEntry.value;
    const ratio = Math.min(1, best / (ATTR_MAX[key] || 40));
    ratios[key] = ratio;
    owners[key] = bestEntry.agent?.agent_id || ATTR_OWNER[key];
    score += ratio * w;
  });

  const pct = Math.round(Math.min(100, Math.max(0, score * 100)));

  // 找出最短板
  const weakest = Object.keys(weights).sort((a, b) => ratios[a] - ratios[b])[0];
  const color = pct < 50 ? '#ff3860' : pct <= 75 ? '#ffaa00' : '#00ff88';

  let advice;
  if (pct >= 90) {
    advice = lang === 'zh' ? '公开能力覆盖充分；仍请根据现场事件选择处理者。' : 'Public capability coverage is strong; choose the handler for each event carefully.';
  } else if (ratios[weakest] >= 0.95) {
    advice = lang === 'zh' ? '主要能力覆盖均衡；不同处理者仍会带来不同风险。' : 'Primary coverage is balanced; each handler still carries a different risk.';
  } else {
    advice = lang === 'zh'
      ? `${ATTR_LABEL[weakest]}准备不足，可继续强化 ${owners[weakest]} 的对应专长。`
      : `${ATTR_LABEL_EN[weakest]} needs more preparation. Improve the matching specialty on ${owners[weakest]}.`;
  }

  return { score: pct, color, advice, ratios, owners };
}

/**
 * Turn the public match weights into readable strengths, risks and trade-offs.
 * This deliberately uses only public agent attributes; it must never infer a
 * case answer or read protected case data.
 */
export function buildCaseMatchReadout(agents = [], caseConfig = CASE_NEON_BLOOD, lang = 'zh') {
  const roster = Array.isArray(agents) ? agents : [];
  const weights = caseConfig?.weights || CASE_NEON_BLOOD.weights;
  const strengths = [];
  const risks = [];
  const coverage = Object.entries(weights).map(([key, weight]) => {
    const entries = roster.map((agent, index) => ({
      agent,
      index,
      value: normalizeAttributeValue(agent?.[key]),
    }));
    const best = entries.reduce((winner, entry) => entry.value > winner.value ? entry : winner, { value: 0, index: -1, agent: null });
    const ratio = Math.min(1, best.value / (ATTR_MAX[key] || 40));
    const labelZh = ATTR_LABEL[key] || key;
    const labelEn = ATTR_LABEL_EN[key] || key;
    const actionZh = ATTR_ACTION[key]?.zh || labelZh;
    const actionEn = ATTR_ACTION[key]?.en || labelEn;
    const label = lang === 'zh' ? labelZh : labelEn;
    const action = lang === 'en' ? actionEn : actionZh;
    const owner = best.agent?.agent_id || ATTR_OWNER[key];
    const item = {
      key,
      label,
      labelZh,
      labelEn,
      action,
      actionZh,
      actionEn,
      owner,
      agentIndex: best.index,
      ratio,
      weight,
      value: best.value,
      weightedPct: Math.round(ratio * weight * 100),
    };
    if (ratio >= 0.72) strengths.push(item);
    if (ratio < 0.58) risks.push(item);
    return item;
  });

  const sorted = [...coverage].sort((a, b) => (b.ratio * b.weight) - (a.ratio * a.weight));
  const best = sorted[0] || null;
  const weakest = [...coverage].sort((a, b) => a.ratio - b.ratio)[0] || null;
  const tradeoffs = best && weakest && best.key !== weakest.key
    ? [{
      key: `${best.key}->${weakest.key}`,
      conditional: true,
      gain: {
        key: weakest.key,
        agentId: weakest.owner,
        action: weakest.actionZh,
        actionEn: weakest.actionEn,
      },
      sacrifice: {
        key: best.key,
        agentId: best.owner,
        action: best.actionZh,
        actionEn: best.actionEn,
        conditional: true,
      },
      text: `可尝试换人或重配专长补强${weakest.actionZh}；调整后检查 ${best.owner} 的${best.actionZh}覆盖是否下降，只有实际下降时才需要权衡这项损失。`,
      textEn: `Try a swap or specialty shift to strengthen ${weakest.actionEn}. Check whether ${best.actionEn} coverage from ${best.owner} actually decreases before weighing that loss.`,
    }]
    : [];

  return {
    coverage,
    strengths: strengths.sort((a, b) => (b.ratio * b.weight) - (a.ratio * a.weight)),
    risks: risks.sort((a, b) => ((1 - b.ratio) * b.weight) - ((1 - a.ratio) * a.weight)),
    tradeoffs,
    tradeoff: tradeoffs[0] || null,
  };
}

/** Compare actual capability coverage under the same public case weights. */
export function compareCaseMatchReadouts(previous, next) {
  const before = Array.isArray(previous?.coverage) ? previous.coverage : [];
  const after = Array.isArray(next?.coverage) ? next.coverage : [];
  const gains = [];
  const losses = [];
  const previousByKey = new Map(before.map(item => [item.key, item]));

  // A different case changes the meaning of the comparison, not the squad.
  if (!before.length || before.length !== after.length || after.some(item => {
    const prior = previousByKey.get(item.key);
    return !prior || prior.weight !== item.weight;
  })) return { gains, losses };

  for (const item of after) {
    const prior = previousByKey.get(item.key);
    const ratioDelta = item.ratio - prior.ratio;
    // Ignore owner-only changes and values above the shared capability cap.
    if (!Number.isFinite(ratioDelta) || Math.abs(ratioDelta) < 1e-9) continue;
    const change = {
      ...item,
      previousValue: prior.value,
      previousRatio: prior.ratio,
      previousOwner: prior.owner,
      delta: item.value - prior.value,
      ratioDelta,
    };
    (ratioDelta > 0 ? gains : losses).push(change);
  }

  return { gains, losses };
}

// ── 预设方案 ────────────────────────────────────────────────────────────────
// specs[i] 只允许该探员 specialty_slots 内的键
// NEXUS: logic_power / confusion_resistance
// AURORA: observation_focus / logic_power
// CIPHER: hack_level / ap_cost_discount
const ALL = ['search_area', 'examine_clue', 'interrogate_suspect', 'hack_terminal', 'analyze_forensics', 'check_alibi'];
const order = (...first) => [...first, ...ALL.filter(a => !first.includes(a))];

export const PRESET_CONFIGS = [
  {
    id: 'brute_force',
    name: '暴力破解型',
    nameEn: 'BRUTE FORCE',
    icon: '⚡',
    color: '#00e5ff',
    desc: 'NEXUS 逻辑全满 + CIPHER 黑客全满',
    descEn: 'Max NEXUS logic and CIPHER hacking',
    specs: [
      { logic_power: 20 },
      { observation_focus: 10, logic_power: 10 },
      { hack_level: 20 },
    ],
    priorities: [
      order('examine_clue', 'check_alibi'),
      order('analyze_forensics', 'examine_clue'),
      order('hack_terminal', 'search_area'),
    ],
  },
  {
    id: 'stealth',
    name: '隐秘渗透型',
    nameEn: 'STEALTH INFILTRATION',
    icon: '👻',
    color: '#ff6b35',
    desc: 'CIPHER 黑客+行动折扣 + NEXUS 抗干扰强化',
    descEn: 'CIPHER hacking and AP discount with stronger NEXUS resistance',
    specs: [
      { confusion_resistance: 15, logic_power: 5 },
      { observation_focus: 12, logic_power: 8 },
      { hack_level: 15, ap_cost_discount: 5 },
    ],
    priorities: [
      order('check_alibi', 'examine_clue'),
      order('examine_clue', 'analyze_forensics'),
      order('hack_terminal', 'analyze_forensics'),
    ],
  },
  {
    id: 'recon',
    name: '全面侦察型',
    nameEn: 'FULL RECON',
    icon: '🔬',
    color: '#a78bfa',
    desc: 'AURORA 观察全满 + 均衡分配',
    descEn: 'Max AURORA observation with balanced allocation',
    specs: [
      { logic_power: 10, confusion_resistance: 10 },
      { observation_focus: 20 },
      { hack_level: 10, ap_cost_discount: 10 },
    ],
    priorities: [
      order('examine_clue', 'interrogate_suspect'),
      order('search_area', 'analyze_forensics'),
      order('hack_terminal', 'check_alibi'),
    ],
  },
];
