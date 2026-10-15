import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { SKILL_TREES } from '../src/game/agentProgression.js';
import * as progression from '../src/game/agentProgression.js';
import * as skillRules from '../src/game/investigationSkills.js';
import { INVESTIGATION_SKILLS_REVISION, getInvestigationSkillEffects,
  investigationSkillDescription, activeInvestigationSkillIds } from '../src/game/investigationSkills.js';
import { usesInvestigationSkills, quoteInvestigationSkills, consumeInvestigationSkills,
  professionalObservationThreshold, applyInvestigationSkillSuccess, mitigateInvestigationSkillConfusion,
  sourceHintInvestigationSkill, publicInvestigationSkills } from '../server/investigationV2/skills.js';

function run(effects = {}, revision = INVESTIGATION_SKILLS_REVISION) {
  return { investigation_version: 2, investigation: { skills_revision: revision, skill_usage: {}, skill_hints: [] },
    team_config: { skill_effects: effects }, state: { confusion_score: 10, unlocked_clues: [] } };
}
function fullLoadout() {
  return SKILL_TREES.flat().reduce((effects, skill) => {
    effects[skill.effect_key] = typeof skill.effect_value === 'number'
      ? (effects[skill.effect_key] || 0) + skill.effect_value : skill.effect_value;
    return effects;
  }, {});
}
const exposedTarget = { target_id: 'public-object', zone_id: 'public-area', available: true, reachable: true,
  label: { zh: '已公开物件', en: 'Public object' }, zone_label: { zh: '已开放区域', en: 'Open area' } };

test('all fifteen catalog skills map to actual manual-investigation effects with bilingual exact scopes', () => {
  const effects = fullLoadout();
  assert.deepEqual(new Set(activeInvestigationSkillIds(effects)), new Set(SKILL_TREES.flat().map(skill => skill.id)));
  const prepared = getInvestigationSkillEffects(effects);
  assert.equal(prepared.inspection_ap, 2, 'later discount adds an allowance rather than scaling an uncapped percentage');
  assert.equal(prepared.first_check_ap, true);
  assert.equal(prepared.crash_recovery, true);
  for (const skill of SKILL_TREES.flat()) {
    assert.ok(investigationSkillDescription(skill, 'zh').length > 20, `${skill.id}: explicit Chinese effect`);
    assert.ok(investigationSkillDescription(skill, 'en').length > 20, `${skill.id}: explicit English effect`);
  }
  assert.match(investigationSkillDescription('s2_5', 'en'), /Does not waive AP or reputation costs/);
  assert.match(investigationSkillDescription('s0_2', 'en'), /Does not discover evidence automatically/);
  assert.equal(investigationSkillDescription('unknown'), '');
});

test('frozen v1, persisted v2 without revision and unknown future revisions never consume or change skills', () => {
  for (const [version, revision] of [[1, 1], [2, undefined], [2, 0], [2, 2]]) {
    const current = run(fullLoadout());
    current.investigation_version = version;
    current.investigation.skills_revision = revision;
    const before = JSON.stringify(current);
    assert.equal(usesInvestigationSkills(current), false);
    const quote = quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'access_database' });
    assert.equal(quote.ap_cost, 1);
    assert.equal(quote.stamina_cost, 10);
    assert.deepEqual(quote.skill_uses, []);
    consumeInvestigationSkills(current, { skill_uses: ['inspection_ap'] });
    assert.equal(professionalObservationThreshold(current, 'base_hack_level'), 60);
    assert.equal(applyInvestigationSkillSuccess(current).reduction, 0);
    assert.equal(mitigateInvestigationSkillConfusion(current, 12, { kind: 'crisis' }).confusion_increase, 12);
    assert.equal(sourceHintInvestigationSkill(current, [exposedTarget]), null);
    assert.equal(publicInvestigationSkills(current), null);
    assert.equal(JSON.stringify(current), before, 'even missing state is not initialized on frozen runs');
  }
});

test('field-check quotes are read-only, consume once after charge, and preserve discounts on already-free checks', () => {
  const current = run({ ap_cost_discount: .25, hack_success_rate: .2 });
  const initial = JSON.stringify(current);
  const first = quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'access_database' });
  assert.equal(first.ap_cost, 0);
  assert.equal(first.stamina_cost, 6);
  assert.deepEqual(first.skill_uses, ['inspection_ap', 'technical_stamina']);
  assert.deepEqual(quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'access_database' }), first);
  assert.equal(JSON.stringify(current), initial, 'opening and refreshing options costs no budget');
  consumeInvestigationSkills(current, first);
  const free = quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'check_cctv', apCost: 0 });
  assert.deepEqual(free.skill_uses, []);
  consumeInvestigationSkills(current, free);
  const second = quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'check_cctv' });
  assert.equal(second.stamina_cost, 10);
  assert.deepEqual(second.skill_uses, ['inspection_ap']);
  consumeInvestigationSkills(current, second);
  assert.equal(quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'access_database' }).ap_cost, 1);
  assert.throws(() => consumeInvestigationSkills(current, first), { code: 'STALE_OPTIONS' });
  assert.equal(current.investigation.skill_usage.inspection_ap, 2);
});

test('independent puzzle and evidence-confrontation stamina allowances never discount gentle questioning or reviews', () => {
  const current = run({ think_speed_boost: .3, interrogation_bonus: .3, free_decrypt: true });
  assert.deepEqual(quoteInvestigationSkills(current, { kind: 'question', tone: 'gentle' }).skill_uses, []);
  const evidence = quoteInvestigationSkills(current, { kind: 'question', tone: 'evidence' });
  assert.equal(evidence.ap_cost, 1);
  assert.equal(evidence.stamina_cost, 6);
  consumeInvestigationSkills(current, evidence);
  const puzzle = quoteInvestigationSkills(current, { kind: 'puzzle' });
  assert.equal(puzzle.ap_cost, 0);
  assert.equal(puzzle.stamina_cost, 6);
  assert.deepEqual(puzzle.skill_uses, ['puzzle_ap', 'puzzle_stamina']);
  consumeInvestigationSkills(current, puzzle);
  assert.equal(quoteInvestigationSkills(current, { kind: 'puzzle' }).ap_cost, 1);
  assert.equal(quoteInvestigationSkills(current, { kind: 'puzzle' }).stamina_cost, 10);
  assert.deepEqual(quoteInvestigationSkills(current, { kind: 'question', tone: 'evidence', apCost: 0, staminaCost: 0 }).skill_uses, []);
  assert.throws(() => consumeInvestigationSkills(current, { skill_uses: ['source_hint'] }), { code: 'STALE_OPTIONS' });
});

test('stamina quotes cannot go negative and accept only public technical action tags', () => {
  const current = run({ hack_success_rate: .2, ap_cost_discount: .10 });
  assert.equal(quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'analyze_forensics' }).stamina_cost, 10);
  const small = quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'check_cctv', staminaCost: 2, apCost: .5 });
  assert.equal(small.ap_cost, 0);
  assert.equal(small.stamina_cost, 0);
  assert.equal(small.skill_ap_discount, .5);
  assert.equal(small.skill_stamina_discount, 2);
  assert.equal(quoteInvestigationSkills(current, { kind: 'inspect', apCost: NaN, staminaCost: -4 }).stamina_cost, 0);
});

test('professional notes lower only Hack and Observation thresholds after the new-revision gate', () => {
  const current = run({ zone_unlock_bonus: true, passive_scan_chance: .05 });
  assert.equal(professionalObservationThreshold(current, 'base_hack_level'), 50);
  assert.equal(professionalObservationThreshold(current, 'hack_level'), 50);
  assert.equal(professionalObservationThreshold(current, 'base_observation_focus'), 50);
  assert.equal(professionalObservationThreshold(current, 'logic_power'), 60);
  assert.equal(professionalObservationThreshold(current, 'unknown'), 60);
  assert.deepEqual(current.state.unlocked_clues, [], 'lowering an expert-note threshold cannot obtain evidence');
});

test('success calming is bounded to three new inspections and zero confusion preserves the allowance', () => {
  const current = run({ confusion_regen: 5 });
  current.state.confusion_score = 0;
  assert.equal(applyInvestigationSkillSuccess(current).reduction, 0);
  assert.deepEqual(current.investigation.skill_usage, {});
  current.state.confusion_score = 5;
  assert.equal(applyInvestigationSkillSuccess(current, { kind: 'question' }).reduction, 0);
  for (let index = 0; index < 3; index++) assert.equal(applyInvestigationSkillSuccess(current).reduction, 1);
  assert.equal(current.state.confusion_score, 2);
  assert.equal(applyInvestigationSkillSuccess(current).reduction, 0);
});

test('crisis previews match actual bounded mitigation and leave AP, reputation and evidence untouched', () => {
  const current = run({ confusion_resistance: .25, trap_immunity: true, npc_confusion_reduce: .2 });
  Object.assign(current.state, { action_points_left: 12, reputation: 80, unlocked_clues: ['known'] });
  const before = JSON.stringify(current);
  const preview = mitigateInvestigationSkillConfusion(current, 15, { kind: 'crisis', consume: false });
  assert.equal(preview.confusion_increase, 7);
  assert.deepEqual(preview.skill_uses, ['crisis_resistance', 'crisis_firewall']);
  assert.equal(JSON.stringify(current), before);
  assert.deepEqual(mitigateInvestigationSkillConfusion(current, 15, { kind: 'crisis' }), preview);
  assert.equal(mitigateInvestigationSkillConfusion(current, 15, { kind: 'crisis' }).confusion_increase, 15);
  assert.equal(mitigateInvestigationSkillConfusion(current, 2, { kind: 'question', tone: 'firm' }).confusion_increase, 1);
  assert.equal(mitigateInvestigationSkillConfusion(current, 2, { kind: 'question', tone: 'firm' }).confusion_increase, 1);
  assert.equal(mitigateInvestigationSkillConfusion(current, 2, { kind: 'question', tone: 'firm' }).confusion_increase, 2);
  assert.equal(current.state.action_points_left, 12);
  assert.equal(current.state.reputation, 80);
  assert.deepEqual(current.state.unlocked_clues, ['known']);
});

test('small crisis increases preserve the second protection and nonpositive effects spend nothing', () => {
  const current = run({ confusion_resistance: .25, trap_immunity: true });
  assert.equal(mitigateInvestigationSkillConfusion(current, 0, { kind: 'crisis' }).reduction, 0);
  assert.equal(mitigateInvestigationSkillConfusion(current, -10, { kind: 'crisis' }).reduction, 0);
  assert.deepEqual(current.investigation.skill_usage, {});
  assert.equal(mitigateInvestigationSkillConfusion(current, 1, { kind: 'crisis' }).confusion_increase, 0);
  assert.deepEqual(current.investigation.skill_usage, { crisis_resistance: 1 });
  assert.equal(mitigateInvestigationSkillConfusion(current, 8, { kind: 'crisis' }).confusion_increase, 3);
});

test('source hints require public, available and reachable inputs, retain only public display fields, and survive review read-only', () => {
  const current = run({ bonus_clue_chance: .15 });
  for (const rejected of [{ ...exposedTarget, hidden: true }, { ...exposedTarget, completed: true },
    { ...exposedTarget, available: false }, { ...exposedTarget, reachable: false }, { ...exposedTarget, reachable: undefined }]) {
    assert.equal(sourceHintInvestigationSkill(current, [rejected]), null);
  }
  assert.deepEqual(current.investigation.skill_usage, {});
  const hint = sourceHintInvestigationSkill(current, [{ ...exposedTarget,
    method_id: 'private-answer', clue_id: 'private-reward', result: 'private-result' }]);
  assert.equal(hint.label.zh, exposedTarget.label.zh);
  assert.equal(sourceHintInvestigationSkill(current, [exposedTarget]), null);
  const before = JSON.stringify(current);
  const projected = publicInvestigationSkills(current);
  assert.equal(JSON.stringify(current), before);
  assert.equal(projected.budgets.source_hint.remaining, 0);
  assert.equal(projected.hints[0].label.en, 'Public object');
  assert.equal(projected.hints[0].zone_label.zh, '已开放区域');
  assert.doesNotMatch(JSON.stringify(projected), /private-answer|private-reward|private-result|method_id|clue_id/);
  assert.deepEqual(current.state.unlocked_clues, []);
});

test('public skill snapshots expose bilingual effects and independent remaining budgets without mutating state', () => {
  const current = run(fullLoadout());
  const first = quoteInvestigationSkills(current, { kind: 'inspect', actionTag: 'check_cctv' });
  consumeInvestigationSkills(current, first);
  const before = JSON.stringify(current);
  const publicSkills = publicInvestigationSkills(current);
  assert.equal(publicSkills.active.length, 15);
  assert.equal(publicSkills.budgets.inspection_ap.remaining, 1);
  assert.equal(publicSkills.budgets.technical_stamina.remaining, 0);
  assert.equal(publicSkills.budgets.puzzle_ap.remaining, 1);
  for (const item of publicSkills.active) assert.ok(item.description.zh && item.description.en);
  assert.equal(JSON.stringify(current), before);
});

test('malformed effects and very large bonuses cannot grant unlimited allowances', () => {
  assert.deepEqual(activeInvestigationSkillIds(null), []);
  for (const value of [null, [], 'bad', undefined]) assert.equal(getInvestigationSkillEffects(value).inspection_ap, 0);
  const malformed = getInvestigationSkillEffects({ ap_cost_discount: Infinity, free_decrypt: 'true',
    bonus_clue_chance: '0.9', trap_immunity: 1 });
  assert.equal(malformed.inspection_ap, 0);
  assert.equal(malformed.puzzle_ap, 0);
  assert.equal(malformed.source_hint, 0);
  assert.equal(malformed.crisis_firewall, 0);
  assert.equal(getInvestigationSkillEffects({ ap_cost_discount: 999, confusion_regen: 999 }).inspection_ap, 2);
  assert.equal(getInvestigationSkillEffects({ ap_cost_discount: 999, confusion_regen: 999 }).verification_calm, 3);
});

test('the skill tree presents new manual benefits as primary copy while frozen runs retain their original scope', () => {
  const source = readFileSync(new URL('../src/components/game/SkillTreePanel.jsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022,
  } });
  for (const lang of ['zh', 'en']) {
    const imports = {
      react: { ...React, default: React }, '@/components/ui/Icon': { default: () => null },
      '@/game/agentProgression': progression, '@/game/investigationSkills.js': skillRules,
      '@/lib/lang.jsx': { useLang: () => ({ lang }) },
      '@/components/ui/usePresentationMotion': { usePresentationMotion: () => ({ motionEnabled: false, foreground: true }) },
    };
    const exports = {};
    compileFunction(outputText, ['require', 'exports'])(name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
      return imports[name];
    }, exports);
    const props = { agentIdx: 0, progression: [{ xp: 4000 }, { xp: 4000 }, { xp: 4000 }],
      loadout: [SKILL_TREES[0].map(skill => skill.id), [], []] };
    const current = renderToStaticMarkup(React.createElement(exports.default, props));
    assert.match(current, lang === 'zh' ? /成功完成新核验时/ : /A successful new field check/);
    assert.doesNotMatch(current, /每回合有15%概率|15% chance to discover/);
    assert.match(current, lang === 'zh' ? /已经开始的案件继续沿用开案时的效果/ : /Active cases keep the effects saved at entry/);
    const frozen = renderToStaticMarkup(React.createElement(exports.default, { ...props, skillsRevision: 0 }));
    assert.match(frozen, lang === 'zh' ? /当前手动调查不应用此效果/ : /not applied in manual investigation/);
    assert.doesNotMatch(frozen, lang === 'zh' ? /成功完成新核验时/ : /A successful new field check/);
    const legacy = renderToStaticMarkup(React.createElement(exports.default, { ...props, investigationVersion: 1 }));
    assert.match(legacy, lang === 'zh' ? /旧版自动调查：开局取得一条当前区域可用线索/ : /Legacy investigation: reveal one available clue/);
  }
});
