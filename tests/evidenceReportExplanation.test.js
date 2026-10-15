import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as choices from '../src/game/investigationChoices.js';
import { getRejectedReportPenalty } from '../src/game/caseEvaluation.js';
import { buildInvestigationReconstruction } from '../src/game/investigationReconstruction.js';

let language = 'zh';
function load(name, overrides = {}) {
  const source = readFileSync(new URL(`../src/components/game/investigation/${name}.jsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const imports = { react: { ...React, default: React },
    '@/lib/lang.jsx': { useLang: () => ({ lang: language, t: { reportRejectedTag: 'Rejected', caseClosedTag: 'Accepted' } }) },
    '@/game/investigationChoices.js': choices, ...overrides };
  const exports = {};
  compileFunction(outputText, ['require', 'exports', 'React'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected report explanation dependency ${id}`);
    return imports[id];
  }, exports, React);
  return exports;
}
const references = load('EvidenceReference', { './evidenceArchive.css': {} });
const explanation = load('EvidenceReportExplanation', {
  './EvidenceReference.jsx': references, './evidenceReportExplanation.css': {},
});
const panels = load('TerminalPanels', {
  '@/components/game/theater/NPCStatement': { default: () => null },
  '@/components/game/InterrogationHints': { EmotionBadge: () => null },
  '@/components/game/AgentStaminaMeter': { default: () => null },
  '@/components/ui/Icon': { default: () => null, IconText: ({ text }) => text },
  '@/components/ui/palette': { noirColor: value => value },
  '@/game/agentStamina': {}, '@/game/caseEvaluation': { getRejectedReportPenalty },
  './EvidenceReference': references, './EvidenceReportExplanation.jsx': explanation,
  './InterviewHistory.jsx': { default: () => null },
});
const ending = load('CaseReconstruction', {
  '@/game/investigationReconstruction.js': { buildInvestigationReconstruction },
  './EvidenceReference.jsx': references, './CaseStoryPanel.jsx': { default: () => null },
  './EvidenceReportExplanation.jsx': explanation, './caseReconstruction.css': {},
}).default;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const t = (zh, en) => ({ zh, en });
const knownClues = [
  { clue_id: 'access', keyword: t('门禁原件', 'Original access record'), description: t('原件保留两组签章。', 'The original contains two signatures.') },
  { clue_id: 'sample', keyword: t('现场样本', 'Scene sample'), description: t('样本来自密封容器。', 'The sample came from a sealed container.') },
];
const evidenceRoles = [
  { clue_id: 'access', roles: [{ dimension: 'opportunity', explanation: t('签章区分权限与实物卡。', 'Signatures distinguish permission from the physical badge.') }] },
  { clue_id: 'sample', roles: [{ dimension: 'method', explanation: t('样本检验物理过程。', 'The sample tests the physical mechanism.') }] },
];
const review = { dimensions: [
  { dimension: 'opportunity', used_evidence_ids: ['access', 'secret', 'access'], context_evidence_ids: ['sample', 'access', 'secret'],
    explanation: t('这些附件构成可核对的到场支持链，所选结论另行校验。', 'These attachments form a verifiable presence chain; selected conclusions are checked separately.') },
  { dimension: 'method', used_evidence_ids: [], context_evidence_ids: ['sample'],
    explanation: t('样本说明测量范围，不能独自构成完整手段链。', 'The sample describes a measurement scope, not a complete mechanism chain by itself.') },
  { dimension: 'invalid', used_evidence_ids: [], context_evidence_ids: [], explanation: 'DO NOT RENDER UNKNOWN DIMENSION' },
] };

test('material roles describe only the current dimension and use native disclosure without changing attachments', () => {
  const snapshot = JSON.stringify(evidenceRoles);
  for (language of ['zh', 'en']) {
    const markup = render(explanation.EvidenceRoleDisclosure, { entry: evidenceRoles[0], dimension: 'opportunity', label: 'Access', lang: language });
    assert.ok(markup.includes(evidenceRoles[0].roles[0].explanation[language]));
    assert.match(markup, /<details[^>]*><summary>/);
    assert.doesNotMatch(markup, /<button|<form|checked=|autofocus|aria-modal/);
    const unrelated = render(explanation.EvidenceRoleDisclosure, { entry: evidenceRoles[0], dimension: 'method', label: 'Access', lang: language });
    assert.ok(unrelated.includes(language === 'zh' ? '作为背景' : 'may remain as context'));
    assert.equal(unrelated.includes(evidenceRoles[0].roles[0].explanation[language]), false);
  }
  assert.equal(render(explanation.EvidenceRoleDisclosure, {}), '');
  assert.equal(render(explanation.EvidenceRoleDisclosure, { entry: evidenceRoles[0], dimension: 'invalid' }), '');
  assert.equal(JSON.stringify(evidenceRoles), snapshot);
});

test('a rejected submission explains actual supporting and context records without asserting the conclusions are correct', () => {
  const snapshot = JSON.stringify(review);
  for (language of ['zh', 'en']) {
    const markup = render(explanation.default, { review, knownClues, lang: language, isPassed: false });
    assert.ok(markup.includes(language === 'zh' ? '不代表所选结论已经成立' : 'does not establish that the selected conclusions are correct'));
    assert.ok(markup.includes(language === 'zh' ? '系统采用的支持依据' : 'Supporting records used'));
    assert.ok(markup.includes(language === 'zh' ? '保留的背景材料' : 'Context retained'));
    assert.ok(markup.includes(language === 'zh' ? '尚未形成完整支持链' : 'do not yet form a complete support chain'));
    assert.ok(markup.includes(review.dimensions[0].explanation[language]));
    assert.equal((markup.match(/class="td-evidence-reference"/g) || []).length, 3, 'deduplicate each group and do not list used records as context again');
    assert.doesNotMatch(markup, /secret|DO NOT RENDER|accepted report|<button|<form/);
  }
  assert.equal(JSON.stringify(review), snapshot);
});

test('accepted report review preserves extra material, escapes authority text and leaves old reports unchanged', () => {
  const markup = render(explanation.default, { review: { dimensions: [{ ...review.dimensions[0], explanation: '<script>unsafe()</script>' }] }, knownClues, lang: 'en', isPassed: true });
  assert.match(markup, /Extra attachments carry no penalty/);
  assert.match(markup, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.equal(render(explanation.default, {}), '');
  assert.equal(render(explanation.default, { review: { dimensions: [] } }), '');
});

test('actual report panel shows roles for selected groups and submission feedback without auto-filling choices or dispatching commands', () => {
  let changes = 0;
  let submissions = 0;
  const value = { evidenceIds: ['access'], evidenceByDimension: { opportunity: ['access'], method: ['access'] } };
  const snapshot = JSON.stringify(value);
  const props = { options: { availableEvidence: [{ id: 'access', label: 'Access' }, { id: 'sample', label: 'Sample' }], evidence_roles: evidenceRoles },
    value, knownClues, onChange() { changes++; }, onSubmit() { submissions++; }, onCancel() {},
    investigationVersion: 2, judgeResult: { is_passed: false, score: 'D', critique: 'Revise', evidence_review: review } };
  for (language of ['zh', 'en']) {
    const markup = render(panels.StructuredReportPanel, props);
    assert.ok(markup.includes(language === 'zh' ? '用途不等于证据链已完整' : 'A role does not mean the support chain is complete'));
    assert.equal((markup.match(/class="td-report-attached-roles"/g) || []).length, 4);
    assert.ok(markup.includes(evidenceRoles[0].roles[0].explanation[language]));
    assert.ok(markup.includes(language === 'zh' ? '不代表所选结论已经成立' : 'does not establish that the selected conclusions are correct'));
    assert.equal((markup.match(/<option value="" selected="">/g) || []).length, 4, 'no selected conclusion is invented');
    const legacy = render(panels.StructuredReportPanel, { ...props, investigationVersion: 1 });
    assert.doesNotMatch(legacy, /td-evidence-role|td-evidence-report-review/);
    const noFields = render(panels.StructuredReportPanel, { ...props, options: { availableEvidence: [] }, judgeResult: null });
    assert.doesNotMatch(noFields, /td-evidence-role|td-evidence-report-review/);
  }
  assert.equal(changes, 0);
  assert.equal(submissions, 0);
  assert.equal(JSON.stringify(value), snapshot);
});

test('actual ending passes the accepted attachment review before the source archive with only discovered references', () => {
  for (language of ['zh', 'en']) {
    const markup = render(ending, { gameState: { unlocked_clues: ['access', 'sample'], revealed_clues: knownClues },
      judgeResult: { is_passed: true, evidence_review: review } });
    const explained = markup.indexOf('td-evidence-report-review');
    const archive = markup.indexOf(language === 'zh' ? '回看原始证据' : 'Review source evidence');
    assert.ok(explained >= 0 && explained < archive);
    assert.doesNotMatch(markup, /secret|DO NOT RENDER/);
  }
  const owner = readFileSync(new URL('../src/components/game/GameOverScreen.jsx', import.meta.url), 'utf8');
  assert.match(owner, /<CaseReconstruction[^>]*judgeResult=\{judgeResult\}/);
  const css = readFileSync(new URL('../src/components/game/investigation/evidenceReportExplanation.css', import.meta.url), 'utf8');
  assert.match(css, /:focus-visible/);
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('ending distinguishes the paid fixed position from the later evidence-checked personal account', () => {
  const priorClaim = t('我没有离开值班室。', 'I never left the duty room.');
  const response = t('那段时间我确实经过走廊。', 'I did pass through the corridor then.');
  const investigation = { interview_revision: 1, testimony_stages: { witness: 1 }, testimony_records: {
    witness: [{ stage: 1, prior_claim: priorClaim, response, evidence_ids: ['access'] }],
  } };
  const props = { gameState: { unlocked_clues: ['access'], revealed_clues: knownClues },
    npcs: [{ npc_id: 'witness', name: 'Witness' }], investigation };
  for (language of ['zh', 'en']) {
    const markup = render(ending, props);
    assert.ok(markup.includes(language === 'zh' ? '对峙前固定说法' : 'Position before confrontation'));
    assert.ok(markup.includes(language === 'zh' ? '核对证据后的补充' : 'Follow-up after checking evidence'));
    assert.ok(markup.indexOf(priorClaim[language]) < markup.indexOf(response[language]));
    assert.ok(markup.includes(language === 'zh' ? '人物陈述' : 'Personal account'));
    const old = render(ending, { ...props, investigation: { ...investigation, interview_revision: undefined } });
    assert.equal(old.includes(priorClaim[language]), false, 'legacy records do not acquire a new fixed position');
  }
});
