import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { buildInvestigationReconstruction } from '../src/game/investigationReconstruction.js';
import { buildPublicCaseContext } from '../src/game/narrativeEngine.js';
import { theaterNarrativeStage } from '../src/game/theaterNarrative.js';
import { Case_Data_Lvl_01 } from '../src/game/caseData.js';

let language = 'zh';
function load(name, dependencies = {}) {
  const source = readFileSync(new URL(`../src/components/game/investigation/${name}.jsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const imports = { react: { ...React, default: React },
    '@/lib/lang.jsx': { useLang: () => ({ lang: language }) },
    '@/game/investigationChoices.js': { localizedInvestigationText }, ...dependencies };
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected story dependency ${id}`);
    return imports[id];
  }, exports);
  return exports;
}
const reference = load('EvidenceReference', { './evidenceArchive.css': {} });
const panel = load('CaseStoryPanel', { './EvidenceReference.jsx': reference, './caseStory.css': {} });
const review = load('CaseReconstruction', {
  '@/game/investigationReconstruction.js': { buildInvestigationReconstruction },
  './EvidenceReference.jsx': reference, './CaseStoryPanel.jsx': panel, './caseReconstruction.css': {},
  './EvidenceReportExplanation.jsx': { default: () => null },
});
const t = (zh, en) => ({ zh, en });
const story = {
  stage: 'pursuit', focus: t('复制卡不等于使用者，先核对实际操作者。', 'A copied card is not its user; verify the actual operator.'),
  milestones: [{ id: 'access', title: t('卡片与身份分开', 'Separate badge from identity'),
    body: t('读卡器保留了不同的硬件签章。', 'The reader retained a different hardware signature.'), evidence_ids: ['c_03'] }],
  resolution: { title: t('本案事件重建', 'Reconstructing this case'),
    sequence: [{ title: t('事件先后', 'Event order'), body: t('两份已核对记录确定先后。', 'Two checked records establish the order.'), evidence_ids: ['c_03', 'unknown'] }],
    aftermath: [{ title: t('仍需承担的责任', 'Responsibility that remains'), body: t('已保存的风险记录转交后续调查。', 'Preserved risk records are referred for further inquiry.'), evidence_ids: ['c_03'] }],
  },
};
const knownClues = [{ clue_id: 'c_03', keyword: '读卡签章', description: '两组签章均已封存。' }];
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('active story presents only projected focus and earned turning points, without exposing the ending', () => {
  const snapshot = JSON.stringify(story);
  for (language of ['zh', 'en']) {
    const markup = render(panel.default, { story, lang: language, knownClues });
    assert.ok(markup.includes(story.focus[language]));
    assert.ok(markup.includes(story.milestones[0].body[language]));
    assert.equal(markup.includes(story.resolution.sequence[0].body[language]), false);
    assert.match(markup, /<details[^>]*><summary>/);
    assert.doesNotMatch(markup, /role="dialog"|aria-modal|autofocus|<form|<button|position:\s*fixed/);
    assert.ok(markup.includes('两组签章均已封存。'));
  }
  assert.equal(JSON.stringify(story), snapshot, 'viewing cannot alter authority state');
});

test('ending displays the projected causal sequence and aftermath before the original evidence archive', () => {
  const gameState = { unlocked_clues: ['c_03'], revealed_clues: knownClues };
  for (language of ['zh', 'en']) {
    const markup = render(review.default, { gameState, investigation: { story } });
    const sequence = markup.indexOf(story.resolution.sequence[0].body[language]);
    const aftermath = markup.indexOf(story.resolution.aftermath[0].body[language]);
    const archive = markup.indexOf(language === 'zh' ? '回看原始证据' : 'Review source evidence');
    assert.ok(sequence >= 0 && sequence < aftermath && aftermath < archive);
    assert.equal(markup.includes('unknown'), false, 'unknown evidence IDs are not turned into a guessed reference');
    assert.equal(markup.includes(story.focus[language]), false, 'ending does not repeat an obsolete live objective');
    assert.doesNotMatch(markup, /<form|<button|datetime=/);
  }
});

test('legacy and unfinished stories receive no invented resolution or hidden material', () => {
  assert.equal(render(panel.default, {}), '');
  assert.equal(render(panel.default, { story: { ...story, resolution: null }, mode: 'resolution' }), '');
  const markup = render(panel.default, { story: { stage: 'opening', focus: '<script>not markup</script>', milestones: [] }, lang: 'en' });
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>|Event order|unknown/);
  const legacy = render(review.default, { gameState: {} });
  assert.equal(legacy.includes('td-case-story'), false);
  assert.ok(legacy.includes(language === 'zh' ? '本局没有已保全的证据' : 'No evidence was secured'));
});

test('authoritative story stages override clue-percentage heuristics while legacy boundaries remain compatible', () => {
  const richState = { turn_count: 10, unlocked_clues: Case_Data_Lvl_01.clue_dictionary.map(clue => clue.clue_id), current_zone: 'zone_datacenter' };
  const emptyState = { turn_count: 0, unlocked_clues: [], current_zone: 'zone_datacenter' };
  assert.equal(theaterNarrativeStage(richState, Case_Data_Lvl_01, { story: { ...story, stage: 'opening' } }), 'opening');
  assert.equal(theaterNarrativeStage(emptyState, Case_Data_Lvl_01, { story: { ...story, stage: 'convergence' } }), 'convergence');
  assert.equal(theaterNarrativeStage(richState, Case_Data_Lvl_01), 'convergence');
  assert.equal(theaterNarrativeStage(emptyState, Case_Data_Lvl_01), 'opening');
  assert.equal(theaterNarrativeStage(richState, Case_Data_Lvl_01, { story: { stage: 'invalid' } }), 'opening', 'an unknown projected stage cannot promote itself through clue counts');
  for (const lang of ['zh', 'en']) {
    const context = buildPublicCaseContext({ gameState: richState, caseData: Case_Data_Lvl_01, investigation: { story: { ...story, stage: 'opening' } }, lang });
    assert.equal(context.stage, 'opening');
    assert.equal(context.objective, story.focus[lang]);
    assert.ok(context.narrative.includes(story.milestones[0].body[lang]));
    assert.equal(context.aftermath, null, 'new projected narratives do not invent a generic previous action');
    assert.equal(context.narrative.includes(story.resolution.sequence[0].body[lang]), false);
  }
});

test('actual field and interview owners pass the same authority story rather than rebuilding future events', () => {
  const field = readFileSync(new URL('../src/components/game/investigation/InvestigationFieldPanel.jsx', import.meta.url), 'utf8');
  assert.match(field, /<CaseStoryPanel story=\{investigation\.story\}/);
  const owner = readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8');
  assert.match(owner, /theaterNarrativeStage\(nextGameState, caseData, run\.investigation\)/);
  assert.match(owner, /theaterNarrativeStage\(response\.run\.state, caseData, response\.run\.investigation\)/);
  assert.match(owner, /buildPublicCaseContext\(\{ gameState, caseData, investigation, lang \}\)/);
  assert.match(owner, /currentGoal: investigationV2 \? investigation\?\.current_goal : publicCaseContext\?\.objective/);
  const css = readFileSync(new URL('../src/components/game/investigation/caseStory.css', import.meta.url), 'utf8');
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /position:\s*(fixed|absolute)|animation:/);
});
