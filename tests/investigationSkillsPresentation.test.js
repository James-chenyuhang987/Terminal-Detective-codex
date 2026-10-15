import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { SKILL_TREES } from '../src/game/agentProgression.js';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { getConnectedZones } from '../src/game/caseRuntime.js';
import * as stamina from '../src/game/agentStamina.js';

function load(path, imports) {
  const source = readFileSync(new URL(`../src/components/game/investigation/${path}.jsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected skills presentation dependency ${id}`);
    return imports[id];
  }, exports);
  return exports;
}
const skillsPanel = load('InvestigationSkillsPanel', {
  react: { ...React, default: React }, '@/game/agentProgression.js': { SKILL_TREES },
  '@/game/investigationChoices.js': { localizedInvestigationText }, './investigationSkills.css': {},
});
const text = (zh, en) => ({ zh, en });
const hint = { target_id: 'public_target', zone_id: 'hall',
  label: text('公开读卡器', 'Public reader'), zone_label: text('门厅', 'Entrance hall') };
const skills = { revision: 1, active: [{ skill_id: 's0_1', description: text('本案减免一次，仍需核验。', 'One allowance this case; inspection is still required.') }],
  budgets: {
    inspection_ap: { label: text('核验减免', 'Inspection savings'), total: 2, used: 1, remaining: 1 },
    source_hint: { label: text('线索方向', 'Follow-up direction'), total: 1, used: 1, remaining: 0 },
    inactive: { label: text('未生效额度', 'Inactive allowance'), total: 0, used: 0, remaining: 0 },
  }, hints: [hint] };
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('case skills are collapsed by default and show exact authority descriptions and remaining allowances in both languages', () => {
  const before = JSON.stringify(skills);
  for (const lang of ['zh', 'en']) {
    const markup = render(skillsPanel.default, { skills, lang });
    assert.match(markup, /^<details class="td-investigation-skills"><summary>/);
    assert.doesNotMatch(markup, /<details[^>]*\bopen/);
    assert.ok(markup.includes(skills.active[0].description[lang]));
    assert.ok(markup.includes(lang === 'zh' ? '已用 1 / 2 · 剩余 1' : 'Used 1 / 2 · Remaining 1'));
    assert.ok(markup.includes(lang === 'zh' ? '已用 1 / 1 · 剩余 0' : 'Used 1 / 1 · Remaining 0'));
    assert.ok(markup.includes(skills.budgets.inspection_ap.label[lang]));
    assert.equal(markup.includes(skills.budgets.inactive.label[lang]), false);
    assert.equal(markup.includes(lang === 'zh' ? 'AP消耗降低10%' : 'Reduces AP costs by 10%'), false, 'legacy catalog descriptions cannot override the live authority rules');
    assert.doesNotMatch(markup, /<button|<form|role="dialog"|aria-modal/);
  }
  assert.equal(JSON.stringify(skills), before);
  assert.equal(render(skillsPanel.default, {}), '');
  assert.equal(render(skillsPanel.default, { skills: { ...skills, revision: 2 } }), '');
});

test('source suggestions name only supplied public objects and do not claim that evidence or the correct method was discovered', () => {
  for (const lang of ['zh', 'en']) {
    const markup = render(skillsPanel.InvestigationSourceHint, { hint, lang });
    assert.ok(markup.includes(hint.label[lang]) && markup.includes(hint.zone_label[lang]));
    assert.ok(markup.includes(lang === 'zh' ? '仍需自行选择核验' : 'choose and perform its inspection yourself'));
    assert.doesNotMatch(markup, /新证据|已取得证据|正确方法|new evidence|correct method|public_target|<button/);
  }
  assert.equal(render(skillsPanel.InvestigationSourceHint, {}), '');
});

test('skill discounts explain the existing quote without calculating or applying another reduction', () => {
  const quote = { ap_cost: 0, stamina_cost: 6, skill_ap_discount: 1, skill_stamina_discount: 4 };
  const before = JSON.stringify(quote);
  for (const lang of ['zh', 'en']) {
    const markup = render(skillsPanel.InvestigationSkillQuote, { quote, lang });
    assert.ok(markup.includes(lang === 'zh' ? '技能优惠已计入报价' : 'Skill savings included in this quote'));
    assert.match(markup, /AP −1/);
    assert.match(markup, lang === 'zh' ? /体力 −4/ : /Stamina −4/);
    assert.doesNotMatch(markup, /−0|NaN|undefined/);
  }
  assert.equal(JSON.stringify(quote), before);
  for (const value of [null, {}, { skill_ap_discount: 0, skill_stamina_discount: 0 }]) {
    assert.equal(render(skillsPanel.InvestigationSkillQuote, { quote: value }), '');
  }
});

test('the actual field panel presents confirmed source hints and skill-adjusted cards without issuing commands', () => {
  for (const lang of ['zh', 'en']) {
    let cursor = 0;
    const card = { option_id: 'quoted-option', label: text('核对原始记录', 'Check original record'),
      available: true, ap_cost: 0, stamina_cost: 6, skill_ap_discount: 1, skill_stamina_discount: 4 };
    const states = [{ agent: { cards: [card] } }, 'agent', false, '', { narration: 'Confirmed finding', source_hint: hint }];
    const hooks = { ...React, default: React, lazy: () => () => null,
      useState(initial) { const index = cursor++; return [index < states.length ? states[index] : typeof initial === 'function' ? initial() : initial, () => assert.fail('Passive reading cannot set investigation state')]; },
      useMemo: factory => factory(), useRef: initial => ({ current: initial }), useEffect: () => {},
    };
    const field = load('InvestigationFieldPanel', {
      react: hooks, '@/lib/lang.jsx': { useLang: () => ({ lang }) },
      '@/game/investigationChoices.js': { localizedInvestigationText }, '@/game/caseRuntime.js': { getConnectedZones },
      '@/game/agentStamina': stamina, './ReconstructionWorkbench.jsx': { default: () => null },
      './CaseStoryPanel.jsx': { default: () => null }, './InvestigationSkillsPanel.jsx': skillsPanel, './investigationField.css': {},
    });
    const markup = render(field.default, { investigation: { skills, targets: [{ target_id: 'reader', zone_id: 'hall', kind: 'terminal', available: true }], puzzle: {}, zone_access: {} },
      gameState: { run_id: 'case', current_zone: 'hall', unlocked_clues: [], action_points_left: 10 },
      caseData: { scene: { zones: { hall: { label: 'Hall' } } }, clue_dictionary: [] }, team: [{ agent_id: 'agent', stamina: 100 }],
      targetId: 'reader', onTargetChange: () => assert.fail('Reading cannot select a target'), onCommand: () => assert.fail('Reading cannot submit a command'), busy: false });
    assert.ok(markup.includes(hint.label[lang]));
    assert.ok(markup.includes(lang === 'zh' ? '技能优惠已计入报价' : 'Skill savings included in this quote'));
    assert.ok(markup.includes('0 AP') && markup.includes('−6%'));
  }
});

test('skill disclosure and follow-up hints keep mobile wrapping and native keyboard access', () => {
  const css = readFileSync(new URL('../src/components/game/investigation/investigationSkills.css', import.meta.url), 'utf8');
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /summary:focus-visible/);
  assert.match(css, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(css, /position:\s*(fixed|absolute)|animation:/);
});
