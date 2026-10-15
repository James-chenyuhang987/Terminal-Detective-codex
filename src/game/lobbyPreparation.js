import { ATTR_META, calcTeamSynergy, effectiveAttrs, normalizeSpecialtyAllocation, specRemaining, specUsed } from './specialtySystem.js';
import { getInvestigationAgentPreparation } from './investigationPreparation.js';
import { createCommandState } from './commandSystem.js';
import { getCasePreparationEffects } from './homeProgress.js';

export function describeLobbySynergy(skill) {
  const descriptions = {
    cross_validation: ['逻辑与观察均达到 30 点，相关探员的专业观察与首检优惠已就绪。关系判断仍需匹配现场证据。',
      'Logic and Observation reach 30. Relevant agents are ready for professional observations and first-check benefits. Relations still require matching field evidence.'],
    digital_forensics: ['观察与黑客均达到 30 点，相关探员的专业观察与首检优惠已就绪。关键证据由你选择核验方式取得。',
      'Observation and Hack reach 30. Relevant agents are ready for professional observations and first-check benefits. You still choose how to verify key evidence.'],
    ghost_protocol: ['危机导致的混乱增量降低 20%。仍需选择应对方式并支付其费用。',
      'Confusion added by crises is reduced by 20%. You still choose a response and pay its cost.'],
  };
  const copy = descriptions[skill.id];
  return copy ? { ...skill, desc: copy[0], descEn: copy[1] } : skill;
}

// Public formation facts only. This preview never forecasts case answers or
// changes a profile, and uses the same capability scale as manual investigation.
export function buildLobbyPreparation({ agents, specs, commandPlan, support, profile }) {
  return {
    agents: agents.map((agent, slot) => ({
      ...getInvestigationAgentPreparation(agent),
      slot,
      remaining: specRemaining(specs[slot]),
    })),
    initialAP: 20 + getCasePreparationEffects(profile).initial_ap_bonus
      + Math.max(0, Number(support?.effects?.initial_ap_bonus) || 0),
    initialCP: createCommandState(commandPlan).points,
  };
}

export function buildLobbyPresetPreview({ preset, specs, agentDefs, agents = [] }) {
  if (!Array.isArray(preset?.specs) || preset.specs.length !== agentDefs.length) return null;
  const normalized = agentDefs.map((def, slot) => normalizeSpecialtyAllocation(slot, preset.specs[slot], def.attribute_bonus));
  const attributeBonuses = agentDefs.map(def => def.attribute_bonus);
  const currentSynergy = calcTeamSynergy(specs, attributeBonuses);
  const proposedSynergy = calcTeamSynergy(normalized, attributeBonuses);
  const currentIds = new Set(currentSynergy.active.map(skill => skill.id));
  const proposedIds = new Set(proposedSynergy.active.map(skill => skill.id));
  const rows = normalized.map((spec, slot) => {
    const before = effectiveAttrs(slot, specs[slot], agentDefs[slot].attribute_bonus);
    const after = effectiveAttrs(slot, spec, agentDefs[slot].attribute_bonus);
    return {
      slot,
      before,
      after,
      remaining: specRemaining(spec),
      refunded: Math.max(0, specUsed(preset.specs[slot]) - specUsed(spec)),
      changes: ATTR_META.filter(attr => before[attr.key] !== after[attr.key]).map(attr => ({
        key: attr.key, before: before[attr.key], after: after[attr.key], delta: after[attr.key] - before[attr.key],
      })),
      preparation: getInvestigationAgentPreparation(after),
      beforePriorities: (agents[slot]?.priority_list || []).slice(0, 3),
      afterPriorities: (preset.priorities?.[slot] || []).slice(0, 3),
    };
  });
  return { preset, specs: normalized, rows, refunded: rows.reduce((sum, row) => sum + row.refunded, 0),
    currentSynergy, proposedSynergy,
    gainedSynergyIds: proposedSynergy.active.filter(skill => !currentIds.has(skill.id)).map(skill => skill.id),
    lostSynergyIds: currentSynergy.active.filter(skill => !proposedIds.has(skill.id)).map(skill => skill.id),
  };
}
