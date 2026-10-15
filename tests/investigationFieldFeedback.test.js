import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { AGENT_STAMINA_RECOVERY_PER_TURN, AGENT_STAMINA_INVESTIGATION_COST } from '../src/game/agentStamina.js';

const source = readFileSync(new URL('../src/components/game/investigation/InvestigationFieldPanel.jsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('InvestigationFieldPanel.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function component(name) {
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  const { outputText } = ts.transpileModule(`const result = (${declaration.getText().replace(/^export\s+/, '')});`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  return compileFunction(`${outputText}\nreturn result;`, ['React', 'text', 'AGENT_STAMINA_RECOVERY_PER_TURN', 'AGENT_STAMINA_INVESTIGATION_COST'])(
    React, localizedInvestigationText, AGENT_STAMINA_RECOVERY_PER_TURN, AGENT_STAMINA_INVESTIGATION_COST);
}
const InspectionFeedback = component('InspectionFeedback');
const InvestigationActionGuidance = component('InvestigationActionGuidance');

test('inspection feedback renders the finding, professional observation and efficiency together in either language', () => {
  const feedback = {
    narration: { zh: '硬件签章与权限名称不一致。', en: 'Hardware signatures differ despite matching permissions.' },
    expert_note: { zh: '按原始硬件签章分别保存读卡事件。', en: 'Preserve access events by their original hardware signature.' },
    detail: { zh: '专业效率免除了行动点费用。', en: 'Specialist efficiency avoided AP cost.' },
  };
  for (const lang of ['zh', 'en']) {
    const rendered = renderToStaticMarkup(React.createElement(InspectionFeedback, { feedback, lang }));
    for (const key of ['narration', 'expert_note', 'detail']) assert.ok(rendered.includes(feedback[key][lang]), `${lang}/${key} must remain visible`);
    assert.ok(rendered.includes('role="status"'));
    assert.ok(rendered.includes(lang === 'zh' ? '专业观察：' : 'Professional observation:'));
    assert.equal(rendered.includes(feedback.expert_note[lang === 'zh' ? 'en' : 'zh']), false);
  }
});

test('plain findings and efficiency-only feedback remain useful without inventing a professional observation', () => {
  assert.equal(renderToStaticMarkup(React.createElement(InspectionFeedback, { feedback: null, lang: 'en' })), '');
  const plain = renderToStaticMarkup(React.createElement(InspectionFeedback, { feedback: { narration: 'Confirmed finding.' }, lang: 'en' }));
  assert.ok(plain.includes('Confirmed finding.'));
  assert.equal(plain.includes('Professional observation:'), false);
  const efficiency = renderToStaticMarkup(React.createElement(InspectionFeedback, { feedback: { detail: 'No extra AP was charged.' }, lang: 'en' }));
  assert.ok(efficiency.includes('No extra AP was charged.'));
  assert.equal(efficiency.includes('undefined'), false);
});

test('inspection and reconstruction warnings quote authoritative failure costs and allow retry in both languages', () => {
  for (const lang of ['zh', 'en']) {
    const costRules = { unsuccessful_inspection_confusion: 7, unsuccessful_reconstruction_confusion: 9 };
    const inspect = renderToStaticMarkup(React.createElement(InvestigationActionGuidance, { action: 'inspection', costRules, lang }));
    assert.match(inspect, /7%/);
    assert.match(inspect, lang === 'zh' ? /所示 AP、体力并推进一回合/ : /displayed AP and stamina, advances one turn/);
    assert.match(inspect, lang === 'zh' ? /稳定取得对应证据/ : /reliably secures the evidence/);
    assert.match(inspect, lang === 'zh' ? /重试/ : /retry/);
    const puzzle = renderToStaticMarkup(React.createElement(InvestigationActionGuidance, { action: 'reconstruction', costRules, lang,
      executorId: 'CIPHER-47', apCost: 1, staminaCost: 10 }));
    assert.match(puzzle, /9%/);
    assert.match(puzzle, /1 AP/);
    assert.match(puzzle, /CIPHER-47/);
    assert.match(puzzle, /4%/);
    assert.match(puzzle, /10%/);
    assert.match(puzzle, lang === 'zh' ? /推进一回合/ : /advances one turn/);
    assert.match(puzzle, lang === 'zh' ? /重试/ : /retry/);
    const legacy = renderToStaticMarkup(React.createElement(InvestigationActionGuidance, { action: 'inspection', lang }));
    assert.match(legacy, /3%/);
  }
});

test('optional evidence guidance explains C/B closure without promising a grade and completed review carries no failure charge', () => {
  for (const lang of ['zh', 'en']) {
    const optional = renderToStaticMarkup(React.createElement(InvestigationActionGuidance, { action: 'inspection', hidden: true, lang }));
    assert.match(optional, /C\/B/);
    assert.match(optional, lang === 'zh' ? /可选旁证/ : /Optional corroboration/);
    assert.match(optional, lang === 'zh' ? /更高评价/ : /higher grade/);
    assert.equal(optional.includes('S'), false);
    for (const action of ['inspection', 'reconstruction']) {
      const review = renderToStaticMarkup(React.createElement(InvestigationActionGuidance, { action, completed: true, lang }));
      assert.match(review, lang === 'zh' ? /复查免费，不推进回合/ : /Review is free and does not advance a turn/);
      assert.equal(review.includes('AP'), false);
      assert.equal(review.includes('%'), false);
      assert.equal(review.includes(lang === 'zh' ? '可选旁证' : 'Optional corroboration'), false);
    }
  }
});

test('reconstruction explains insufficient stamina without implying its observation costs AP', () => {
  for (const lang of ['zh', 'en']) {
    const rendered = renderToStaticMarkup(React.createElement(InvestigationActionGuidance, {
      action: 'reconstruction', executorId: null, apCost: 1, staminaCost: 10, lang,
    }));
    assert.match(rendered, lang === 'zh' ? /暂无体力充足的执行探员/ : /No investigator has enough stamina/);
    assert.match(rendered, lang === 'zh' ? /仍可免费查看核验材料/ : /reviewing the reconstruction materials remains free/);
    assert.match(rendered, /1 AP/);
  }
});
