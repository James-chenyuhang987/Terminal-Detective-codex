import { ATTR_MAX } from './specialtySystem.js';

export const INVESTIGATION_PREPARATION_REVISION = 2;
export const INVESTIGATION_OBSERVATION_THRESHOLD = 60;
export const INVESTIGATION_EFFICIENCY_THRESHOLD = 75;
export const INVESTIGATION_ABILITY_KEYS = Object.freeze(['logic_power', 'observation_focus', 'hack_level']);

// Lobby specialties use raw role attributes, capped at 40. Legacy base_*
// percentages belong to persisted older investigations, never to this scale.
export function getInvestigationAbilityPercent(agent, key) {
  if (!INVESTIGATION_ABILITY_KEYS.includes(key)) return 0;
  const value = Number(agent?.[key]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value * 100 / ATTR_MAX[key])) : 0;
}

export function getInvestigationAgentPreparation(agent) {
  const ability_percent = Object.fromEntries(INVESTIGATION_ABILITY_KEYS.map(key => [key, getInvestigationAbilityPercent(agent, key)]));
  return {
    agent_id: agent?.agent_id || agent?.id || null,
    ability_percent,
    professional_observation: Object.fromEntries(INVESTIGATION_ABILITY_KEYS.map(key => [key,
      ability_percent[key] >= INVESTIGATION_OBSERVATION_THRESHOLD])),
    specialist_efficiency: INVESTIGATION_ABILITY_KEYS.some(key => ability_percent[key] >= INVESTIGATION_EFFICIENCY_THRESHOLD),
  };
}
