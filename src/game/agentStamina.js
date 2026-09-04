export const AGENT_STAMINA_INITIAL = 50;
export const AGENT_STAMINA_MAX = 100;
export const AGENT_STAMINA_RECOVERY_PER_TURN = 4;
export const AGENT_STAMINA_INVESTIGATION_COST = 10;

export const DEFAULT_CORE_AGENT_IDS = Object.freeze([
  'NEXUS-01',
  'AURORA-09',
  'CIPHER-47',
]);

const STAMINA_AFFECTED_ATTRIBUTES = Object.freeze([
  'logic_power',
  'observation_focus',
  'hack_level',
  'confusion_resistance',
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeStamina(value, fallback = AGENT_STAMINA_INITIAL) {
  return Math.max(0, Math.min(AGENT_STAMINA_MAX, Math.round(finite(value, fallback))));
}

function normalizeAgentIds(agentIds) {
  const source = Array.isArray(agentIds) && agentIds.length ? agentIds : DEFAULT_CORE_AGENT_IDS;
  return [...new Set(source.map(item => typeof item === 'string' ? item : item?.agent_id).filter(Boolean))].slice(0, 3);
}

export function normalizeAgentStamina(stamina, agentIds = DEFAULT_CORE_AGENT_IDS) {
  const source = stamina && typeof stamina === 'object' && !Array.isArray(stamina) ? stamina : {};
  return Object.fromEntries(normalizeAgentIds(agentIds).map(agentId => [
    agentId,
    normalizeStamina(source[agentId]),
  ]));
}

export function staminaAbilityMultiplier(stamina) {
  return 0.5 + (normalizeStamina(stamina) / 200);
}

export function staminaEffectivePercent(stamina) {
  return Math.round(staminaAbilityMultiplier(stamina) * 100);
}

export function canAgentInvestigate(stamina, includeTurnRecovery = false) {
  const available = normalizeStamina(stamina) + (includeTurnRecovery ? AGENT_STAMINA_RECOVERY_PER_TURN : 0);
  return available >= AGENT_STAMINA_INVESTIGATION_COST;
}

export function applyStaminaToAgent(agent, staminaValue) {
  if (!agent || typeof agent !== 'object') return agent;
  const stamina = normalizeStamina(staminaValue);
  const multiplier = staminaAbilityMultiplier(stamina);
  const next = { ...agent, stamina, stamina_multiplier: multiplier };
  STAMINA_AFFECTED_ATTRIBUTES.forEach(key => {
    const baseKey = `base_${key}`;
    const baseValue = finite(agent[baseKey] ?? agent[key]);
    next[baseKey] = baseValue;
    next[key] = Math.round(baseValue * multiplier * 100) / 100;
  });
  return next;
}

export function applyStaminaToTeam(team, stamina) {
  return (Array.isArray(team) ? team : []).map(agent =>
    applyStaminaToAgent(agent, stamina?.[agent?.agent_id])
  );
}

export function settleRoundAgentStamina(stamina, agentIds, participantIds = []) {
  const normalized = normalizeAgentStamina(stamina, agentIds);
  const participants = new Set((Array.isArray(participantIds) ? participantIds : []).filter(Boolean));
  return Object.fromEntries(Object.entries(normalized).map(([agentId, value]) => {
    const recovered = Math.min(AGENT_STAMINA_MAX, value + AGENT_STAMINA_RECOVERY_PER_TURN);
    return [
      agentId,
      Math.max(0, recovered - (participants.has(agentId) ? AGENT_STAMINA_INVESTIGATION_COST : 0)),
    ];
  }));
}

export function spendAgentStamina(stamina, agentId, agentIds) {
  const normalized = normalizeAgentStamina(stamina, agentIds);
  if (!agentId
    || !Object.prototype.hasOwnProperty.call(normalized, agentId)
    || !canAgentInvestigate(normalized[agentId], false)) {
    return { stamina: normalized, spent: false };
  }
  return {
    stamina: {
      ...normalized,
      [agentId]: normalized[agentId] - AGENT_STAMINA_INVESTIGATION_COST,
    },
    spent: true,
  };
}

export function recoverAgentStaminaTurn(stamina, agentIds) {
  return settleRoundAgentStamina(stamina, agentIds);
}
