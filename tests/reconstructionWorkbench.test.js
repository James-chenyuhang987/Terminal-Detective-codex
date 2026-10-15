import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { createRun, publicRun } from '../server/gameAuthority/runAuthority.js';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';

const source = readFileSync(new URL('../src/components/game/investigation/ReconstructionWorkbench.jsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} });
function puzzleFor(caseId) {
  const run = createRun({ id: `workbench-ui-${caseId}`, caseData: ALL_CASES.find(item => item.case_id === caseId),
    teamConfig: buildTeamConfig(), now: new Date('2026-10-15T12:00:00Z'), investigationVersion: 2 });
  run.state.unlocked_clues = [...getInvestigationContent(caseId).puzzle.required_clues];
  return publicRun(run).investigation.puzzle;
}
function instance(puzzle, lang = 'en') {
  const slots = []; const changes = [];
  let cursor = 0; let id = 0;
  const hooks = { ...React, default: React,
    useId: () => `workbench-${++id}`,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
  };
  const imports = { react: hooks, '@/game/investigationChoices.js': { localizedInvestigationText }, './reconstructionWorkbench.css': {} };
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected workbench dependency: ${name}`);
    return imports[name];
  }, exports);
  const props = { puzzle, lang, answerIds: [], disabled: false,
    onAnswerChange(next) { props.answerIds = next; changes.push(next); } };
  return { props, changes, render() { cursor = 0; id = 0; return exports.default(props); } };
}
function descendants(node, predicate) {
  if (!React.isValidElement(node)) return [];
  if (typeof node.type === 'function') return descendants(node.type(node.props), predicate);
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap(child => descendants(child, predicate)),
  ];
}
function label(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  if (typeof node.type === 'function') return label(node.type(node.props));
  return React.Children.toArray(node.props.children).map(label).join('');
}
function button(tree, contains) {
  const found = descendants(tree, node => node.type === 'button' && label(node).includes(contains))[0];
  assert.ok(found, `Missing button containing ${contains}`);
  return found;
}
function viewRecord(app, id) {
  const title = localizedInvestigationText(app.props.puzzle.workbench.records[id].label, app.props.lang);
  const tab = descendants(app.render(), node => node.type === 'button' && label(node) === title)[0];
  assert.ok(tab, `Missing source tab for ${id}`);
  tab.props.onClick();
  return app.render();
}

for (const caseId of INVESTIGATION_CASE_IDS) {
  test(`${caseId}: the real bilingual workbench renders public sources and native keyboard controls without selecting or submitting`, () => {
    for (const lang of ['zh', 'en']) {
      const puzzle = puzzleFor(caseId);
      const app = instance(puzzle, lang);
      const before = JSON.stringify(puzzle);
      const tree = app.render();
      const markup = renderToStaticMarkup(tree);
      assert.ok(markup.includes(localizedInvestigationText(puzzle.workbench.title, lang)));
      assert.ok(markup.includes(localizedInvestigationText(puzzle.workbench.instructions, lang)));
      assert.ok(markup.includes(localizedInvestigationText(puzzle.workbench.source_note, lang)));
      assert.doesNotMatch(markup, /undefined|\[object Object\]/);
      for (const item of puzzle.items) {
        const title = localizedInvestigationText(puzzle.workbench.records[item.id].label, lang);
        assert.ok(markup.includes(title));
        viewRecord(app, item.id);
      }
      const controls = descendants(app.render(), node => node.type === 'button' || node.type === 'input');
      for (const control of controls) {
        if (control.type === 'button') assert.equal(control.props.type, 'button');
        else assert.ok(control.props['aria-label'], 'every range has a keyboard-accessible name');
      }
      assert.deepEqual(app.changes, [], 'opening or reviewing raw materials must never choose an answer');
      assert.equal(JSON.stringify(puzzle), before, 'controls never rewrite the authoritative snapshot');
      assert.equal(descendants(tree, node => node.type === 'button' && /提交|Submit reconstruction/.test(label(node))).length, 0,
        'the workbench must not initiate a charge or submit an answer');
    }
  });
}

test('clock calibration updates displayed times while leaving raw readings, answer selection and state untouched', () => {
  const app = instance(puzzleFor('Lvl_01'));
  const before = JSON.stringify(app.props.puzzle);
  let tree = app.render();
  const shaft = descendants(tree, node => node.type === 'input' && String(node.props['aria-label']).includes('Shaft-lock clock'))[0];
  assert.ok(shaft);
  assert.ok(label(tree).includes('23:18:30'));
  shaft.props.onChange({ target: { value: '-90' } });
  tree = app.render();
  const tables = descendants(tree, node => node.type === 'table');
  assert.ok(tables.some(table => label(table).includes('23:17:00')));
  assert.ok(tables.some(table => label(table).includes('23:18:30')), 'the original remains visible beside the calibrated reading');
  assert.deepEqual(app.changes, []);
  assert.equal(JSON.stringify(app.props.puzzle), before);
});

test('waveform alignment moves only the reference overlay and its numeric table retains the original samples', () => {
  const app = instance(puzzleFor('Lvl_07'));
  let tree = viewRecord(app, 'breath');
  const observed = descendants(tree, node => node.type === 'polyline' && node.props.className === 'td-workbench-observed-trace')[0].props.points;
  const reference = descendants(tree, node => node.type === 'polyline' && node.props.className === 'td-workbench-reference-trace')[0].props.points;
  const values = label(descendants(tree, node => node.type === 'table')[0]);
  descendants(tree, node => node.type === 'input' && node.props['aria-label'] === 'Reference alignment offset')[0].props.onChange({ target: { value: '8' } });
  tree = app.render();
  assert.equal(descendants(tree, node => node.type === 'polyline' && node.props.className === 'td-workbench-observed-trace')[0].props.points, observed);
  assert.notEqual(descendants(tree, node => node.type === 'polyline' && node.props.className === 'td-workbench-reference-trace')[0].props.points, reference);
  assert.equal(label(descendants(tree, node => node.type === 'table')[0]), values);
  assert.deepEqual(app.changes, []);
  button(tree, 'Overlay registered reference').props.onClick();
  assert.equal(descendants(app.render(), node => node.props.className === 'td-workbench-reference-trace').length, 0);
});

test('camera frame scrubbing compares the observed frame and independent star map without correcting or submitting an answer', () => {
  const app = instance(puzzleFor('Lvl_05'));
  let tree = app.render();
  const frame = descendants(tree, node => node.type === 'input' && node.props['aria-label'] === 'Frame time')[0];
  frame.props.onChange({ target: { value: '18' } });
  tree = app.render();
  const status = descendants(tree, node => node.props.role === 'status')[0];
  assert.match(label(status), /18s.*Camera position.*12.*Independent star map.*48/);
  assert.deepEqual(app.changes, []);
});

test('controlled clock and camera view measurements restore after workbench remounts without altering answer choices', () => {
  for (const caseId of ['Lvl_01', 'Lvl_05']) {
    const puzzle = puzzleFor(caseId);
    const app = instance(puzzle);
    let view = {};
    app.props.viewState = view;
    app.props.onViewChange = update => { view = typeof update === 'function' ? update(view) : update; app.props.viewState = view; };
    let tree = app.render();
    if (caseId === 'Lvl_01') {
      descendants(tree, node => node.type === 'input' && String(node.props['aria-label']).includes('Shaft-lock clock'))[0]
        .props.onChange({ target: { value: '-90' } });
    } else {
      descendants(tree, node => node.type === 'input' && node.props['aria-label'] === 'Frame time')[0].props.onChange({ target: { value: '18' } });
      descendants(tree, node => node.type === 'input' && node.props['aria-label'] === 'Reference alignment offset')[0].props.onChange({ target: { value: '6' } });
      button(app.render(), 'Overlay registered reference').props.onClick();
    }
    const last = puzzle.items.at(-1);
    viewRecord(app, last.id);
    const remounted = instance(puzzle);
    remounted.props.viewState = view;
    tree = remounted.render();
    assert.ok(label(descendants(tree, node => node.props.className === 'td-workbench-current-record')[0]).includes(localizedInvestigationText(puzzle.workbench.records[last.id].label, 'en')));
    if (caseId === 'Lvl_01') {
      assert.equal(descendants(tree, node => node.type === 'input' && String(node.props['aria-label']).includes('Shaft-lock clock'))[0].props.value, -90);
    } else {
      assert.equal(descendants(tree, node => node.type === 'input' && node.props['aria-label'] === 'Frame time')[0].props.value, 18);
      assert.equal(descendants(tree, node => node.props.className === 'td-workbench-reference-trace').length, 0);
      const firstId = puzzle.items[0].id;
      assert.equal(view.alignments[firstId], 6, 'record-specific alignment is retained even after selecting another source');
    }
    assert.deepEqual(app.changes, [], 'measurement controls cannot select or submit an answer');
    assert.deepEqual(remounted.changes, []);
  }
});

test('map buttons select only the player route, permit reordering and preserve the parent draft across remount', () => {
  const app = instance(puzzleFor('Lvl_04'));
  const pick = id => {
    const title = localizedInvestigationText(app.props.puzzle.workbench.records[id].label, 'en');
    const node = descendants(app.render(), node => node.type === 'button' && String(node.props.className).includes('td-workbench-map-node') && label(node).includes(title))[0];
    assert.ok(node);
    node.props.onClick();
  };
  pick('hatch'); pick('dock'); pick('valve');
  assert.deepEqual(app.props.answerIds, ['hatch', 'dock', 'valve'], 'selecting a map node must not silently fill a correct route');
  let tree = app.render();
  const dock = localizedInvestigationText(app.props.puzzle.workbench.records.dock.label, 'en');
  descendants(tree, node => node.type === 'button' && node.props['aria-label'] === `Move earlier · ${dock}`)[0].props.onClick();
  assert.deepEqual(app.props.answerIds, ['dock', 'hatch', 'valve']);
  const remounted = instance(app.props.puzzle);
  remounted.props.answerIds = [...app.props.answerIds];
  tree = remounted.render();
  assert.ok(label(descendants(tree, node => node.props.className === 'td-workbench-selection')[0]).includes('Your reconstruction order'));
  assert.deepEqual(remounted.props.answerIds, ['dock', 'hatch', 'valve']);
  assert.deepEqual(remounted.changes, []);
});

test('script reference toggling is independent of the explicit evidence choice', () => {
  const app = instance(puzzleFor('Lvl_03'));
  let tree = viewRecord(app, 'bypass');
  assert.ok(label(tree).includes('safety = true'));
  assert.ok(label(tree).includes('safety = false'));
  button(tree, 'Hide reference configuration').props.onClick();
  tree = app.render();
  assert.equal(label(tree).includes('safety = true'), false);
  assert.ok(label(tree).includes('safety = false'));
  assert.deepEqual(app.changes, []);
  button(tree, 'Select for this reconstruction').props.onClick();
  assert.deepEqual(app.props.answerIds, ['bypass']);
  button(app.render(), 'Remove from this reconstruction').props.onClick();
  assert.deepEqual(app.props.answerIds, []);
});

test('completed reconstruction remains free to inspect and align while answer controls stay read-only', () => {
  const puzzle = puzzleFor('Lvl_06'); puzzle.completed = true;
  const app = instance(puzzle);
  const tree = viewRecord(app, 'resin');
  const select = button(tree, 'Select for this reconstruction');
  assert.equal(select.props.disabled, true);
  select.props.onClick();
  const alignment = descendants(tree, node => node.type === 'input' && node.props['aria-label'] === 'Reference alignment offset')[0];
  assert.equal(alignment.props.disabled, false);
  alignment.props.onChange({ target: { value: '2' } });
  assert.equal(descendants(app.render(), node => node.type === 'input' && node.props['aria-label'] === 'Reference alignment offset')[0].props.value, 2);
  assert.deepEqual(app.changes, []);
  app.props.disabled = true;
  assert.ok(descendants(app.render(), node => node.type === 'input' || node.type === 'button').every(node => node.props.disabled), 'an in-flight or paused scene disables every control');
});

test('legacy puzzles have no workbench and never receive inferred or fabricated raw material', () => {
  const puzzle = puzzleFor('Lvl_01'); delete puzzle.workbench;
  assert.equal(instance(puzzle).render(), null);
});
