import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createRun, applyRunCommand, publicRun } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';
import { Case_Data_Lvl_01 } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { getTerminalLinesForTurn, getTerminalTurns } from '../src/game/turnArchive.js';

const source = ts.createSourceFile('InvestigationTerminal.jsx',
  readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let emptyOutput;
const visit = node => {
  if (ts.isJsxExpression(node) && node.expression?.getText(source).startsWith('visibleTerminalLines.length === 0 &&')) {
    emptyOutput = node.expression;
  }
  ts.forEachChild(node, visit);
};
visit(source);
assert.ok(emptyOutput, 'Exercise the terminal’s real empty-turn render.');
const code = ts.transpileModule(`const result = (${emptyOutput.getText(source)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
function renderEmpty(overrides = {}) {
  const bindings = { React, visibleTerminalLines: [], accentColor: '#709f9a',
    viewedTerminalTurn: 1, investigationV2: true, lang: 'zh', isViewingActiveTerminalTurn: true,
    isProcessing: false, streamingTerminal: null, ...overrides };
  const element = compileFunction(`${code}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
  return renderToStaticMarkup(element);
}

function confirmedInspectionSave() {
  const now = new Date('2026-10-16T01:00:00Z');
  const initial = createRun({ id: 'restored-run', caseData: Case_Data_Lvl_01,
    teamConfig: buildTeamConfig(), investigationVersion: 2, now });
  const target = getInvestigationContent('Lvl_01').targets.find(item => item.zone_id === initial.state.current_zone);
  const offered = applyRunCommand(initial, { type: 'inspect_options', target_id: target.target_id }, now);
  const card = Object.values(offered.result.packs)[0].cards.find(item => item.method_id === target.method_id);
  return publicRun(applyRunCommand(offered.run, { type: 'inspect', option_id: card.option_id }, now).run);
}

test('restoring a real paid inspection save shows preserved progress rather than a permanent record-loading indicator', () => {
  const snapshot = confirmedInspectionSave();
  assert.equal(snapshot.state.turn_count, 1);
  assert.equal(snapshot.state.action_points_left, 19);
  assert.equal(snapshot.state.unlocked_clues.length, 1);
  assert.equal(Object.hasOwn(snapshot.state, 'chat_history'), false,
    'The public run has confirmed progress, without a full terminal transcript.');
  const before = structuredClone(snapshot);
  // Each save switch or page refresh starts a new presentation session. The
  // absence of its local transcript must not pretend another action is running.
  for (const lang of ['zh', 'en']) {
    const turns = getTerminalTurns([], snapshot.state.turn_count);
    const markup = renderEmpty({ lang, viewedTerminalTurn: turns.at(-1),
      visibleTerminalLines: getTerminalLinesForTurn([], snapshot.state.turn_count) });
    assert.ok(markup.includes(lang === 'zh' ? '本次会话没有此回合的逐项文本' : 'This session has no detailed text for this turn'));
    assert.ok(markup.includes(lang === 'zh' ? '调查档案' : 'investigation journal'));
    assert.doesNotMatch(markup, /正在建立|BUILDING|神经|neural|undefined/);
  }
  assert.deepEqual(snapshot, before, 'Rendering recovery feedback cannot rewrite or replay an investigation.');
});

test('only an active operation on the viewed current turn displays record-building feedback', () => {
  for (const activity of [{ isProcessing: true }, { streamingTerminal: { text: 'A live observation' } }]) {
    for (const lang of ['zh', 'en']) {
      assert.ok(renderEmpty({ ...activity, lang }).includes(lang === 'zh' ? '本回合正在建立记录' : 'BUILDING THIS TURN RECORD'));
      const historic = renderEmpty({ ...activity, lang, isViewingActiveTerminalTurn: false });
      assert.doesNotMatch(historic, /正在建立|BUILDING/);
      assert.ok(historic.includes(lang === 'zh' ? '云端已确认的调查进度仍保留' : 'Cloud-confirmed progress is preserved'));
    }
  }
});

test('new investigation briefings retain their guidance and existing turn records suppress the empty state', () => {
  assert.match(renderEmpty({ viewedTerminalTurn: 0 }), /现场调查台已准备/);
  assert.match(renderEmpty({ viewedTerminalTurn: 0, investigationV2: false }), /执行循环/);
  assert.match(renderEmpty({ viewedTerminalTurn: 0, lang: 'en' }), /FIELD DESK READY/);
  assert.match(renderEmpty({ viewedTerminalTurn: 0, investigationV2: false, lang: 'en' }), /SYSTEM READY/);
  assert.equal(renderEmpty({ visibleTerminalLines: [{ turn: 1, text: 'Confirmed result' }] }), '');
});
