import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as stamina from '../src/game/agentStamina.js';
import { getRejectedReportPenalty } from '../src/game/caseEvaluation.js';
import { REPORT_DIMENSIONS, reportEvidenceIds } from '../src/game/investigationChoices.js';

let language = 'zh';
const source = readFileSync(new URL('../src/components/game/investigation/TerminalPanels.jsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} });
const imports = {
  react: React,
  '@/lib/lang.jsx': { useLang: () => ({ lang: language, t: {} }) },
  '@/components/game/theater/NPCStatement': { default: () => null },
  '@/components/game/InterrogationHints': { EmotionBadge: () => null },
  '@/components/game/AgentStaminaMeter': { default: () => null },
  '@/components/ui/Icon': { default: () => null, IconText: ({ text }) => text },
  '@/components/ui/palette': { noirColor: value => value },
  '@/game/agentStamina': stamina,
  '@/game/caseEvaluation': { getRejectedReportPenalty },
  '@/game/investigationChoices.js': { REPORT_DIMENSIONS, reportEvidenceIds },
  './EvidenceReference': { default: ({ clue, sourceLabel, expertNote }) => clue ? React.createElement('details', null,
    React.createElement('summary', null, clue.keyword), React.createElement('p', null, clue.description), sourceLabel, expertNote) : null },
  './EvidenceReportExplanation.jsx': { default: () => null, EvidenceRoleDisclosure: () => null },
  './InterviewHistory.jsx': { default: () => null },
};
function loadPanels(react = React) {
  const panels = {};
  compileFunction(outputText, ['require', 'exports', 'React'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected import ${id}`);
    return id === 'react' ? react : imports[id];
  }, panels, React);
  return panels;
}
const panels = loadPanels();

test('new interview cards disclose free background, the recorded-account credit and actual confusion before selection', () => {
  for (language of ['zh', 'en']) {
    const question = { questionId: 'firm', text: 'Record this account', tone: 'firm', available: true,
      ap_cost: 1, stamina_cost: 10, turn_cost: 1, confusion_cost: 1, effect: 'Paid AP covers the later comparison.' };
    const props = { npc: { npc_id: 'npc_01', name: 'Witness' }, dialogue: [], team: [{ agent_id: 'A', stamina: 50 }],
      executorId: 'A', packs: { A: { questions: [question] } }, investigationVersion: 2,
      investigation: { interview_revision: 1 }, actionPoints: 20 };
    const markup = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, props));
    assert.ok(markup.includes(language === 'zh' ? '了解背景免费' : 'Background is free'));
    assert.ok(markup.includes(question.effect));
    assert.ok(markup.includes(language === 'zh' ? '混乱 +1' : 'Confusion +1'));
    assert.ok(markup.includes(language === 'zh' ? '推进 1 回合' : 'Advances 1 turn'));
    const questionTag = [...markup.matchAll(/<button[^>]*>/g)].map(match => match[0])
      .find(tag => tag.includes('aria-label="Record this account'));
    const descriptionId = questionTag?.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(descriptionId, 'the focused question must expose its effect and risk as an accessible description');
    const descriptions = [...markup.matchAll(/<small\b([^>]*)>([\s\S]*?)<\/small>/g)];
    const description = descriptions.find(match => match[1].includes(`id="${descriptionId}"`))?.[2];
    assert.ok(description?.includes(question.effect), 'the description must include the account-credit effect');
    assert.ok(description.includes(language === 'zh' ? '推进 1 回合' : 'Advances 1 turn'));
    assert.ok(description.includes(language === 'zh' ? '混乱 +1' : 'Confusion +1'));
    assert.ok(questionTag.includes('1 AP'), 'costs remain in the concise accessible name');
    assert.doesNotMatch(markup, /温和询问和明确追问可获得解释|Gentle and direct questions provide explanations/);
    const older = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, { ...props, investigation: {} }));
    assert.equal(older.includes(question.effect), false);
    assert.doesNotMatch(older, /aria-describedby=/, 'legacy questions must not reference an absent strategy description');
  }
});

test('discounted manual interview quotes remain usable below the legacy ten-point stamina threshold', () => {
  for (language of ['zh', 'en']) {
    const questions = [
      { questionId: 'gentle', text: 'Base question', ap_cost: 1, stamina_cost: 10, available: false },
      { questionId: 'evidence', text: 'Discounted evidence', ap_cost: 1, stamina_cost: 6,
        skill_stamina_discount: 4, available: true },
    ];
    const props = { npc: { npc_id: 'npc_01', name: 'Witness' }, dialogue: [],
      team: [{ agent_id: 'LOW', stamina: 2 }], executorId: 'LOW', packs: { LOW: { questions } },
      investigationVersion: 2, actionPoints: 1 };
    const markup = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, props));
    const tags = [...markup.matchAll(/<button[^>]*>/g)].map(match => match[0]);
    assert.equal(tags.find(tag => tag.includes('aria-pressed="true"')).includes('disabled'), false);
    assert.equal(tags.find(tag => tag.includes('aria-label="Discounted evidence')).includes('disabled'), false);
    assert.equal(tags.find(tag => tag.includes('aria-label="Base question')).includes('disabled'), true);
    assert.ok(markup.includes(language === 'zh' ? '已计入报价' : 'already included in the quote'));
    const noAP = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, { ...props, actionPoints: 0 }));
    assert.match(noAP, /<button[^>]*disabled=""[^>]*aria-label="Discounted evidence/);
    const legacy = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, { ...props, investigationVersion: 1 }));
    assert.match(legacy, /<button[^>]*disabled=""[^>]*aria-label="Discounted evidence/);
  }
});

test('report discloses the current rejection cost before submission in both languages and keeps legacy guidance', () => {
  const options = Object.fromEntries(['conclusions', 'methods', 'motives', 'timelines'].map(key => [key, []]));
  const props = { options, value: {}, onChange() {}, onSubmit() {}, onCancel() {}, investigationVersion: 2 };
  for (language of ['zh', 'en']) {
    for (const ap of [20, 5, 0]) {
      const markup = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, { ...props, actionPoints: ap }));
      const penalty = getRejectedReportPenalty({ action_points_left: ap });
      const expected = language === 'zh' ? `驳回：${penalty.apLoss} AP` : `Rejected: ${penalty.apLoss} AP`;
      assert.ok(markup.includes(expected), `AP ${ap}/${language} must use the same formula as the authority`);
      assert.ok(markup.indexOf(expected) < markup.indexOf('<select'), 'mobile players must see the report risk before selecting conclusions');
      assert.ok(markup.indexOf(expected) < markup.indexOf(language === 'zh' ? '提交结案报告' : 'SUBMIT CASE REPORT'));
      assert.match(markup, /aria-label="(?:核心结论|CORE CONCLUSION)"/);
      assert.match(markup, /aria-label="(?:关键时间线|KEY TIMELINE)"/);
    }
    const legacy = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, { ...props, investigationVersion: 1 }));
    assert.equal(legacy.includes(language === 'zh' ? '首次错误指控' : 'First unsupported accusations'), false);
  }
});

test('interrogator selection exposes the active agent and explains turn recovery without a paid action', () => {
  const selected = 'CIPHER-47';
  const team = [{ agent_id: 'NEXUS-01', stamina: 50 }, { agent_id: selected, stamina: 50 }];
  const packs = Object.fromEntries(team.map(agent => [agent.agent_id, { questions: [] }]));
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, {
      npc: { npc_id: 'npc_01', name: 'Witness' }, dialogue: [], packs, team,
      executorId: selected, investigationVersion: 2, accentColor: '#fff',
    }));
    assert.match(markup, /aria-pressed="true"[^>]*><strong>CIPHER-47/);
    assert.match(markup, /aria-pressed="false"[^>]*><strong>NEXUS-01/);
    assert.ok(markup.includes(language === 'zh' ? '全队先恢复 4%' : 'the team first recovers 4%'));
  }
});

test('report explains each evidence role before selection without requiring a rejected submission', () => {
  for (language of ['zh', 'en']) {
    const guidance = Object.fromEntries(REPORT_DIMENSIONS.map(key => [key,
      language === 'zh' ? `${key}：请证明这个环节的完整支持链。` : `${key}: establish the complete support chain for this dimension.`,
    ]));
    const options = {
      ...Object.fromEntries(['conclusions', 'methods', 'motives', 'timelines'].map(key => [key, []])),
      availableEvidence: [{ id: 'discovered-record', label: 'Discovered record' }],
      dimension_guidance: guidance,
    };
    const props = { options, value: {}, onChange() {}, onSubmit() {}, onCancel() {}, investigationVersion: 2 };
    const markup = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, props));
    const groups = [...markup.matchAll(/<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/g)].map(match => match[1]);
    assert.equal(groups.length, REPORT_DIMENSIONS.length);
    REPORT_DIMENSIONS.forEach((key, index) => {
      assert.ok(groups[index].includes(guidance[key]), `${key}/${language} must explain the evidence role before the first report`);
      assert.ok(groups[index].indexOf(guidance[key]) < groups[index].indexOf('<button'));
    });
    const legacy = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, { ...props, investigationVersion: 1 }));
    for (const text of Object.values(guidance)) assert.equal(legacy.includes(text), false);
    const withoutGuidance = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, {
      ...props, options: { ...options, dimension_guidance: undefined },
    }));
    assert.match(withoutGuidance, /Discovered record/);
    assert.doesNotMatch(withoutGuidance, /undefined|\[object Object\]/);
  }
});

test('balanced reports disclose attachment correction allowance and both authoritative penalties before conclusions', () => {
  for (language of ['zh', 'en']) {
    for (const available of [true, false]) {
      const options = {
        ...Object.fromEntries(['conclusions', 'methods', 'motives', 'timelines'].map(key => [key, []])),
        report_policy: {
          balance_revision: 2, evidence_correction_available: available,
          evidence_rejection_penalty: available ? { apLoss: 0, reputationLoss: 0, confusionIncrease: 0 } : { apLoss: 1, reputationLoss: 8, confusionIncrease: 4 },
          evidence_rejection_penalty_after_correction: { apLoss: 1, reputationLoss: 8, confusionIncrease: 4 },
          conclusion_rejection_penalty: { apLoss: 3, reputationLoss: 9, confusionIncrease: 6 },
        },
      };
      const props = { options, value: {}, onChange() {}, onSubmit() {}, onCancel() {}, investigationVersion: 2 };
      const markup = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, props));
      const allowance = language === 'zh'
        ? available ? '免费补正剩余 1 次' : '免费补正剩余 0 次'
        : available ? 'Free correction remaining: 1' : 'Free correction remaining: 0';
      assert.ok(markup.includes(allowance));
      assert.ok(markup.includes(language === 'zh' ? '四项结论均正确、仅附件不足' : 'all four conclusions are correct and only attachments are insufficient'));
      const evidencePenalty = language === 'zh' ? '1 AP、信誉 −8、混乱 +4%' : '1 AP, reputation −8, confusion +4%';
      const conclusionPenalty = language === 'zh' ? '3 AP、信誉 −9、混乱 +6%' : '3 AP, reputation −9, confusion +6%';
      for (const cost of [evidencePenalty, conclusionPenalty]) {
        assert.ok(markup.includes(cost));
        assert.ok(markup.indexOf(cost) < markup.indexOf('<select'));
      }
      assert.ok(markup.includes(language === 'zh' ? '首次错误指控' : 'First unsupported accusations'));
      const legacy = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, { ...props, investigationVersion: 1 }));
      assert.equal(legacy.includes(allowance), false);
    }
  }
});

function descendants(root, predicate) {
  const found = [];
  const visit = node => {
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    React.Children.forEach(node.props.children, visit);
  };
  visit(root);
  return found;
}

test('report evidence editors open one group, preserve edits across collapse, and reuse evidence without automatic attachments', () => {
  const states = [];
  let cursor = 0;
  const interactive = loadPanels({ ...React,
    useId: () => 'report-interaction',
    useMemo: callback => callback(),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
  });
  language = 'en';
  const props = {
    investigationVersion: 2,
    options: {
      availableEvidence: [{ id: 'a', label: 'Known access record' }, { id: 'b', label: 'Known sample' }],
      dimension_guidance: Object.fromEntries(REPORT_DIMENSIONS.map(key => [key, `Public guidance for ${key}`])),
    },
    value: { evidenceByDimension: { opportunity: ['a'] }, evidenceIds: ['a'] },
    onChange(next) { props.value = next; }, onSubmit() {}, onCancel() {},
  };
  const render = () => { cursor = 0; return interactive.StructuredReportPanel(props); };
  const groups = tree => descendants(tree, node => node.type === 'fieldset');
  const toggle = group => descendants(group, node => node.type === 'button' && Object.hasOwn(node.props, 'aria-expanded'))[0];
  const editor = group => descendants(group, node => node.type === 'div' && String(node.props.className).includes('td-evidence-options'))[0];
  const evidence = (group, id) => descendants(group, node => node.type === 'div' && node.key === id)
    .flatMap(row => descendants(row, node => node.type === 'button' && 'aria-pressed' in node.props))[0];
  let tree = render();
  assert.deepEqual(groups(tree).map(group => toggle(group).props['aria-expanded']), [false, true, false, false], 'first empty dimension opens by default');
  assert.deepEqual(props.value.evidenceByDimension, { opportunity: ['a'] }, 'opening a report must never attach evidence');
  for (const [index, group] of groups(tree).entries()) {
    const button = toggle(group);
    assert.equal(button.type, 'button');
    assert.equal(button.props.type, 'button', 'native buttons provide keyboard and touch activation');
    assert.equal(button.props['aria-controls'], editor(group).props.id);
    assert.equal(editor(group).props.hidden, index !== 1);
    assert.ok(renderToStaticMarkup(group).includes(`Public guidance for ${REPORT_DIMENSIONS[index]}`));
  }
  evidence(groups(tree)[1], 'a').props.onClick();
  tree = render();
  assert.deepEqual(props.value.evidenceByDimension, { opportunity: ['a'], method: ['a'] }, 'the same clue may support different roles');
  assert.deepEqual(props.value.evidenceIds, ['a'], 'flattened report attachments remain unique');
  assert.equal(evidence(groups(tree)[1], 'a').props['aria-pressed'], true);
  toggle(groups(tree)[1]).props.onClick();
  tree = render();
  assert.ok(groups(tree).every(group => editor(group).props.hidden));
  assert.ok(renderToStaticMarkup(groups(tree)[1]).includes('Known access record'), 'selected names stay visible when collapsed');
  assert.ok(renderToStaticMarkup(groups(tree)[1]).includes('Selected: 1'));
  toggle(groups(tree)[3]).props.onClick();
  tree = render();
  assert.deepEqual(groups(tree).map(group => toggle(group).props['aria-expanded']), [false, false, false, true]);
  evidence(groups(tree)[3], 'b').props.onClick();
  tree = render();
  toggle(groups(tree)[1]).props.onClick();
  tree = render();
  evidence(groups(tree)[1], 'a').props.onClick();
  tree = render();
  assert.deepEqual(props.value.evidenceByDimension, { opportunity: ['a'], method: [], timeline: ['b'] });
  assert.deepEqual(props.value.evidenceIds, ['a', 'b']);
  assert.equal(evidence(groups(tree)[0], 'a').props['aria-pressed'], true, 'removing from one dimension preserves another');
  assert.equal(evidence(groups(tree)[3], 'b').props['aria-pressed'], true, 'switching editors preserves previous edits');
  const legacy = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, { ...props, investigationVersion: 1 }));
  assert.doesNotMatch(legacy, /aria-expanded|td-evidence-options/);
  assert.match(legacy, /SUPPORTING EVIDENCE/);
});

test('a fully attached report keeps bilingual evidence summaries visible with no editor open', () => {
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(panels.StructuredReportPanel, {
      investigationVersion: 2, isProcessing: true,
      options: { availableEvidence: [{ id: 'known', label: 'Visible record' }] },
      value: { evidenceByDimension: Object.fromEntries(REPORT_DIMENSIONS.map(key => [key, ['known']])) },
      onChange() {}, onSubmit() {}, onCancel() {},
    }));
    assert.equal([...markup.matchAll(/aria-expanded="false"/g)].length, 4);
    assert.equal([...markup.matchAll(/class="td-evidence-options" hidden=""/g)].length, 4);
    assert.equal([...markup.matchAll(/class="td-evidence-selection"/g)].length, 4);
    assert.equal(markup.includes(language === 'zh' ? '已选 1 条' : 'Selected: 1'), true);
    assert.equal([...markup.matchAll(/class="td-evidence-edit-toggle"[^>]*disabled=""/g)].length, 4);
  }
});

test('interrogation explains ordinary strategy limits before the paid choices in both languages', () => {
  for (language of ['zh', 'en']) {
    const props = {
      npc: { npc_id: 'npc_01', name: 'Witness' }, dialogue: [], team: [{ agent_id: 'A', stamina: 50 }],
      executorId: 'A', packs: { A: { questions: [{ questionId: 'q', text: 'Known topic', ap_cost: 1, stamina_cost: 10, available: true }] } },
      investigationVersion: 2, actionPoints: 20,
    };
    const markup = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, props));
    const explanation = language === 'zh' ? '温和询问和明确追问可获得解释，但不保证推进关键证词' : 'Gentle and direct questions provide explanations but do not guarantee progress on key testimony';
    assert.ok(markup.includes(explanation));
    assert.ok(markup.indexOf(explanation) < markup.indexOf('Known topic'));
    const legacy = renderToStaticMarkup(React.createElement(panels.NPCDialogBox, { ...props, investigationVersion: 1 }));
    assert.equal(legacy.includes(explanation), false);
  }
});

function reportSearchInteraction(props) {
  const states = [];
  let cursor = 0;
  const interactive = loadPanels({ ...React,
    useId: () => 'report-search-interaction',
    useMemo: callback => callback(),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
  });
  const render = () => { cursor = 0; return interactive.StructuredReportPanel(props); };
  return { render, search(query) {
    const input = descendants(render(), node => node.type === 'input' && node.props.type === 'search')[0];
    assert.ok(input, 'report must expose its evidence search');
    input.props.onChange({ target: { value: query } });
    return render();
  } };
}

function reportSearchFixture() {
  const zh = language === 'zh';
  const changes = [];
  const props = {
    investigationVersion: 2,
    options: { availableEvidence: [
      { id: 'access', label: zh ? '门禁原始记录' : 'Original access record' },
      { id: 'sample', label: zh ? '现场样本' : 'Scene sample' },
    ] },
    knownClues: [
      { clue_id: 'access', keyword: zh ? '门禁原始记录' : 'Original access record',
        description: zh ? '硬件签章逐行保存。\n第二行保留原始时间。' : 'Hardware signatures are retained line by line.\nThe second line keeps the original time.' },
      { clue_id: 'sample', keyword: zh ? '现场样本' : 'Scene sample',
        description: zh ? '磨屑已放入独立的密封袋。' : 'The shavings are held in a separate sealed bag.' },
      { clue_id: 'outside-offer', keyword: 'OUTSIDE_OFFER_NAME', description: 'OUTSIDE_OFFER_DESCRIPTION' },
    ],
    evidenceSources: { access: zh ? '北门读卡器' : 'North gate reader', sample: zh ? '维修平台' : 'Maintenance platform',
      'outside-offer': 'OUTSIDE_OFFER_SOURCE' },
    expertNotes: { access: zh ? '按签章分组核对。' : 'Cross-check events by signature.', 'outside-offer': 'OUTSIDE_OFFER_EXPERT_NOTE' },
    value: { evidenceIds: ['access'], evidenceByDimension: { opportunity: ['access'] } },
    onChange(next) { changes.push(next); props.value = next; }, onSubmit() {}, onCancel() {},
  };
  return { props, changes };
}
const reportRows = tree => descendants(tree, node => node.type === 'div' && node.props.className === 'td-report-evidence-record');
const reportGroups = tree => descendants(tree, node => node.type === 'fieldset');

test('report body and source searches filter visible choices while preserving selected attachments through clearing', () => {
  for (language of ['zh', 'en']) {
    const { props, changes } = reportSearchFixture();
    const initialValue = props.value;
    const snapshot = JSON.stringify(props.value);
    const view = reportSearchInteraction(props);
    const rowsInFirstGroup = tree => reportRows(reportGroups(tree)[0]);
    let tree = view.search(language === 'zh' ? '独立的密封袋' : 'separate sealed bag');
    assert.deepEqual(rowsInFirstGroup(tree).map(row => row.key), ['sample'], 'full body text must be searchable without matching its title');
    assert.ok(renderToStaticMarkup(reportGroups(tree)[0]).includes(props.options.availableEvidence[0].label),
      'a filtered-out attachment must remain visible in the selected summary');
    tree = view.search(language === 'zh' ? '北门读卡器' : 'NORTH GATE READER');
    assert.deepEqual(rowsInFirstGroup(tree).map(row => row.key), ['access'], 'public source labels are searchable, ignoring case');
    tree = view.search('no-matching-public-record');
    assert.equal(reportRows(tree).length, 0);
    assert.ok(renderToStaticMarkup(tree).includes(language === 'zh' ? '没有匹配记录' : 'No matching records'));
    tree = view.search('');
    assert.deepEqual(rowsInFirstGroup(tree).map(row => row.key), ['access', 'sample']);
    const selectedButton = descendants(rowsInFirstGroup(tree)[0], node => node.type === 'button')[0];
    assert.equal(selectedButton.props['aria-pressed'], true, 'clearing the query must restore the selected choice');
    assert.strictEqual(props.value, initialValue);
    assert.equal(JSON.stringify(props.value), snapshot);
    assert.equal(changes.length, 0, 'searching must not rewrite a report draft or its dimension attachments');
  }
});

test('known records outside the authoritative report offer never enter attachment choices or full report references', () => {
  for (language of ['zh', 'en']) {
    const { props, changes } = reportSearchFixture();
    const view = reportSearchInteraction(props);
    let tree = view.render();
    const markup = renderToStaticMarkup(tree);
    assert.doesNotMatch(markup, /OUTSIDE_OFFER_NAME|OUTSIDE_OFFER_DESCRIPTION|OUTSIDE_OFFER_SOURCE|OUTSIDE_OFFER_EXPERT_NOTE/);
    assert.ok(reportRows(tree).every(row => ['access', 'sample'].includes(row.key)));
    tree = view.search('OUTSIDE_OFFER_DESCRIPTION');
    assert.equal(reportRows(tree).length, 0, 'a full-text query must not widen the server-provided attachment offer');
    assert.doesNotMatch(renderToStaticMarkup(tree), /OUTSIDE_OFFER_NAME|OUTSIDE_OFFER_SOURCE|OUTSIDE_OFFER_EXPERT_NOTE/);
    assert.equal(changes.length, 0);
    assert.deepEqual(props.value.evidenceByDimension, { opportunity: ['access'] });
  }
});

test('reading a full report reference cannot bubble into its separate attachment action', () => {
  for (language of ['zh', 'en']) {
    const { props, changes } = reportSearchFixture();
    const snapshot = JSON.stringify(props.value);
    const view = reportSearchInteraction(props);
    const tree = view.render();
    const group = reportGroups(tree)[1];
    const editor = descendants(group, node => node.type === 'div' && node.props.className === 'td-evidence-options')[0];
    assert.equal(editor.props.hidden, false, 'the first empty dimension is available for the readback interaction');
    const row = reportRows(editor).find(node => node.key === 'access');
    const attachmentButton = descendants(row, node => node.type === 'button')[0];
    const referenceElement = React.Children.toArray(row.props.children).find(node => typeof node.type === 'function');
    assert.ok(referenceElement, 'every offered known record must have a separate full reference');
    const details = referenceElement.type(referenceElement.props);
    const summary = descendants(details, node => node.type === 'summary')[0];
    assert.equal(details.type, 'details');
    assert.ok(summary);
    assert.equal(descendants(details, node => node.type === 'button').length, 0, 'the reference must not contain the attachment toggle');
    const markup = renderToStaticMarkup(details);
    assert.ok(markup.includes(props.knownClues[0].description));
    assert.ok(markup.includes(props.evidenceSources.access));
    assert.ok(markup.includes(props.expertNotes.access));
    // Native summary expansion bubbles a click through its ancestors. Exercise
    // any actual ancestor handler to catch accidental attach-on-read wiring.
    for (const node of [summary, details, row, editor, group, tree]) {
      if (typeof node.props.onClick === 'function') node.props.onClick({ target: summary, currentTarget: node });
    }
    assert.equal(changes.length, 0);
    assert.equal(JSON.stringify(props.value), snapshot);
    attachmentButton.props.onClick();
    assert.equal(changes.length, 1, 'the harness must still detect the explicit attachment action');
    assert.deepEqual(props.value.evidenceByDimension, { opportunity: ['access'], method: ['access'] });
  }
});
