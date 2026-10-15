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
  const evidence = (group, id) => descendants(group, node => node.type === 'button' && node.key === id)[0];
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
