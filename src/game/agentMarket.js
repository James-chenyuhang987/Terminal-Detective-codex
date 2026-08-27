const PURCHASE_CLAIM_PREFIX = 'agent:';
const ACTIVE_SUPPORT_PREFIX = 'support-agent:';

export const DEFAULT_AGENT_IDS = Object.freeze(['NEXUS-01', 'AURORA-09', 'CIPHER-47']);

export const AGENT_MARKET_CATALOG = Object.freeze([
  {
    id: 'NEXUS-01', icon: '👁️', color: '#00e5ff', power: 58, cost: 0, tier: 'CORE', core: true,
    zh: { name: '枢纽一号', role: '首席调查员', ability: '核心编队 · 复杂推理与逻辑验证' },
    en: { name: 'Nexus One', role: 'Lead Investigator', ability: 'Core squad · logic validation' },
  },
  {
    id: 'AURORA-09', icon: '🔬', color: '#a78bfa', power: 60, cost: 0, tier: 'CORE', core: true,
    zh: { name: '极光九号', role: '法证分析师', ability: '核心编队 · 证据观察与法证分析' },
    en: { name: 'Aurora Nine', role: 'Forensic Analyst', ability: 'Core squad · evidence analysis' },
  },
  {
    id: 'CIPHER-47', icon: '💻', color: '#ff6b35', power: 62, cost: 0, tier: 'CORE', core: true,
    zh: { name: '密钥四七', role: '技术专家', ability: '核心编队 · 数字渗透与终端破解' },
    en: { name: 'Cipher Forty-Seven', role: 'Tech Specialist', ability: 'Core squad · digital infiltration' },
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
]);

function claims(profile) {
  return Array.isArray(profile?.reward_claims) ? profile.reward_claims.filter(value => typeof value === 'string') : [];
}

export function getAgentById(agentId) {
  return AGENT_MARKET_CATALOG.find(agent => agent.id === agentId) || null;
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
  if (!agent || agent.core) return { profile, error: agent?.core ? 'already_owned' : 'unknown_agent' };
  if (getOwnedAgentIds(profile).includes(agent.id)) return { profile, error: 'already_owned' };
  const diamonds = Math.max(0, Math.floor(Number(profile?.diamonds) || 0));
  if (diamonds < agent.cost) return { profile, error: 'insufficient_funds' };

  const currentClaims = claims(profile);
  const purchaseClaim = `${PURCHASE_CLAIM_PREFIX}${agent.id}`;
  const hasActiveSupport = getActiveSupportAgentId(profile) !== null;
  const nextClaims = [...currentClaims, purchaseClaim];
  if (!hasActiveSupport) nextClaims.push(`${ACTIVE_SUPPORT_PREFIX}${agent.id}`);
  return {
    profile: { ...profile, diamonds: diamonds - agent.cost, reward_claims: [...new Set(nextClaims)] },
    agent,
    activated: !hasActiveSupport,
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

