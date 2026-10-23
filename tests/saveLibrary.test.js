import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { groupLibrarySaves, savePresentation } from '../src/game/saveLibrary.js';

const source = readFileSync(new URL('../src/components/game/SaveLibrary.jsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} });
let language = 'zh';
function loadLibrary(react = React) {
  const imports = {
    react: { ...react, default: react },
    '@/lib/lang.jsx': { useLang: () => ({ lang: language }) },
    '@/components/ui/Icon': { default: () => null },
    '@/game/saveLibrary': { groupLibrarySaves },
    './saveLibrary.css': {},
  };
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected import ${id}`);
    return imports[id];
  }, exports);
  return exports.default;
}
const SaveLibrary = loadLibrary();
const save = (patch = {}) => ({
  id: 'run-a', case_id: 'Lvl_01', status: 'active', revision: 3,
  updated_at: '2026-10-16T01:00:00Z', zone_id: 'zone_lobby',
  turn_count: 4, action_points_left: 16, clue_count: 3, clue_total: 9,
  ...patch,
});
const baseProps = { onResume() {}, onNewGame() {}, onRefresh() {}, onBack() {} };

test('save summaries localize only public case locations and never infer undiscovered evidence', () => {
  for (const lang of ['zh', 'en']) {
    const view = savePresentation(save(), lang, 'run-a');
    assert.equal(view.title, lang === 'zh' ? '霓虹血迹' : 'Neon Blood');
    assert.ok(view.zone.includes(lang === 'zh' ? '大堂' : 'Lobby'));
    assert.equal(view.current, true);
    assert.equal(view.clueCount, 3);
    assert.equal(view.cluePercent, 33);
    const missing = savePresentation(save({ clue_total: undefined }), lang);
    assert.equal(missing.clueTotal, 0, 'no hidden clue total is inferred from the case catalog');
    assert.equal(missing.cluePercent, 0, 'an unknown total must not appear as fully complete');
    assert.equal(savePresentation(save({ clue_total: undefined, clue_count: undefined }), lang).clueTotal, 0);
    const unknown = savePresentation(save({ case_id: 'private_future_case', zone_id: 'SECRET_ZONE', updated_at: 'not-a-date' }), lang);
    assert.equal(unknown.title, lang === 'zh' ? '未知案件' : 'Unknown case');
    assert.equal(unknown.savedAt, null);
    assert.equal(unknown.savedIso, undefined);
    assert.doesNotMatch(JSON.stringify(unknown), /Invalid Date|SECRET_ZONE|private_future_case/);
  }
});

test('presentation sanitizes counts, dates, grades and statuses without changing stored data', () => {
  const original = save({ clue_count: -1, clue_total: Infinity, action_points_left: NaN,
    turn_count: '3', status: 'unexpected', grade: 'PRIVATE_ANSWER', updated_at: '', created_at: '2026-10-15T00:00:00Z' });
  const before = structuredClone(original);
  const view = savePresentation(original);
  assert.equal(view.clueCount, 0);
  assert.equal(view.clueTotal, 0);
  assert.equal(view.ap, 0);
  assert.equal(view.turns, 0);
  assert.equal(view.grade, null);
  assert.equal(view.resumable, false);
  assert.equal(view.savedIso, '2026-10-15T00:00:00.000Z');
  assert.deepEqual(original, before);
  assert.equal(savePresentation(save({ id: null })).resumable, false);
});

test('groups preserve resumable conclusions while settled records never expose a resume action', () => {
  const inputs = ['settled', 'failed', 'completed', 'abandoned', 'active', 'unknown']
    .map((status, index) => save({ id: `run-${index}`, status }));
  const result = groupLibrarySaves(inputs);
  assert.deepEqual(result.resumable.map(item => item.view.status), ['failed', 'completed', 'abandoned', 'active']);
  assert.deepEqual(result.finished.map(item => item.view.status), ['settled', 'unknown']);
  assert.equal(savePresentation(inputs[1]).actionLabel, '继续结算');
  assert.equal(savePresentation(inputs[2]).actionLabel, '继续结案');
  assert.equal(savePresentation(inputs[4]).actionLabel, '继续调查');
});

test('current save sorts first, later saves follow, and searching does not mutate or widen records', () => {
  const inputs = [save({ id: 'older', updated_at: '2026-10-14T00:00:00Z' }),
    save({ id: 'newer', updated_at: '2026-10-16T00:00:00Z' }),
    save({ id: 'current', updated_at: '2026-10-13T00:00:00Z', zone_id: 'zone_lab' })];
  const snapshot = structuredClone(inputs);
  assert.deepEqual(groupLibrarySaves(inputs, 'en', 'current').resumable.map(entry => entry.view.id), ['current', 'newer', 'older']);
  assert.deepEqual(groupLibrarySaves(inputs, 'en', 'current', '  PRIVATE LABORATORY  ').resumable.map(entry => entry.view.id), ['current']);
  assert.equal(groupLibrarySaves(inputs, 'zh', 'current', '不存在').resumable.length, 0);
  assert.deepEqual(inputs, snapshot);
  assert.deepEqual(groupLibrarySaves(null), { resumable: [], finished: [] });
});

test('save search accepts a public case ID and exposes a clear control without mutating saves', () => {
  const inputs = [save(), save({ id: 'second', case_id: 'Lvl_02' })];
  const original = structuredClone(inputs);
  assert.deepEqual(groupLibrarySaves(inputs, 'en', null, 'lvl_02').resumable.map(entry => entry.view.id), ['second']);
  assert.deepEqual(inputs, original);
  language = 'en';
  const view = interactiveLibrary({ ...baseProps, saves: inputs });
  const input = descendants(view.render(), node => node.type === 'input')[0];
  input.props.onChange({ target: { value: 'lvl_02' } });
  const filtered = view.render();
  const clear = buttons(filtered).find(node => String(node.props.className).includes('td-save-search-clear'));
  assert.ok(clear);
  clear.props.onClick();
  assert.equal(descendants(view.render(), node => node.type === 'input')[0].props.value, '');
});

test('library renders bilingual status, progress, current highlight and read-only settlement history', () => {
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(SaveLibrary, {
      ...baseProps, currentRunId: 'run-a', saves: [save(), save({ id: 'finished', status: 'settled', grade: 'B' })],
    }));
    assert.match(markup, /td-save-card is-current/);
    assert.ok(markup.includes(language === 'zh' ? '进度保存库' : 'Save Library'));
    assert.ok(markup.includes(language === 'zh' ? '当前调查' : 'Current investigation'));
    assert.ok(markup.includes(language === 'zh' ? '已结束' : 'Finished'));
    assert.match(markup, /<progress max="100" value="33" aria-label="[^"]+3 \/ 9"/);
    assert.equal([...markup.matchAll(/class="td-save-button is-resume"/g)].length, 1);
    assert.match(markup, /<time dateTime="2026-10-16T01:00:00.000Z">/);
    assert.doesNotMatch(markup, /神经接口|Neural|PRIVATE_ANSWER|undefined|Invalid Date/);
  }
});

test('loading, read-only, unsupported and capacity states prevent unsafe entry while retaining old summaries', () => {
  language = 'en';
  for (const state of [{ busy: true }, { loading: true }, { readOnly: true }, { supported: false }]) {
    const markup = renderToStaticMarkup(React.createElement(SaveLibrary, { ...baseProps, ...state, saves: [save()] }));
    assert.match(markup, /Neon Blood/);
    assert.match(markup, /class="td-save-button is-primary" disabled=""/);
    assert.match(markup, /class="td-save-button is-resume" disabled=""/);
  }
  const unsupported = renderToStaticMarkup(React.createElement(SaveLibrary, { ...baseProps, supported: false, saves: [save()] }));
  assert.match(unsupported, /服务端版本尚未启用多档存档|server has not enabled multiple saves yet/);
  const atCapacity = renderToStaticMarkup(React.createElement(SaveLibrary, { ...baseProps, limit: 1, saves: [save()] }));
  assert.match(atCapacity, /class="td-save-button is-primary" disabled=""/);
  assert.doesNotMatch(atCapacity, /class="td-save-button is-resume" disabled=""/);
  const withHistory = renderToStaticMarkup(React.createElement(SaveLibrary, { ...baseProps, limit: 1, saves: [save({ status: 'settled' })] }));
  assert.doesNotMatch(withHistory, /class="td-save-button is-primary" disabled=""/);
});

test('empty and error states explain recovery without removing existing saves', () => {
  for (language of ['zh', 'en']) {
    const empty = renderToStaticMarkup(React.createElement(SaveLibrary, baseProps));
    assert.ok(empty.includes(language === 'zh' ? '你的第一份调查档案' : 'Your first case file'));
    assert.ok(empty.includes(language === 'zh' ? '不会再次收取开案费用' : 'never charges the case entry cost again'));
    const error = renderToStaticMarkup(React.createElement(SaveLibrary, { ...baseProps, error: 'Network unavailable', saves: [save()] }));
    assert.match(error, /role="alert"/);
    assert.match(error, /Network unavailable/);
    assert.match(error, /Neon Blood|霓虹血迹/);
    assert.ok(error.includes(language === 'zh' ? '重试' : 'Retry'));
  }
});

function descendants(root, predicate) {
  const found = [];
  const visit = node => {
    if (!React.isValidElement(node)) return;
    if (predicate(node)) found.push(node);
    if (typeof node.type === 'function') visit(node.type(node.props));
    else React.Children.forEach(node.props.children, visit);
  };
  visit(root);
  return found;
}
function interactiveLibrary(props) {
  const states = [];
  const refs = [];
  let stateCursor = 0;
  let refCursor = 0;
  let id = 0;
  const Component = loadLibrary({ ...React,
    useId: () => `save-library-test-${id++}`,
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = next; }];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
  });
  return { render() { stateCursor = 0; refCursor = 0; id = 0; return Component(props); } };
}
const buttons = tree => descendants(tree, node => node.type === 'button');
const findButton = (tree, className) => buttons(tree).find(node => String(node.props.className).includes(className));
const finishTick = () => new Promise(resolve => setImmediate(resolve));

test('native resume button supports keyboard activation and blocks duplicate clicks before a rerender', async () => {
  language = 'zh';
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const calls = [];
  const record = save();
  const view = interactiveLibrary({ ...baseProps, saves: [record], onResume: value => { calls.push(value); return pending; } });
  const button = findButton(view.render(), 'is-resume');
  assert.equal(button.type, 'button');
  assert.equal(button.props.type, 'button', 'native Enter and Space generate the same click action');
  assert.equal(button.props.tabIndex, undefined, 'the native button remains in the normal keyboard tab order');
  button.props.onClick();
  button.props.onClick();
  assert.deepEqual(calls, [record]);
  assert.equal(findButton(view.render(), 'is-resume').props.disabled, true);
  assert.equal(findButton(view.render(), 'is-primary').props.disabled, true);
  resolve();
  await finishTick();
  assert.equal(findButton(view.render(), 'is-resume').props.disabled, false);
});

test('failed resume preserves the library and offers a retry after the in-flight action finishes', async () => {
  language = 'en';
  let attempts = 0;
  const view = interactiveLibrary({ ...baseProps, saves: [save()], onResume: async () => { attempts += 1; throw new Error('private internals'); } });
  findButton(view.render(), 'is-resume').props.onClick();
  await finishTick();
  const tree = view.render();
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /The action did not finish/);
  assert.match(markup, /Neon Blood/);
  assert.doesNotMatch(markup, /private internals/);
  assert.equal(findButton(tree, 'is-resume').props.disabled, false);
  findButton(tree, 'is-resume').props.onClick();
  await finishTick();
  assert.equal(attempts, 2);
});

test('searching and clearing the library never triggers a game command', () => {
  language = 'en';
  let mutations = 0;
  const view = interactiveLibrary({ ...baseProps, saves: [save()], onResume: () => { mutations += 1; }, onNewGame: () => { mutations += 1; } });
  const input = descendants(view.render(), node => node.type === 'input')[0];
  input.props.onChange({ target: { value: 'no-matching-case' } });
  const filtered = view.render();
  assert.match(renderToStaticMarkup(filtered), /No saves match/);
  assert.equal(findButton(filtered, 'is-resume'), undefined);
  const clear = buttons(filtered).find(node => node.props.children === 'Clear search');
  clear.props.onClick();
  assert.ok(findButton(view.render(), 'is-resume'));
  assert.equal(mutations, 0);
});
