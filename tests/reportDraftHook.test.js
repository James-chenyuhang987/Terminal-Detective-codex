import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import * as drafts from '../src/game/reportDraft.js';

const source = ts.createSourceFile('useReportDraft.js', readFileSync(new URL('../src/components/game/investigation/useReportDraft.js', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const code = ts.transpileModule(source.statements.filter(node => !ts.isImportDeclaration(node))
  .map(node => node.getText(source).replace(/^export /, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const firstContext = { ownerUid: 'owner-a', runId: 'run-1', caseId: 'Lvl_01', investigationVersion: 2 };
const selection = (id = 'suspect-1') => ({ ...drafts.defaultReportDraft(), conclusionId: id,
  evidenceByDimension: { opportunity: ['c_01'] } });
function storage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

// Execute the real hook with dependency-aware React primitives, without effects
// that could hide an incorrect first render when switching owner or run.
function harness(store = storage()) {
  const slots = [];
  let cursor = 0; let context = firstContext;
  const same = (left, right) => left && right && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const memo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: factory() };
    return slots[index].value;
  };
  const bindings = {
    useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useRef: initial => { const index = cursor++; slots[index] ||= { current: initial }; return slots[index]; },
    useState: initial => {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    readReportDraft: scope => drafts.readReportDraft(scope, store),
    writeReportDraft: (scope, value) => drafts.writeReportDraft(scope, value, store),
    removeReportDraft: scope => drafts.removeReportDraft(scope, store),
  };
  const useReportDraft = compileFunction(`${code}\nreturn useReportDraft;`, Object.keys(bindings))(...Object.values(bindings));
  return { store, render(nextContext = context) { context = nextContext; cursor = 0; return useReportDraft(context); } };
}

test('the real hook restores a saved draft after remount and exposes synchronous storage status', () => {
  const store = storage();
  const app = harness(store);
  const first = app.render();
  assert.equal(first.status, 'empty');
  first.setValue(selection());
  assert.equal(app.render().status, 'saved');
  const reloaded = harness(store).render();
  assert.deepEqual(reloaded.value, drafts.normalizeReportDraft(selection()));
  assert.equal(reloaded.status, 'saved');
});

test('the very first render after switching run, owner or metadata never exposes old selections', () => {
  const app = harness();
  app.render().setValue(selection());
  const secondRun = { ...firstContext, runId: 'run-2' };
  assert.deepEqual(app.render(secondRun).value, drafts.defaultReportDraft());
  app.render().setValue(selection('suspect-2'));
  assert.deepEqual(app.render({ ...secondRun, ownerUid: 'owner-b' }).value, drafts.defaultReportDraft());
  assert.equal(app.render(firstContext).value.conclusionId, 'suspect-1');
  assert.deepEqual(app.render({ ...firstContext, caseId: 'Lvl_02' }).value, drafts.defaultReportDraft());
  assert.deepEqual(app.render({ ...firstContext, investigationVersion: 1 }).value, drafts.defaultReportDraft());
});

test('old owner and run callbacks cannot save or clear the currently displayed draft', () => {
  const app = harness();
  const first = app.render();
  first.setValue(selection('suspect-a'));
  const secondContext = { ...firstContext, ownerUid: 'owner-b', runId: 'run-2' };
  const second = app.render(secondContext);
  second.setValue(selection('suspect-b'));
  const before = [...app.store.data];
  first.setValue(selection('stale-a'));
  first.clear();
  assert.deepEqual([...app.store.data], before);
  assert.equal(app.render().value.conclusionId, 'suspect-b');
  assert.equal(drafts.readReportDraft(firstContext, app.store).value.conclusionId, 'suspect-a');
});

test('A to B to A navigation invalidates the first A callbacks rather than matching just the run ID', () => {
  const app = harness();
  const original = app.render();
  original.setValue(selection('original-a'));
  app.render({ ...firstContext, runId: 'run-b' }).setValue(selection('b'));
  const returned = app.render(firstContext);
  assert.equal(returned.value.conclusionId, 'original-a');
  returned.setValue(selection('new-a'));
  original.setValue(selection('stale-a'));
  original.clear();
  assert.equal(app.render().value.conclusionId, 'new-a');
  assert.equal(drafts.readReportDraft(firstContext, app.store).value.conclusionId, 'new-a');
});

test('same-frame functional edits compose once and use the latest in-memory selection', () => {
  const app = harness();
  const first = app.render();
  let calls = 0;
  first.setValue(previous => { calls++; return { ...previous, conclusionId: 'suspect-1' }; });
  first.setValue(previous => { calls++; return { ...previous, methodId: `${previous.conclusionId}-method` }; });
  assert.equal(calls, 2);
  assert.equal(app.render().value.methodId, 'suspect-1-method');
  assert.deepEqual(drafts.readReportDraft(firstContext, app.store).value, app.render().value);
});

test('unavailable storage keeps current edits in memory and clear still removes visible selections', () => {
  const store = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  const app = harness(store);
  assert.equal(app.render().status, 'memory');
  app.render().setValue(selection());
  assert.deepEqual(app.render().value, drafts.normalizeReportDraft(selection()));
  assert.equal(app.render().status, 'memory');
  app.render().clear();
  assert.deepEqual(app.render().value, drafts.defaultReportDraft());
  assert.equal(app.render().status, 'memory');
});

test('legacy hook drafts retain v1 evidence and clearing does not affect another run', () => {
  const app = harness();
  const legacy = { ...firstContext, investigationVersion: 1 };
  app.render(legacy).setValue({ ...selection(), evidenceIds: ['c_01', 'c_02'] });
  assert.deepEqual(app.render().value.evidenceIds, ['c_01', 'c_02']);
  assert.deepEqual(app.render().value.evidenceByDimension, {});
  const other = { ...legacy, runId: 'run-2' };
  app.render(other).setValue({ ...selection('other'), evidenceIds: ['c_03'] });
  app.render(legacy).clear();
  assert.equal(app.render().status, 'empty');
  assert.equal(app.render(other).value.conclusionId, 'other');
});
