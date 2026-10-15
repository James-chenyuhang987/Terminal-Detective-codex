import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { normalizeHypotheses, pendingHypotheses, readHypotheses, writeHypotheses } from '../src/game/hypothesisNotebook.js';

const context = { ownerUid: 'detective-a', runId: 'run-a', caseId: 'Lvl_01' };
const note = { a: 'c_01', b: 'c_02', relation: 'supports', note: 'Check the independent clock.' };
function storage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('hypotheses reject unknown and malformed evidence while bounding personal notes and storage', () => {
  assert.deepEqual(normalizeHypotheses([null, {}, { ...note, a: undefined }, { ...note, a: 'c_02' },
    { ...note, relation: 'invented' }, { ...note, b: 'unseen' }], ['c_01', 'c_02']), []);
  const values = Array.from({ length: 40 }, (_, index) => ({ ...note, b: `e_${index}`, note: '字'.repeat(400) }));
  const bounded = normalizeHypotheses(values);
  assert.equal(bounded.length, 20);
  assert.equal(bounded[0].b, 'e_20');
  assert.ok(bounded.every(item => item.note.length === 280));
  const store = storage();
  assert.equal(writeHypotheses(context, bounded, store).status, 'saved');
  assert.ok(new TextEncoder().encode([...store.data.values()][0]).length <= 32_768);
});

test('support and contradiction deduplicate symmetrically while order stays directional; confirmed notes leave the pending list', () => {
  const values = [note, { ...note, a: note.b, b: note.a, note: 'Revised note.' },
    { ...note, relation: 'precedes' }, { ...note, a: note.b, b: note.a, relation: 'precedes' }];
  const normalized = normalizeHypotheses(values);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].note, 'Revised note.');
  const pending = pendingHypotheses(normalized, ['c_01', 'c_02'], [
    { a: 'c_01', b: 'c_02', relation_type: 'supports', valid: true },
    { a: 'c_01', b: 'c_02', relation_type: 'precedes', valid: false },
  ]);
  assert.deepEqual(pending.map(item => [item.a, item.b, item.relation]), [
    ['c_01', 'c_02', 'precedes'], ['c_02', 'c_01', 'precedes'],
  ]);
  assert.deepEqual(pendingHypotheses(normalized, ['c_01'], []), []);
});

test('session restoration isolates owner, run and case and handles quota, corrupt and unavailable storage', () => {
  const store = storage();
  assert.equal(writeHypotheses(context, [note], store).status, 'saved');
  assert.deepEqual(readHypotheses(context, store).value, [note]);
  for (const other of [{ ...context, ownerUid: 'detective-b' }, { ...context, runId: 'run-b' }, { ...context, caseId: 'Lvl_02' }]) {
    assert.deepEqual(readHypotheses(other, store).value, []);
  }
  const key = [...store.data.keys()][0];
  for (const raw of ['{', JSON.stringify({ version: 2 }), '字'.repeat(32_768)]) {
    store.data.set(key, raw);
    assert.equal(readHypotheses(context, store).status, 'memory');
  }
  const unavailable = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.deepEqual(writeHypotheses(context, [note], unavailable), { value: [note], status: 'memory' });
  assert.deepEqual(readHypotheses(context, unavailable), { value: [], status: 'memory' });
  assert.equal(writeHypotheses(context, [], store).status, 'empty');
  assert.equal(store.data.size, 0);
  assert.equal(writeHypotheses({ ...context, ownerUid: '' }, [note], store).status, 'memory');
  assert.equal(store.data.size, 0);
});

function harness(store = storage()) {
  const source = ts.createSourceFile('useHypothesisNotebook.js', readFileSync(new URL('../src/components/game/investigation/useHypothesisNotebook.js', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const code = ts.transpileModule(source.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(source).replace(/^export /, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const slots = [];
  let cursor = 0;
  const memo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((item, i) => !Object.is(item, slots[index].deps[i]))) slots[index] = { deps, value: factory() };
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
    readHypotheses: scope => readHypotheses(scope, store),
    writeHypotheses: (scope, value) => writeHypotheses(scope, value, store),
  };
  const hook = compileFunction(`${code}\nreturn useHypothesisNotebook;`, Object.keys(bindings))(...Object.values(bindings));
  return { store, render(scope = context) { cursor = 0; return hook(scope); } };
}

test('the live notebook hook restores on refresh, composes rapid edits and ignores callbacks from a prior owner or visit', () => {
  const app = harness();
  const firstVisit = app.render();
  firstVisit.setValue(previous => [...previous, note]);
  firstVisit.setValue(previous => [...previous, { ...note, b: 'c_03' }]);
  assert.equal(app.render().value.length, 2);
  assert.deepEqual(harness(app.store).render().value, app.render().value);
  const otherContext = { ...context, ownerUid: 'detective-b' };
  assert.deepEqual(app.render(otherContext).value, [], 'owner change must hide old notes on its first render');
  app.render(otherContext).setValue([{ ...note, note: 'Other owner.' }]);
  const returned = app.render();
  assert.equal(returned.value.length, 2);
  returned.setValue([{ ...note, note: 'Latest visit.' }]);
  firstVisit.setValue([]);
  assert.equal(app.render().value[0].note, 'Latest visit.');
  assert.equal(readHypotheses(otherContext, app.store).value[0].note, 'Other owner.');
});
