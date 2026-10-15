// Public skill rules only. No case content, evidence IDs or answer mappings.
export const INVESTIGATION_SKILLS_REVISION = 1;

export const INVESTIGATION_SKILL_LIMITS = Object.freeze({
  inspection_ap: 2,
  source_hint: 1,
  verification_calm: 3,
  firm_confusion: 2,
  puzzle_stamina: 1,
  interview_stamina: 1,
  crisis_resistance: 1,
  technical_stamina: 1,
  puzzle_ap: 1,
  crisis_firewall: 1,
});

export const INVESTIGATION_SKILL_BUDGET_LABELS = Object.freeze({
  inspection_ap: { zh: '现场核验免 AP', en: 'Field-check AP waiver' },
  source_hint: { zh: '后续来源提醒', en: 'Follow-up source hint' },
  verification_calm: { zh: '核验降低混乱', en: 'Verification calming' },
  firm_confusion: { zh: '明确追问抗扰', en: 'Direct-question protection' },
  puzzle_stamina: { zh: '专属核验体力减免', en: 'Special-verification stamina discount' },
  interview_stamina: { zh: '证据对峙体力减免', en: 'Evidence-confrontation stamina discount' },
  crisis_resistance: { zh: '铁血逻辑危机抗扰', en: 'Iron Logic crisis protection' },
  technical_stamina: { zh: '文档与终端体力减免', en: 'Document / terminal stamina discount' },
  puzzle_ap: { zh: '专属核验免 AP', en: 'Special-verification AP waiver' },
  crisis_firewall: { zh: '量子幽灵危机防护', en: 'Quantum Ghost crisis protection' },
});

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Interpret the authoritative aggregate loadout; all benefits have fixed caps. */
export function getInvestigationSkillEffects(effects = {}) {
  effects = effects && typeof effects === 'object' && !Array.isArray(effects) ? effects : {};
  const discount = positive(effects.ap_cost_discount) ? effects.ap_cost_discount : 0;
  return {
    inspection_ap: discount >= .25 - 1e-9 ? 2 : discount >= .10 - 1e-9 ? 1 : 0,
    source_hint: positive(effects.bonus_clue_chance) ? 1 : 0,
    verification_calm: positive(effects.confusion_regen) ? 3 : 0,
    firm_confusion: positive(effects.npc_confusion_reduce) ? 2 : 0,
    puzzle_stamina: positive(effects.think_speed_boost) ? 1 : 0,
    interview_stamina: positive(effects.interrogation_bonus) ? 1 : 0,
    crisis_resistance: positive(effects.confusion_resistance) ? 1 : 0,
    technical_stamina: positive(effects.hack_success_rate) ? 1 : 0,
    puzzle_ap: effects.free_decrypt === true ? 1 : 0,
    crisis_firewall: effects.trap_immunity === true ? 1 : 0,
    first_check_ap: effects.auto_unlock_first === true,
    crash_recovery: effects.bsod_immunity === true,
    hack_note_threshold: effects.zone_unlock_bonus === true ? 50 : 60,
    observation_note_threshold: positive(effects.passive_scan_chance) ? 50 : 60,
  };
}

const DESCRIPTIONS = Object.freeze({
  s0_1: {
    zh: '每案有 1 次现场核验减免 1 AP；已有免单时保留额度。仍需选择方法、消耗体力并推进回合。',
    en: 'Waive 1 AP for one field check per case. An already-free check keeps this allowance. Choose the method, spend stamina and advance a turn.',
  },
  s0_2: {
    zh: '成功新核验后，若有已公开、已可达且可调查的后续对象，提醒其对象及区域，每案 1 次；不会自动取证或指出正确方法。',
    en: 'After a successful new field check, point out an already-public, reachable and available follow-up object and its area, if one exists, once per case. Does not discover evidence automatically or identify the correct method.',
  },
  s0_3: {
    zh: '成功完成新核验时，混乱降低 1 点，每案最多 3 次；混乱为零及免费复查不消耗额度。',
    en: 'A successful new field check reduces confusion by 1, up to three times per case. Zero confusion and free reviews keep the allowance.',
  },
  s0_4: {
    zh: '将锐利感知的每案现场核验减免增加至共 2 次，每次减免 1 AP；已有免单时保留额度。',
    en: 'Increase Sharp Perception to two field-check allowances per case, each waiving 1 AP. An already-free check keeps the allowance.',
  },
  s0_5: {
    zh: '首次现场核验免 1 AP；仍需选择方法、消耗体力并推进一回合。此额度先于锐利感知使用。',
    en: 'The first field check waives 1 AP; choose its method, spend stamina and advance one turn. This allowance is used before Sharp Perception.',
  },
  s1_1: {
    zh: '明确追问产生混乱时，混乱增量减少 1 点，每案最多 2 次；不改变证词正确性或合作度。',
    en: 'Reduce confusion from a direct question by 1, up to twice per case. Does not change testimony correctness or cooperation.',
  },
  s1_2: {
    zh: '每案 1 次专属核验少消耗 4 点体力；正式提交才使用，仍由系统校验所选材料。',
    en: 'One special-verification submission per case costs 4 less stamina. Only submission uses the allowance; the system still checks the selected materials.',
  },
  s1_3: {
    zh: '每案 1 次证据对峙少消耗 4 点体力；仍须取得并选择对应证据，不会自动追问或取证。',
    en: 'One evidence confrontation per case costs 4 less stamina. Matching evidence is still required; no automatic follow-up or evidence discovery.',
  },
  s1_4: {
    zh: '每案首次处理增加混乱的危机选项，即时混乱增量最多减少 3 点；AP、信誉与延期到期后果照常。',
    en: 'Reduce the first positive immediate confusion increase from a crisis choice by up to 3 per case. AP, reputation and expired-deferral consequences still apply.',
  },
  s1_5: {
    zh: '手动恢复崩溃时免除 5 AP 罚；仍需执行恢复，不会自动恢复或阻止崩溃。',
    en: 'Manual crash recovery waives the 5 AP penalty; recovery is still required. Does not prevent crashes or recover automatically.',
  },
  s2_1: {
    zh: '每案 1 次文档或终端类新核验少消耗 4 点体力；不改变正确方法或自动取得证据。',
    en: 'One new document or terminal check per case costs 4 less stamina. Does not change the correct method or acquire evidence automatically.',
  },
  s2_2: {
    zh: '每案 1 次专属核验减免 1 AP；已有免单时保留额度，仍需完成原始材料操作与提交。',
    en: 'Waive 1 AP for one special-verification submission per case. An already-free submission keeps the allowance; material operations and submission are still required.',
  },
  s2_3: {
    zh: '黑客类专业笔记的能力门槛由 24 降至 20 点；正确核验后补充专业观察，不自动解锁区域或线索。',
    en: 'Lower the Hack threshold for professional notes from 24 to 20. Adds analysis after correct verification; does not unlock areas or evidence automatically.',
  },
  s2_4: {
    zh: '观察类专业笔记的能力门槛由 24 降至 20 点；正确核验后补充专业观察，不自动发现隐藏线索。',
    en: 'Lower the Observation threshold for professional notes from 24 to 20. Adds analysis after correct verification; does not discover hidden clues automatically.',
  },
  s2_5: {
    zh: '每案 1 次危机选项的即时混乱增量最多减少 5 点，可接续铁血逻辑；不免除 AP、信誉或延期到期后果，也不跳过危机。',
    en: 'Reduce positive immediate confusion from a crisis choice by up to 5 once per case, after Iron Logic if present. Does not waive AP or reputation costs, expired-deferral consequences, or skip the crisis.',
  },
});

export function investigationSkillDescription(skillOrId, lang = 'zh') {
  const id = typeof skillOrId === 'string' ? skillOrId : skillOrId?.id;
  return DESCRIPTIONS[id]?.[lang === 'en' ? 'en' : 'zh'] || '';
}

/** Active catalog IDs derived from the same frozen, aggregate effects used by the authority. */
export function activeInvestigationSkillIds(effects = {}) {
  const prepared = getInvestigationSkillEffects(effects);
  return [
    ['s0_1', prepared.inspection_ap > 0], ['s0_2', prepared.source_hint > 0],
    ['s0_3', prepared.verification_calm > 0], ['s0_4', prepared.inspection_ap > 1],
    ['s0_5', prepared.first_check_ap], ['s1_1', prepared.firm_confusion > 0],
    ['s1_2', prepared.puzzle_stamina > 0], ['s1_3', prepared.interview_stamina > 0],
    ['s1_4', prepared.crisis_resistance > 0], ['s1_5', prepared.crash_recovery],
    ['s2_1', prepared.technical_stamina > 0], ['s2_2', prepared.puzzle_ap > 0],
    ['s2_3', prepared.hack_note_threshold < 60], ['s2_4', prepared.observation_note_threshold < 60],
    ['s2_5', prepared.crisis_firewall > 0],
  ].filter(([, enabled]) => enabled).map(([id]) => String(id));
}
