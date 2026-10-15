import { getInvestigationSkillEffects, INVESTIGATION_SKILL_LIMITS,
  INVESTIGATION_SKILLS_REVISION, activeInvestigationSkillIds,
  investigationSkillDescription, INVESTIGATION_SKILL_BUDGET_LABELS } from '../../src/game/investigationSkills.js';

export { INVESTIGATION_SKILLS_REVISION };
const TECHNICAL_ACTIONS = new Set(['access_database', 'check_cctv', 'hack_terminal', 'restore_surveillance']);
const amount = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

export function usesInvestigationSkills(run) {
  return run?.investigation_version === 2 && run.investigation?.skills_revision === INVESTIGATION_SKILLS_REVISION;
}
function effects(run) { return getInvestigationSkillEffects(run?.team_config?.skill_effects); }
function used(run, key) { return Math.min(INVESTIGATION_SKILL_LIMITS[key] || 0,
  Math.floor(amount(run?.investigation?.skill_usage?.[key]))); }
function remaining(run, key) {
  return usesInvestigationSkills(run) ? Math.max(0, (effects(run)[key] || 0) - used(run, key)) : 0;
}
function spend(run, key) {
  if (!remaining(run, key)) throw Object.assign(new Error('STALE_OPTIONS'), { code: 'STALE_OPTIONS', status: 400 });
  run.investigation.skill_usage = { ...(run.investigation.skill_usage || {}), [key]: used(run, key) + 1 };
}

/** Read-only quote. Existing command, scanner and specialist credits are applied first. */
export function quoteInvestigationSkills(run, { kind, actionTag = '', tone = '', apCost = 1, staminaCost = 10 } = {}) {
  const quoted = { ap_cost: amount(apCost), stamina_cost: amount(staminaCost),
    skill_ap_discount: 0, skill_stamina_discount: 0, skill_uses: [] };
  if (!usesInvestigationSkills(run)) return quoted;
  const apKey = kind === 'inspect' ? 'inspection_ap' : kind === 'puzzle' ? 'puzzle_ap' : null;
  const staminaKey = kind === 'puzzle' ? 'puzzle_stamina'
    : kind === 'question' && tone === 'evidence' ? 'interview_stamina'
      : kind === 'inspect' && TECHNICAL_ACTIONS.has(actionTag) ? 'technical_stamina' : null;
  if (apKey && quoted.ap_cost > 0 && remaining(run, apKey)) {
    quoted.skill_ap_discount = Math.min(1, quoted.ap_cost);
    quoted.ap_cost -= quoted.skill_ap_discount;
    quoted.skill_uses.push(apKey);
  }
  if (staminaKey && quoted.stamina_cost > 0 && remaining(run, staminaKey)) {
    quoted.skill_stamina_discount = Math.min(4, quoted.stamina_cost);
    quoted.stamina_cost -= quoted.skill_stamina_discount;
    quoted.skill_uses.push(staminaKey);
  }
  return quoted;
}

/** Call only once after an accepted, non-review action has paid its quoted cost. */
export function consumeInvestigationSkills(run, quote) {
  if (!usesInvestigationSkills(run)) return;
  const keys = [...new Set(Array.isArray(quote?.skill_uses) ? quote.skill_uses : [])];
  const quoteKeys = new Set(['inspection_ap', 'puzzle_ap', 'puzzle_stamina', 'interview_stamina', 'technical_stamina']);
  if (keys.some(key => !quoteKeys.has(key) || !remaining(run, key))) {
    throw Object.assign(new Error('STALE_OPTIONS'), { code: 'STALE_OPTIONS', status: 400 });
  }
  keys.forEach(key => spend(run, key));
}

export function professionalObservationThreshold(run, abilityKey) {
  if (!usesInvestigationSkills(run)) return 60;
  const ability = String(abilityKey || '').replace(/^base_/, '');
  const prepared = effects(run);
  return ability === 'hack_level' ? prepared.hack_note_threshold
    : ability === 'observation_focus' ? prepared.observation_note_threshold : 60;
}

/** Correctness is decided by the caller; free reviews must not call this helper. */
export function applyInvestigationSkillSuccess(run, { kind = 'inspect' } = {}) {
  const current = amount(run?.state?.confusion_score);
  const reduction = kind === 'inspect' && remaining(run, 'verification_calm') ? Math.min(1, current) : 0;
  if (reduction) {
    spend(run, 'verification_calm');
    run.state.confusion_score = current - reduction;
  }
  return { reduction, skill_uses: reduction ? ['verification_calm'] : [] };
}

/** Apply after the actual positive consequence is known, never while rendering an offer. */
export function mitigateInvestigationSkillConfusion(run, increase, { kind, tone = '', consume = true } = {}) {
  let value = amount(increase);
  const keys = kind === 'question' && tone === 'firm' ? [['firm_confusion', 1]]
    : kind === 'crisis' ? [['crisis_resistance', 3], ['crisis_firewall', 5]] : [];
  const skillUses = [];
  for (const [key, limit] of keys) {
    if (value > 0 && remaining(run, key)) {
      const reduction = Math.min(value, Number(limit));
      value -= reduction;
      if (consume) spend(run, key);
      skillUses.push(key);
    }
  }
  return { confusion_increase: value, reduction: amount(increase) - value, skill_uses: skillUses };
}

/** Input must be public projections already marked reachable by the authority. */
export function sourceHintInvestigationSkill(run, candidates = []) {
  if (!remaining(run, 'source_hint')) return null;
  const target = candidates.find(item => item && item.available === true && item.reachable === true
    && !item.completed && !item.hidden && typeof item.target_id === 'string'
    && typeof item.label?.zh === 'string' && typeof item.label?.en === 'string');
  if (!target) return null;
  // Explicit projection prevents accidentally retaining reward, method or private fields.
  const hint = { target_id: target.target_id, zone_id: target.zone_id,
    label: { zh: target.label.zh, en: target.label.en },
    zone_label: { zh: target.zone_label?.zh || target.zone_id, en: target.zone_label?.en || target.zone_id } };
  spend(run, 'source_hint');
  run.investigation.skill_hints = [hint];
  return hint;
}

export function publicInvestigationSkills(run) {
  if (!usesInvestigationSkills(run)) return null;
  const prepared = effects(run);
  const budgets = Object.fromEntries(Object.keys(INVESTIGATION_SKILL_LIMITS).map(key => [key, {
    label: { ...INVESTIGATION_SKILL_BUDGET_LABELS[key] },
    total: prepared[key], used: used(run, key), remaining: remaining(run, key),
  }]));
  const hints = (run.investigation.skill_hints || []).slice(0, 1).map(hint => ({
    target_id: hint.target_id, zone_id: hint.zone_id,
    label: { zh: hint.label?.zh, en: hint.label?.en },
    zone_label: { zh: hint.zone_label?.zh, en: hint.zone_label?.en },
  }));
  const active = activeInvestigationSkillIds(run.team_config?.skill_effects).map(skillId => ({
    skill_id: skillId, description: {
      zh: investigationSkillDescription(skillId, 'zh'), en: investigationSkillDescription(skillId, 'en'),
    },
  }));
  return { revision: INVESTIGATION_SKILLS_REVISION, budgets, active,
    professional_note_thresholds: { logic_power: 60, hack_level: prepared.hack_note_threshold,
      observation_focus: prepared.observation_note_threshold }, hints };
}
