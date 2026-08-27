import { DEFAULT_AGENT_CONFIG } from './caseData.js';
import { calcTeamSynergy, effectiveAttrs, getEquippedSkillEffects } from './specialtySystem.js';
import { getAgentById, getSupportAgentEffects } from './agentMarket.js';

export const AGENT_DEFS = [
  {
    id: 'NEXUS-01', name: 'NEXUS-01', role: 'Lead Investigator', roleZh: '首席调查员',
    icon: '👁️', color: '#00e5ff', stance: 'analytical', traitEn: 'Logic',
    desc: '逻辑主宰：在复杂推理链中获得额外15%逻辑加成。复杂推理优先。',
    descEn: 'Logic Sovereign: gains a 15% logic bonus on complex deduction chains. Prioritizes advanced reasoning.',
    attrs: { logic_power: 20, observation_focus: 10, confusion_resistance: 10, ap_cost_discount: 10, hack_level: 10 },
  },
  {
    id: 'AURORA-09', name: 'AURORA-09', role: 'Forensic Analyst', roleZh: '法证分析师',
    icon: '🔬', color: '#a78bfa', stance: 'analytical', traitEn: 'Observation',
    desc: '精准之眼：证据分析时线索发现率提升20%。观察型行动优先。',
    descEn: 'Precision Eye: increases clue discovery by 20% during evidence analysis. Prioritizes observation actions.',
    attrs: { logic_power: 10, observation_focus: 20, confusion_resistance: 10, ap_cost_discount: 10, hack_level: 10 },
  },
  {
    id: 'CIPHER-47', name: 'CIPHER-47', role: 'Tech Specialist', roleZh: '技术专家',
    icon: '💻', color: '#ff6b35', stance: 'cautious', traitEn: 'Hacker',
    desc: '幽灵协议：数字渗透时被发现风险降低30%。黑客类行动优先。',
    descEn: 'Ghost Protocol: reduces detection risk by 30% during digital infiltration. Prioritizes hacking actions.',
    attrs: { logic_power: 10, observation_focus: 10, confusion_resistance: 10, ap_cost_discount: 10, hack_level: 20 },
  },
];

export const PRIORITY_ACTIONS = [
  { id: 'search_area', label: '区域搜索', labelEn: 'AREA SEARCH', icon: '🔭', color: '#00e5ff' },
  { id: 'examine_clue', label: '线索检验', labelEn: 'EXAMINE CLUE', icon: '🔍', color: '#a78bfa' },
  { id: 'interrogate_suspect', label: 'NPC审讯', labelEn: 'INTERROGATE NPC', icon: '🎤', color: '#ffaa00' },
  { id: 'hack_terminal', label: '系统入侵', labelEn: 'SYSTEM HACK', icon: '💾', color: '#ff6b35' },
  { id: 'analyze_forensics', label: '法证分析', labelEn: 'FORENSIC ANALYSIS', icon: '🧪', color: '#00ff88' },
  { id: 'check_alibi', label: '不在场核查', labelEn: 'ALIBI CHECK', icon: '⏱️', color: '#ff3aff' },
];

const LEGACY_ACTION_IDS = { interrogate_npc: 'interrogate_suspect', hack_system: 'hack_terminal' };

export function defaultSpecs() { return [{}, {}, {}]; }
export function defaultPriorities() { return AGENT_DEFS.map(() => PRIORITY_ACTIONS.map(item => item.id)); }

export function normalizePriorityList(list) {
  const defaults = PRIORITY_ACTIONS.map(action => action.id);
  const allowed = new Set(defaults);
  const migrated = (Array.isArray(list) ? list : [])
    .map(id => LEGACY_ACTION_IDS[id] || id)
    .filter(id => allowed.has(id));
  return [...new Set([...migrated, ...defaults])];
}

export function normalizePriorities(value) {
  return AGENT_DEFS.map((_, index) => normalizePriorityList(value?.[index]));
}

export function normalizeSavedTeamConfig(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const specs = Array.isArray(saved.specs) && saved.specs.length === AGENT_DEFS.length
    ? saved.specs.map(spec => spec && typeof spec === 'object' ? { ...spec } : {})
    : null;
  if (!specs) return null;
  return {
    specs,
    priorities: normalizePriorities(saved.priorities),
    primary_agent_index: Math.max(0, Math.min(AGENT_DEFS.length - 1, Math.floor(Number(saved.primary_agent_index) || 0))),
  };
}

export function buildTeamConfig(saved = {}, selectedIdx = saved?.primary_agent_index ?? 1, skillLoadout = null, supportAgentId = null) {
  const specs = Array.isArray(saved.specs) && saved.specs.length === 3 ? saved.specs : defaultSpecs();
  const priorities = normalizePriorities(saved.priorities);
  const agents = specs.map((spec, index) => ({
    agent_id: AGENT_DEFS[index].id,
    role: AGENT_DEFS[index].roleZh,
    base_stance: AGENT_DEFS[index].stance,
    ...effectiveAttrs(index, spec),
    priority_list: priorities[index],
  }));
  const synergy = calcTeamSynergy(specs);
  const equippedEffects = getEquippedSkillEffects(skillLoadout);
  const supportEffects = /** @type {Record<string, number | boolean>} */ (getSupportAgentEffects(supportAgentId));
  const skillEffects = { ...equippedEffects };
  Object.entries(supportEffects).forEach(([key, value]) => {
    if (key === 'initial_ap_bonus') return;
    skillEffects[key] = typeof value === 'number'
      ? (Number(skillEffects[key]) || 0) + value
      : value || skillEffects[key];
  });
  const supportAgent = getAgentById(supportAgentId);
  return {
    ...DEFAULT_AGENT_CONFIG,
    agent_id: agents.map(agent => agent.agent_id).join('+'),
    role: 'Multi_Agent_Team',
    base_stance: agents[selectedIdx]?.base_stance || 'analytical',
    team: agents,
    combat_attributes: {
      logic_power: Math.max(...agents.map(agent => agent.logic_power || 0)),
      observation_focus: Math.max(...agents.map(agent => agent.observation_focus || 0)),
      hack_level: Math.max(...agents.map(agent => agent.hack_level || 0)),
    },
    engine_modifiers: {
      confusion_resistance: agents.reduce((sum, agent) => sum + (agent.confusion_resistance || 0), 0) / 120,
      ap_cost_discount: agents.reduce((sum, agent) => sum + (agent.ap_cost_discount || 0), 0) / 90,
    },
    synergy_skills: synergy.active.map(skill => skill.id),
    specialty_match: synergy.matchScore,
    specialty_overload: synergy.overload,
    skill_effects: skillEffects,
    support_agent: supportAgent && !supportAgent.core ? {
      agent_id: supportAgent.id,
      power: supportAgent.power,
      effects: supportEffects,
    } : null,
    support_effects: {
      initial_ap_bonus: Math.max(0, Number(supportEffects.initial_ap_bonus) || 0),
    },
    priority_list: agents[selectedIdx]?.priority_list || PRIORITY_ACTIONS.map(item => item.id),
  };
}
