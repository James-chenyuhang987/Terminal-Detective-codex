const PURCHASE_CLAIM_PREFIX = 'agent:';
const ACTIVE_SUPPORT_PREFIX = 'support-agent:';

export const DEFAULT_AGENT_IDS = Object.freeze(['NEXUS-01', 'AURORA-09', 'CIPHER-47']);

export const AGENT_MARKET_CATALOG = Object.freeze([
  {
    id: 'NEXUS-01', icon: '👁️', color: '#00e5ff', power: 58, cost: 0, tier: 'CORE', core: true, core_slot: 0,
    zh: { name: '枢纽一号', role: '首席调查员', ability: '核心编队 · 复杂推理与逻辑验证' },
    en: { name: 'Nexus One', role: 'Lead Investigator', ability: 'Core squad · logic validation' },
  },
  {
    id: 'AURORA-09', icon: '🔬', color: '#a78bfa', power: 60, cost: 0, tier: 'CORE', core: true, core_slot: 1,
    zh: { name: '极光九号', role: '法证分析师', ability: '核心编队 · 证据观察与法证分析' },
    en: { name: 'Aurora Nine', role: 'Forensic Analyst', ability: 'Core squad · evidence analysis' },
  },
  {
    id: 'CIPHER-47', icon: '💻', color: '#ff6b35', power: 62, cost: 0, tier: 'CORE', core: true, core_slot: 2,
    zh: { name: '密钥四七', role: '技术专家', ability: '核心编队 · 数字渗透与终端破解' },
    en: { name: 'Cipher Forty-Seven', role: 'Tech Specialist', ability: 'Core squad · digital infiltration' },
  },
  {
    id: 'ARGUS-21', icon: '🦅', color: '#39e6ff', power: 108, cost: 1500, tier: 'CORE-I', core: true, purchasable: true, core_slot: 0,
    attribute_bonus: { logic_power: 4, confusion_resistance: 3 }, stance: 'analytical', traitEn: 'Logic+',
    desc: '鹰眼裁决：提升逻辑强度与抗干扰能力，适合高压推理与证据对峙。',
    descEn: 'Argus Verdict: improves logic and disruption resistance for high-pressure deduction and evidence confrontations.',
    zh: { name: '百眼二一', role: '高级首席调查员', ability: '核心替换 · 逻辑 +4，抗干扰 +3' },
    en: { name: 'Argus Twenty-One', role: 'Senior Lead Investigator', ability: 'Core replacement · Logic +4, Anti-Chaos +3' },
  },
  {
    id: 'SOVEREIGN-01', icon: '♛', color: '#9cf6ff', power: 138, cost: 2600, tier: 'CORE-Ω', core: true, purchasable: true, core_slot: 0,
    attribute_bonus: { logic_power: 7, confusion_resistance: 5 }, stance: 'analytical', traitEn: 'Command Logic',
    desc: '主权演算：以顶级逻辑矩阵稳定全队决策，是首席调查席的终极升级。',
    descEn: 'Sovereign Calculus: stabilizes squad decisions with an elite logic matrix, the ultimate lead-investigator upgrade.',
    zh: { name: '主权一号', role: '战略调查指挥官', ability: '核心替换 · 逻辑 +7，抗干扰 +5' },
    en: { name: 'Sovereign One', role: 'Strategic Investigation Commander', ability: 'Core replacement · Logic +7, Anti-Chaos +5' },
  },
  {
    id: 'SPECTRA-18', icon: '🧿', color: '#b98cff', power: 111, cost: 1600, tier: 'CORE-I', core: true, purchasable: true, core_slot: 1,
    attribute_bonus: { observation_focus: 4, logic_power: 3 }, stance: 'analytical', traitEn: 'Spectrum Sight',
    desc: '光谱视界：增强微量证据识别与法证推演，提升现场还原的可靠性。',
    descEn: 'Spectrum Sight: improves trace detection and forensic reconstruction reliability.',
    zh: { name: '光谱十八', role: '高级法证分析师', ability: '核心替换 · 观察 +4，逻辑 +3' },
    en: { name: 'Spectra Eighteen', role: 'Senior Forensic Analyst', ability: 'Core replacement · Observation +4, Logic +3' },
  },
  {
    id: 'SERAPH-88', icon: '🪽', color: '#e1c4ff', power: 141, cost: 2700, tier: 'CORE-Ω', core: true, purchasable: true, core_slot: 1,
    attribute_bonus: { observation_focus: 7, logic_power: 5 }, stance: 'analytical', traitEn: 'Perfect Reconstruction',
    desc: '完美重构：将现场痕迹转化为高置信证据模型，是法证席的终极升级。',
    descEn: 'Perfect Reconstruction: turns scene traces into high-confidence evidence models, the ultimate forensic upgrade.',
    zh: { name: '炽翼八八', role: '首席现场重构师', ability: '核心替换 · 观察 +7，逻辑 +5' },
    en: { name: 'Seraph Eighty-Eight', role: 'Chief Scene Reconstructor', ability: 'Core replacement · Observation +7, Logic +5' },
  },
  {
    id: 'RAVEN-52', icon: '🐦‍⬛', color: '#ff8157', power: 114, cost: 1700, tier: 'CORE-I', core: true, purchasable: true, core_slot: 2,
    attribute_bonus: { hack_level: 4, ap_cost_discount: 3 }, stance: 'cautious', traitEn: 'Black-Ice Breaker',
    desc: '黑冰破译：强化终端入侵并缩短行动链路，适合数字证据密集案件。',
    descEn: 'Black-Ice Breaker: improves intrusion strength and shortens action routes in digital-evidence cases.',
    zh: { name: '渡鸦五二', role: '高级渗透专家', ability: '核心替换 · 黑客 +4，AP 折扣 +3%' },
    en: { name: 'Raven Fifty-Two', role: 'Senior Infiltration Specialist', ability: 'Core replacement · Hack +4, AP Discount +3%' },
  },
  {
    id: 'OMEGA-77', icon: '🧠', color: '#ffb06f', power: 145, cost: 2800, tier: 'CORE-Ω', core: true, purchasable: true, core_slot: 2,
    attribute_bonus: { hack_level: 7, ap_cost_discount: 5 }, stance: 'cautious', traitEn: 'Quantum Intrusion',
    desc: '量子渗透：以并行破解矩阵压缩行动消耗，是技术席的终极升级。',
    descEn: 'Quantum Intrusion: compresses action costs through parallel breach matrices, the ultimate technical upgrade.',
    zh: { name: '欧米伽七七', role: '量子系统架构师', ability: '核心替换 · 黑客 +7，AP 折扣 +5%' },
    en: { name: 'Omega Seventy-Seven', role: 'Quantum Systems Architect', ability: 'Core replacement · Hack +7, AP Discount +5%' },
  },
  {
    id: 'WISP-13', icon: '🛰️', color: '#66e8ff', power: 68, cost: 60, tier: 'R',
    effects: { bonus_clue_chance: 0.02 },
    zh: { name: '微光十三', role: '信号侦察员', ability: '支援：额外线索发现率 +2%' },
    en: { name: 'Wisp Thirteen', role: 'Signal Scout', ability: 'Support: +2% bonus clue chance' },
  },
  {
    id: 'WARDEN-08', icon: '🛡️', color: '#54f0a3', power: 74, cost: 110, tier: 'SR',
    effects: { confusion_resistance: 0.03 },
    zh: { name: '壁垒八号', role: '危机防御员', ability: '支援：混乱抗性 +3%' },
    en: { name: 'Warden Eight', role: 'Crisis Defender', ability: 'Support: +3% confusion resistance' },
  },
  {
    id: 'ECHO-22', icon: '⚡', color: '#ffd166', power: 81, cost: 180, tier: 'SSR',
    effects: { initial_ap_bonus: 1 },
    zh: { name: '回声二二', role: '战术协调员', ability: '支援：下一局初始 AP +1' },
    en: { name: 'Echo Twenty-Two', role: 'Tactical Coordinator', ability: 'Support: +1 initial AP' },
  },
  {
    id: 'VANTA-66', icon: '🕶️', color: '#ff76c8', power: 89, cost: 280, tier: 'UR',
    effects: { ap_cost_discount: 0.04 },
    zh: { name: '玄黑六六', role: '隐秘行动专家', ability: '支援：行动 AP 折扣 +4%' },
    en: { name: 'Vanta Sixty-Six', role: 'Covert Operator', ability: 'Support: +4% AP discount' },
  },
  {
    id: 'ORACLE-00', icon: '🔮', color: '#f0d28b', power: 98, cost: 450, tier: 'Ω',
    effects: { initial_ap_bonus: 2, bonus_clue_chance: 0.04 },
    zh: { name: '先知零号', role: '战略演算核心', ability: '支援：初始 AP +2，额外线索率 +4%' },
    en: { name: 'Oracle Zero', role: 'Strategic Simulation Core', ability: 'Support: +2 initial AP and +4% clue chance' },
  },
  {
    id: 'SPECTER-12', icon: '🫥', color: '#7de8ff', power: 104, cost: 580, tier: 'Ω-I',
    effects: { bonus_clue_chance: 0.05, confusion_resistance: 0.02 },
    zh: { name: '幽影十二', role: '现场重构专家', ability: '支援：额外线索率 +5%，混乱抗性 +2%' },
    en: { name: 'Specter Twelve', role: 'Scene Reconstruction Expert', ability: 'Support: +5% clue chance and +2% confusion resistance' },
  },
  {
    id: 'MANTIS-33', icon: '🦾', color: '#8dff9f', power: 111, cost: 760, tier: 'Ω-II',
    effects: { initial_ap_bonus: 1, ap_cost_discount: 0.05 },
    zh: { name: '螳螂三三', role: '快速行动协调员', ability: '支援：初始 AP +1，行动 AP 折扣 +5%' },
    en: { name: 'Mantis Thirty-Three', role: 'Rapid Action Coordinator', ability: 'Support: +1 initial AP and +5% AP discount' },
  },
  {
    id: 'HELIX-71', icon: '🧬', color: '#c995ff', power: 119, cost: 980, tier: 'Ω-III',
    effects: { confusion_resistance: 0.07, bonus_clue_chance: 0.03 },
    zh: { name: '螺旋七一', role: '认知法证顾问', ability: '支援：混乱抗性 +7%，额外线索率 +3%' },
    en: { name: 'Helix Seventy-One', role: 'Cognitive Forensics Advisor', ability: 'Support: +7% confusion resistance and +3% clue chance' },
  },
  {
    id: 'ATLAS-X', icon: '🌐', color: '#ffd47a', power: 128, cost: 1350, tier: 'Ω-X',
    effects: { initial_ap_bonus: 3, ap_cost_discount: 0.05, bonus_clue_chance: 0.05 },
    zh: { name: '阿特拉斯-X', role: '全域指挥核心', ability: '支援：初始 AP +3，AP 折扣 +5%，额外线索率 +5%' },
    en: { name: 'Atlas X', role: 'Theater Command Core', ability: 'Support: +3 initial AP, +5% AP discount, and +5% clue chance' },
  },
]);

function claims(profile) {
  return Array.isArray(profile?.reward_claims) ? profile.reward_claims.filter(value => typeof value === 'string') : [];
}

export function getAgentById(agentId) {
  return AGENT_MARKET_CATALOG.find(agent => agent.id === agentId) || null;
}

export function getCoreAgentsForSlot(slot) {
  return AGENT_MARKET_CATALOG.filter(agent => agent.core && agent.core_slot === slot);
}

export function normalizeCoreAgentIds(value) {
  const ids = Array.isArray(value) ? value : [];
  return DEFAULT_AGENT_IDS.map((fallback, slot) => {
    const candidate = getAgentById(ids[slot]);
    return candidate?.core && candidate.core_slot === slot ? candidate.id : fallback;
  });
}

export function getSelectedCoreAgentIds(profile) {
  const owned = new Set(getOwnedAgentIds(profile));
  return normalizeCoreAgentIds(profile?.saved_team_config?.core_agent_ids)
    .map((agentId, slot) => owned.has(agentId) ? agentId : DEFAULT_AGENT_IDS[slot]);
}

export function prepareCoreAgentReplacement(profile, teamConfig, slot, agentId) {
  const index = Number.isInteger(slot) ? slot : Math.floor(Number(slot));
  const agent = getAgentById(agentId);
  if (index < 0 || index >= DEFAULT_AGENT_IDS.length || !agent?.core || agent.core_slot !== index) {
    return { error: 'invalid_core_slot' };
  }
  if (!getOwnedAgentIds(profile).includes(agent.id)) return { error: 'not_owned' };
  const base = teamConfig && typeof teamConfig === 'object' && !Array.isArray(teamConfig) ? teamConfig : {};
  const currentIds = normalizeCoreAgentIds(base.core_agent_ids || profile?.saved_team_config?.core_agent_ids);
  if (currentIds[index] === agent.id) {
    return { config: { ...base, core_agent_ids: currentIds }, agent, unchanged: true };
  }
  const nextIds = [...currentIds];
  nextIds[index] = agent.id;
  return {
    config: { ...base, core_agent_ids: normalizeCoreAgentIds(nextIds) },
    agent,
    previousAgent: getAgentById(currentIds[index]),
  };
}

export function getOwnedAgentIds(profile) {
  const purchased = claims(profile)
    .filter(value => value.startsWith(PURCHASE_CLAIM_PREFIX))
    .map(value => value.slice(PURCHASE_CLAIM_PREFIX.length))
    .filter(agentId => getAgentById(agentId) && !DEFAULT_AGENT_IDS.includes(agentId));
  return [...new Set([...DEFAULT_AGENT_IDS, ...purchased])];
}

export function getOwnedAgents(profile) {
  const owned = new Set(getOwnedAgentIds(profile));
  return AGENT_MARKET_CATALOG.filter(agent => owned.has(agent.id));
}

export function getActiveSupportAgentId(profile) {
  const owned = new Set(getOwnedAgentIds(profile));
  const activeClaim = [...claims(profile)].reverse().find(value => value.startsWith(ACTIVE_SUPPORT_PREFIX));
  const agentId = activeClaim?.slice(ACTIVE_SUPPORT_PREFIX.length) || '';
  const agent = getAgentById(agentId);
  return agent && !agent.core && owned.has(agent.id) ? agent.id : null;
}

export function getActiveSupportAgent(profile) {
  return getAgentById(getActiveSupportAgentId(profile));
}

export function purchaseAgent(profile, agentId) {
  const agent = getAgentById(agentId);
  if (!agent || (agent.core && !agent.purchasable)) return { profile, error: agent?.core ? 'already_owned' : 'unknown_agent' };
  if (getOwnedAgentIds(profile).includes(agent.id)) return { profile, error: 'already_owned' };
  const diamonds = Math.max(0, Math.floor(Number(profile?.diamonds) || 0));
  if (diamonds < agent.cost) return { profile, error: 'insufficient_funds' };

  const currentClaims = claims(profile);
  const purchaseClaim = `${PURCHASE_CLAIM_PREFIX}${agent.id}`;
  const hasActiveSupport = getActiveSupportAgentId(profile) !== null;
  const nextClaims = [...currentClaims, purchaseClaim];
  if (!agent.core && !hasActiveSupport) nextClaims.push(`${ACTIVE_SUPPORT_PREFIX}${agent.id}`);
  return {
    profile: { ...profile, diamonds: diamonds - agent.cost, reward_claims: [...new Set(nextClaims)] },
    agent,
    activated: !agent.core && !hasActiveSupport,
    transaction: { currency: 'diamonds', delta: -agent.cost },
  };
}

export function activateSupportAgent(profile, agentId) {
  const agent = getAgentById(agentId);
  if (!agent || agent.core || !getOwnedAgentIds(profile).includes(agent.id)) return { profile, error: 'not_owned' };
  if (getActiveSupportAgentId(profile) === agent.id) return { profile, agent, unchanged: true };
  const nextClaims = claims(profile).filter(value => !value.startsWith(ACTIVE_SUPPORT_PREFIX));
  nextClaims.push(`${ACTIVE_SUPPORT_PREFIX}${agent.id}`);
  return { profile: { ...profile, reward_claims: [...new Set(nextClaims)] }, agent };
}

export function getSupportAgentEffects(profileOrAgentId) {
  const agent = typeof profileOrAgentId === 'string'
    ? getAgentById(profileOrAgentId)
    : getActiveSupportAgent(profileOrAgentId);
  return agent && !agent.core ? { ...(agent.effects || {}) } : {};
}
