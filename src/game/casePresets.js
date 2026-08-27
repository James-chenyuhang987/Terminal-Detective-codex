// ═══════════════════════════════════════════════════════════════════════════
// casePresets.js — 案件匹配度算法 + 配置预设方案
// ═══════════════════════════════════════════════════════════════════════════

import { ATTR_MAX } from './specialtySystem.js';

// 案件难度权重系数（霓虹血迹）
export const CASE_NEON_BLOOD = {
  id: 'neon_blood',
  name: '霓虹血迹 · NEON BLOOD',
  nameEn: 'NEON BLOOD',
  threat: 'HIGH',
  weights: { logic_power: 0.40, hack_level: 0.35, observation_focus: 0.25 },
};

const ATTR_LABEL = {
  logic_power: '逻辑推演',
  hack_level: '黑客渗透',
  observation_focus: '现场观察',
};

const ATTR_OWNER = {
  logic_power: 'NEXUS',
  hack_level: 'CIPHER',
  observation_focus: 'AURORA',
};

// agents: 三人有效属性数组；返回 { score, color, advice }
export function calcCaseMatchScore(agents, caseConfig = CASE_NEON_BLOOD, lang = 'zh') {
  const weights = caseConfig.weights;
  let score = 0;
  const ratios = {};

  Object.entries(weights).forEach(([key, w]) => {
    const best = Math.max(...agents.map(a => a?.[key] || 0));
    const ratio = Math.min(1, best / (ATTR_MAX[key] || 40));
    ratios[key] = ratio;
    score += ratio * w;
  });

  const pct = Math.round(Math.min(100, Math.max(0, score * 100)));

  // 找出最短板
  const weakest = Object.keys(weights).sort((a, b) => ratios[a] - ratios[b])[0];
  const color = pct < 50 ? '#ff3860' : pct <= 75 ? '#ffaa00' : '#00ff88';

  let advice;
  if (pct >= 90) {
    advice = lang === 'zh' ? '配置已接近满配，可直接部署。' : 'This configuration is nearly optimal and ready to deploy.';
  } else if (ratios[weakest] >= 0.95) {
    advice = lang === 'zh' ? '三项主要能力均已到顶，剩余专长点可自由分配。' : 'All primary capabilities are capped. Allocate remaining specialty points freely.';
  } else {
    const labelEn = { logic_power: 'Logic', hack_level: 'Hacking', observation_focus: 'Observation' };
    advice = lang === 'zh'
      ? `${ATTR_LABEL[weakest]}能力不足，${ATTR_OWNER[weakest]} 专长可继续强化。`
      : `${labelEn[weakest]} is underpowered. Improve ${ATTR_OWNER[weakest]}'s specialty.`;
  }

  return { score: pct, color, advice, ratios };
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
