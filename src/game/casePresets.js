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

const DEFAULT_CASE_WEIGHTS = Object.freeze({ ...CASE_NEON_BLOOD.weights });
const DEFAULT_ATTRIBUTE_MAX = 40;

export function getCaseMatchConfig(caseId) {
  return typeof caseId === 'string' && Object.hasOwn(CASE_MATCH_CONFIGS, caseId)
    ? CASE_MATCH_CONFIGS[caseId]
    : CASE_NEON_BLOOD;
}

function finite(value, fallback = 0) {
  try {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  } catch {
    return fallback;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readValue(value, key) {
  try {
    return value?.[key];
  } catch {
    return undefined;
  }
}

function mapValue(map, key, fallback) {
  return Object.hasOwn(map, key) ? map[key] : fallback;
}

function setRecordValue(record, key, value) {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function normalizeCaseWeights(caseConfig) {
  const rawWeights = readValue(caseConfig, 'weights');
  const candidate = isRecord(rawWeights) ? rawWeights : null;
  let rawEntries = [];
  try {
    rawEntries = candidate ? Object.entries(candidate) : [];
  } catch {
    rawEntries = [];
  }

  const validEntries = rawEntries
    .map(([key, value]) => [key, finite(value)])
    .filter(([, weight]) => weight > 0);
  const total = validEntries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!validEntries.length || !Number.isFinite(total) || total <= 0) return DEFAULT_CASE_WEIGHTS;
  if (total === 1) return Object.fromEntries(validEntries);
  return Object.fromEntries(validEntries.map(([key, weight]) => [key, weight / total]));
}

function attributeRatio(agents, key) {
  const max = Math.max(0, finite(readValue(ATTR_MAX, key), DEFAULT_ATTRIBUTE_MAX)) || DEFAULT_ATTRIBUTE_MAX;
  return agents.reduce((best, agent) => {
    const value = Math.max(0, finite(readValue(agent, key)));
    return Math.max(best, Math.min(1, value / max));
  }, 0);
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

// agents: 三人有效属性数组；返回 { score, color, advice }
export function calcCaseMatchScore(agents, caseConfig = CASE_NEON_BLOOD, lang = 'zh') {
  const safeAgents = Array.isArray(agents) ? agents : [];
  const weights = normalizeCaseWeights(caseConfig);
  let score = 0;
  const ratios = {};

  Object.entries(weights).forEach(([key, weight]) => {
    const ratio = attributeRatio(safeAgents, key);
    setRecordValue(ratios, key, ratio);
    score += ratio * weight;
  });

  const pct = Math.round(Math.min(100, Math.max(0, score * 100)));

  // 找出最短板
  const weakest = Object.keys(weights).sort((a, b) => ratios[a] - ratios[b])[0];
  const color = pct < 50 ? '#ff3860' : pct <= 75 ? '#ffaa00' : '#00ff88';

  let advice;
  if (pct >= 90) {
    advice = lang === 'zh' ? '配置已接近满配，可直接部署。' : 'This configuration is nearly optimal and ready to deploy.';
  } else if (weakest && ratios[weakest] >= 0.95) {
    advice = lang === 'zh' ? '三项主要能力均已到顶，剩余专长点可自由分配。' : 'All primary capabilities are capped. Allocate remaining specialty points freely.';
  } else if (weakest) {
    const labelEn = {
      logic_power: 'Logic', hack_level: 'Hacking', observation_focus: 'Observation',
      confusion_resistance: 'Anti-Chaos', ap_cost_discount: 'AP Efficiency',
    };
    const label = mapValue(ATTR_LABEL, weakest, weakest);
    const labelEnValue = mapValue(labelEn, weakest, weakest);
    const owner = mapValue(ATTR_OWNER, weakest, 'TACTICAL');
    advice = lang === 'zh'
      ? `${label}能力不足，${owner} 专长可继续强化。`
      : `${labelEnValue} is underpowered. Improve ${owner}'s specialty.`;
  } else {
    advice = lang === 'zh' ? '暂无可用案件能力要求。' : 'No case requirements are available.';
  }

  return { score: pct, color, advice, ratios };
}

const ATTR_LABEL_EN = {
  logic_power: 'Logic',
  hack_level: 'Hacking',
  observation_focus: 'Observation',
  confusion_resistance: 'Anti-Chaos',
  ap_cost_discount: 'AP Efficiency',
};

export function getCaseMatchFeedback(agents, caseConfig = CASE_NEON_BLOOD, lang = 'zh') {
  const match = calcCaseMatchScore(agents, caseConfig, lang);
  const weights = normalizeCaseWeights(caseConfig);
  const entries = Object.entries(weights).map(([key, weight]) => {
    const ratio = Math.max(0, Math.min(1, finite(match.ratios[key])));
    return {
      key,
      weight,
      ratio,
      percent: Math.round(ratio * 100),
      label: mapValue(ATTR_LABEL, key, key),
      labelEn: mapValue(ATTR_LABEL_EN, key, key),
      owner: mapValue(ATTR_OWNER, key, 'TACTICAL'),
      ownerEn: mapValue(ATTR_OWNER, key, 'TACTICAL'),
    };
  }).sort((a, b) => (b.ratio * b.weight) - (a.ratio * a.weight));
  const strengths = entries.filter(item => item.ratio >= 0.62).slice(0, 2);
  // Keep the two lists mutually exclusive: a middling attribute should not be
  // presented as both a strength and a risk at the same time.
  const risks = [...entries].sort((a, b) => a.ratio - b.ratio).filter(item => item.ratio < 0.62).slice(0, 2);
  return { score: match.score, strengths: strengths.map(item => ({ ...item, kind: 'strength' })), risks: risks.map(item => ({ ...item, kind: 'risk' })) };
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
