import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { readReconstructionDraft, writeReconstructionDraft } from '../src/game/runWorkspace.js';

const source = ts.createSourceFile('InvestigationFieldPanel.jsx', readFileSync(new URL('../src/components/game/investigation/InvestigationFieldPanel.jsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const panel = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'InvestigationFieldPanel');
function loadPerform(bindings) {
  const declaration = panel.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(source) === 'perform');
  assert.ok(declaration);
  const code = ts.transpileModule(`const perform = ${declaration.initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return compileFunction(`${code}\nreturn perform;`, Object.keys(bindings))(...Object.values(bindings));
}

test('a repeated same-frame field action shares the first in-flight operation without presenting a false failure', async () => {
  const calls = []; const errors = []; const notices = []; const pending = [];
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const view = {};
  const bindings = {
    locked: false, zh: false, mountedRef: { current: true }, requestRef: { current: 0 },
    actionRef: { current: null }, optionsRef: { current: null }, view, viewRef: { current: view },
    commandRef: { current: command => {
      calls.push(command);
      if (calls.length > 1) return Promise.reject(Object.assign(new Error('RUN_REQUEST_BUSY'), { code: 'RUN_REQUEST_BUSY' }));
      return response;
    } },
    setPendingView: value => pending.push(value), setFailure: value => { if (value) errors.push(value); },
    setFeedback: value => { if (value) notices.push(value); }, setOffer() {}, onTargetChange() {},
  };
  const perform = loadPerform(bindings);
  const command = { type: 'inspect', option_id: 'current-inspection' };
  const first = perform(command);
  const duplicate = perform(command);
  await Promise.resolve();
  release({ result: { narration: 'The cloud confirmed this inspection.' } });
  await Promise.all([first, duplicate]);
  assert.equal(calls.length, 1, 'the synchronous guard must prevent a second command before React rerenders');
  assert.deepEqual(errors, [], 'the successful inspection must not receive a duplicate busy error');
  assert.deepEqual(notices, [{ view, result: { narration: 'The cloud confirmed this inspection.' } }]);
  assert.deepEqual(pending, [view, null], 'only the operation owner may release the pending indicator');
});

test('retained action callbacks from another target, run or visit cannot start a command', async () => {
  const oldView = {};
  for (const reason of ['target', 'run', 'inactive', 'return-visit']) {
    let calls = 0;
    const perform = loadPerform({ locked: false, actionRef: { current: null }, optionsRef: { current: null }, view: oldView,
      viewRef: { current: { reason } }, commandRef: { current: () => { calls++; } } });
    await perform({ type: 'inspect', option_id: 'old-offer' });
    assert.equal(calls, 0, `${reason} must invalidate the old rendered callback before effects run`);
  }
});

test('late action outcomes and cleanup do not replace a newer view or its pending request', async () => {
  for (const rejected of [false, true]) {
    const presented = []; let release; let fail;
    const response = new Promise((resolve, reject) => { release = resolve; fail = reject; });
    const view = {};
    const bindings = { locked: false, zh: false, mountedRef: { current: true }, requestRef: { current: 0 },
      view, viewRef: { current: view }, actionRef: { current: null }, optionsRef: { current: null }, commandRef: { current: () => response },
      setPendingView: value => presented.push(['pending', value]), setFailure: value => presented.push(['error', value]),
      setFeedback: value => presented.push(['notice', value]), setOffer: value => presented.push(['packs', value]),
      onTargetChange: value => presented.push(['target', value]) };
    const pending = loadPerform(bindings)({ type: 'travel', zone_id: 'old-destination' });
    presented.length = 0;
    bindings.viewRef.current = {};
    const newerAction = {};
    bindings.actionRef.current = newerAction;
    bindings.requestRef.current++;
    if (rejected) fail(new Error('old network failure'));
    else release({ result: { narration: 'OLD_RESULT' } });
    await pending;
    assert.deepEqual(presented, [], 'a stale result cannot clear new options, show an old notice or release another spinner');
    assert.equal(bindings.actionRef.current, newerAction);
  }
});

test('same-frame option loading prevents a competing paid action before its pending state renders', async () => {
  const view = {};
  let calls = 0;
  const perform = loadPerform({ locked: false, actionRef: { current: null }, optionsRef: { current: { view } },
    view, viewRef: { current: view }, commandRef: { current: () => { calls++; } } });
  await perform({ type: 'rest' });
  assert.equal(calls, 0, 'reading an offer and a paid action must not race at the same revision');
});

function workspaceStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

function reconstructionHarness(store = workspaceStorage()) {
  const hookSource = ts.createSourceFile('useReconstructionDraft.js', readFileSync(new URL('../src/components/game/investigation/useReconstructionDraft.js', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const code = ts.transpileModule(hookSource.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(hookSource).replace(/^export /, '')).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const slots = []; let cursor = 0;
  const memo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((item, i) => !Object.is(item, slots[index].deps[i]))) slots[index] = { deps, value: factory() };
    return slots[index].value;
  };
  const bindings = { useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    readReconstructionDraft: scope => readReconstructionDraft(scope, store),
    writeReconstructionDraft: (scope, value) => writeReconstructionDraft(scope, value, store),
    useRef: initial => { const index = cursor++; slots[index] ||= { current: initial }; return slots[index]; },
    useState: initial => {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    } };
  const hook = compileFunction(`${code}\nreturn useReconstructionDraft;`, Object.keys(bindings))(...Object.values(bindings));
  return { store, render(scope) { cursor = 0; return hook(scope); } };
}

test('the terminal-owned persistent draft composes edits and isolates owners, runs, puzzles and previous visits', () => {
  const scope = { ownerUid: 'owner-a', runId: 'run-a', puzzleId: 'clock' };
  const app = reconstructionHarness();
  const original = app.render(scope);
  original.setValue(previous => ({ ...previous, answerIds: ['clone', 'enter'] }));
  original.setValue(previous => ({ ...previous, view: { offsets: { shaft: -90 }, alignments: { clone: 6 },
    activeId: 'enter', frame: 18, showReference: false } }));
  const saved = app.render(scope).value;
  assert.deepEqual(saved.answerIds, ['clone', 'enter']);
  assert.equal(saved.view.offsets.shaft, -90);
  assert.deepEqual(app.render(scope).value, saved, 'panel remounts and presentation changes keep the terminal memory');
  for (const next of [{ ...scope, ownerUid: 'owner-b' }, { ...scope, runId: 'run-b' }, { ...scope, puzzleId: 'route' }]) {
    assert.deepEqual(app.render(next).value, { answerIds: [], view: {} }, 'the new context is empty on its first render');
    app.render(next).setValue({ answerIds: ['new'], view: {} });
    original.setValue({ answerIds: ['STALE'], view: {} });
    assert.deepEqual(app.render(next).value.answerIds, ['new']);
  }
  const returned = app.render(scope);
  returned.setValue({ answerIds: ['latest-visit'], view: {} });
  original.setValue({ answerIds: ['STALE'], view: {} });
  assert.deepEqual(app.render(scope).value.answerIds, ['latest-visit'], 'returning to A does not reactivate callbacks from the first A visit');
  assert.deepEqual(reconstructionHarness(app.store).render(scope).value.answerIds, ['latest-visit'], 'remounting the saved run restores its personal draft');
});
