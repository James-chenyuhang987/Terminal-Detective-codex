import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {
  emptySpatialWorkspace, normalizeSpatialWorkspace, readSpatialWorkspace, writeSpatialWorkspace,
  normalizeReconstructionDraft, readReconstructionDraft, writeReconstructionDraft,
  normalizeLinkDraft, readLinkDraft, writeLinkDraft,
} from '../src/game/runWorkspace.js';
import { restoreSpatial, validateTheaterManifest } from '../src/game/theaterWorld.js';

const context = { ownerUid: 'owner-a', runId: 'run-a', caseId: 'Lvl_01' };
const puzzleContext = { ...context, puzzleId: 'timeline' };
const roomKey = JSON.stringify([context.caseId, 'office']);
const pose = { position: [1, 0, 2], rotationY: 1, yaw: 2, pitch: .6 };
function storage() {
  const data = new Map(); let writes = 0;
  return { data, get writes() { return writes; }, getItem: key => data.get(key) ?? null,
    setItem: (key, raw) => { writes++; data.set(key, raw); }, removeItem: key => data.delete(key) };
}

test('spatial workspaces persist only room positions and angles, isolate same-case saves and never restore controls', () => {
  const store = storage();
  const other = { ...context, runId: 'run-b' };
  const value = { arrived: true, rooms: { [roomKey]: { ...pose, velocity: [9, 9], sprinting: true, walking: true } },
    keys: { forward: true }, reward: { gold: 999 }, run: { AP: 999 } };
  assert.equal(writeSpatialWorkspace(context, value, store).status, 'saved');
  assert.equal(writeSpatialWorkspace(other, { arrived: false, rooms: { [roomKey]: { ...pose, position: [-1, 0, -2] } } }, store).status, 'saved');
  assert.deepEqual(readSpatialWorkspace(context, store).value, { arrived: true, rooms: { [roomKey]: pose } });
  assert.deepEqual(readSpatialWorkspace(other, store).value.rooms[roomKey].position, [-1, 0, -2]);
  assert.deepEqual(readSpatialWorkspace({ ...context, ownerUid: 'owner-b' }, store).value, emptySpatialWorkspace());
  assert.deepEqual(readSpatialWorkspace({ ...context, caseId: 'Lvl_02' }, store).value, emptySpatialWorkspace());
  assert.doesNotMatch(JSON.stringify([...store.data.values()]), /velocity|sprinting|walking|keys|reward|AP/);
  const before = store.writes;
  writeSpatialWorkspace(context, value, store);
  assert.equal(store.writes, before, 'unchanged periodic snapshots do not write storage again');
});

test('restored positions still use scene boundaries and collision checks; malformed snapshots cannot inject motion', () => {
  const manifest = validateTheaterManifest(JSON.parse(readFileSync(new URL('../public/assets/theater/manifest.json', import.meta.url), 'utf8')));
  const room = manifest.scenes.office;
  const normalized = normalizeSpatialWorkspace({ arrived: true, rooms: {
    [roomKey]: { ...pose, position: [999, 9, 999], yaw: 1_000, pitch: -9 },
    [JSON.stringify(['Lvl_02', 'office'])]: pose,
    malformed: pose,
    [JSON.stringify([context.caseId, 'bad'])]: { ...pose, position: [NaN, 0, 0] },
  } }, context.caseId);
  assert.equal(Object.keys(normalized.rooms).length, 1);
  const restored = restoreSpatial(normalized.rooms[roomKey], room);
  assert.deepEqual(restored.position, room.spawn);
  assert.equal(restored.pitch, .35);
  assert.ok(Number.isFinite(restored.yaw) && Math.abs(restored.yaw) < Math.PI * 2);
  assert.deepEqual(Object.keys(restored).sort(), ['pitch', 'position', 'rotationY', 'yaw']);
});

test('damaged, oversized, foreign and unavailable local workspaces fall back to a safe empty scene', () => {
  const store = storage(); writeSpatialWorkspace(context, { rooms: { [roomKey]: pose } }, store);
  const [key, raw] = [...store.data][0];
  for (const bad of ['{broken', 'x'.repeat(32_769), JSON.stringify({ ...JSON.parse(raw), owner_uid: 'owner-b' }),
    JSON.stringify({ ...JSON.parse(raw), run_id: 'other-run' }), JSON.stringify({ ...JSON.parse(raw), version: 2 })]) {
    store.data.set(key, bad);
    assert.deepEqual(readSpatialWorkspace(context, store), { value: emptySpatialWorkspace(), status: 'memory' });
  }
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readSpatialWorkspace(context, blocked).status, 'memory');
  assert.equal(writeSpatialWorkspace(context, { rooms: { [roomKey]: pose } }, blocked).status, 'memory');
  assert.equal(writeSpatialWorkspace({ ...context, ownerUid: '' }, {}, store).status, 'memory');
});

test('reconstruction persists bounded personal selections and measurements without copying authority or answers', () => {
  const store = storage();
  const value = { answerIds: ['enter', 'clone', 'enter', '<bad>'], confirmed: true, correct: ['secret'],
    view: { activeId: 'clone', offsets: { shaft: -90 }, alignments: { clone: 6 }, frame: 18, showReference: false,
      authority: { AP: 999 }, label: 'private prose' } };
  const normalized = normalizeReconstructionDraft(value);
  assert.deepEqual(normalized, { answerIds: ['enter', 'clone'], view: { activeId: 'clone', offsets: { shaft: -90 },
    alignments: { clone: 6 }, frame: 18, showReference: false } });
  assert.equal(writeReconstructionDraft(puzzleContext, value, store).status, 'saved');
  assert.deepEqual(readReconstructionDraft(puzzleContext, store).value, normalized);
  for (const changed of [{ ownerUid: 'owner-b' }, { runId: 'run-b' }, { puzzleId: 'different' }]) {
    assert.deepEqual(readReconstructionDraft({ ...puzzleContext, ...changed }, store).value, { answerIds: [], view: {} });
  }
  assert.doesNotMatch(JSON.stringify([...store.data.values()]), /confirmed|correct|authority|private prose|AP/);
  assert.equal(writeReconstructionDraft(puzzleContext, { answerIds: [], view: {} }, store).status, 'empty');
  assert.equal(store.data.size, 0);
  const bounded = normalizeReconstructionDraft({ answerIds: Array.from({ length: 99 }, (_, n) => `item-${n}`),
    view: { frame: Infinity, offsets: { clock: 999_999, broken: NaN } } });
  assert.equal(bounded.answerIds.length, 32);
  assert.deepEqual(bounded.view, { offsets: { clock: 3_600 } });
});

test('unfinished link selections restore separately for each save without restoring a judgment', () => {
  const store = storage();
  const value = { relation: 'precedes', firstClue: 'c_01', secondClue: 'c_03', valid: true, truth_fragments: 999 };
  const expected = { relation: 'precedes', firstClue: 'c_01', secondClue: 'c_03' };
  assert.equal(writeLinkDraft(context, value, store).status, 'saved');
  assert.deepEqual(readLinkDraft(context, store).value, expected);
  for (const next of [{ ...context, ownerUid: 'owner-b' }, { ...context, runId: 'run-b' }, { ...context, caseId: 'Lvl_02' }]) {
    assert.deepEqual(readLinkDraft(next, store).value, normalizeLinkDraft(null));
  }
  assert.doesNotMatch(JSON.stringify([...store.data.values()]), /valid|truth_fragments/);
  assert.deepEqual(normalizeLinkDraft({ relation: 'invented', firstClue: '<bad>', secondClue: [] }), normalizeLinkDraft(null));
});

test('reconstruction and link storage failures retain sanitized edits in memory and corrupt envelopes are ignored', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const draft = { answerIds: ['enter'], view: {} };
  assert.equal(writeReconstructionDraft(puzzleContext, draft, blocked).status, 'memory');
  assert.deepEqual(writeReconstructionDraft(puzzleContext, draft, blocked).value, draft);
  assert.equal(readReconstructionDraft(puzzleContext, blocked).status, 'memory');
  assert.equal(writeLinkDraft(context, { firstClue: 'c_01' }, blocked).status, 'memory');
  assert.equal(readLinkDraft(context, blocked).status, 'memory');
  const store = storage(); writeReconstructionDraft(puzzleContext, draft, store);
  const key = [...store.data.keys()][0];
  for (const raw of ['{bad', 'x'.repeat(32_769), JSON.stringify({ version: 1, owner_uid: 'owner-b', run_id: context.runId, puzzle_id: puzzleContext.puzzleId, draft })]) {
    store.data.set(key, raw);
    assert.deepEqual(readReconstructionDraft(puzzleContext, store), { value: { answerIds: [], view: {} }, status: 'memory' });
  }
});

function spatialHookHarness(store = storage()) {
  const source = ts.createSourceFile('useTheaterSpatial.js', readFileSync(new URL('../src/components/game/investigation/useTheaterSpatial.js', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const code = ts.transpileModule(source.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(source).replace(/^export /, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let slots = []; const effects = []; const windows = new Map(); const documents = new Map();
  let cursor = 0; let periodic;
  const same = (left, right) => left && right && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const bindings = {
    useMemo: (factory, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() }; return slots[i].value; },
    useState: initial => { const i = cursor++; slots[i] ||= { value: initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useEffect: (fn, deps) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) {
      const before = slots[i]; slots[i] = { deps }; effects.push(() => { before?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
    readSpatialWorkspace: scope => readSpatialWorkspace(scope, store),
    normalizeSpatialWorkspace,
    writeSpatialWorkspace: (scope, value) => writeSpatialWorkspace(scope, value, store),
    window: { setInterval: fn => { periodic = fn; return 1; }, clearInterval() {},
      addEventListener: (key, fn) => windows.set(key, fn), removeEventListener: key => windows.delete(key) },
    document: { hidden: false, addEventListener: (key, fn) => documents.set(key, fn), removeEventListener: key => documents.delete(key) },
  };
  const hook = compileFunction(`${code}\nreturn useTheaterSpatial;`, Object.keys(bindings))(...Object.values(bindings));
  return { store, render(scope = context) { cursor = 0; const value = hook(scope); effects.splice(0).forEach(fn => fn()); return value; },
    remount(scope = context) {
      const previous = slots; slots = []; cursor = 0;
      // React renders the new keyed view before the old passive cleanup runs.
      const value = hook(scope);
      previous.forEach(slot => slot?.cleanup?.());
      effects.splice(0).forEach(fn => fn());
      return value;
    },
    pagehide() { windows.get('pagehide')?.(); }, periodic() { periodic?.(); }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('the real spatial hook checkpoints live memory before page unload and scopes late old-view cleanup correctly', () => {
  const app = spatialHookHarness();
  const first = app.render();
  first.spatialRef.current.rooms[roomKey] = pose;
  first.spatialRef.current.arrived = true;
  app.pagehide();
  assert.deepEqual(readSpatialWorkspace(context, app.store).value.rooms[roomKey], pose);
  const otherScope = { ...context, ownerUid: 'owner-b', runId: 'run-b' };
  const second = app.render(otherScope);
  assert.deepEqual(second.spatialRef.current, emptySpatialWorkspace(), 'the new owner is empty on its first render');
  first.spatialRef.current.rooms[roomKey] = { ...pose, position: [3, 0, 4] };
  second.spatialRef.current.rooms[roomKey] = { ...pose, position: [-3, 0, -4] };
  app.periodic(); app.unmount();
  assert.deepEqual(readSpatialWorkspace(otherScope, app.store).value.rooms[roomKey].position, [-3, 0, -4]);
  assert.deepEqual(readSpatialWorkspace(context, app.store).value.rooms[roomKey].position, pose.position,
    'a detached scene reference cannot affect the active owner or autosave again');
  const reloaded = spatialHookHarness(app.store);
  assert.deepEqual(reloaded.render(context).spatialRef.current.rooms[roomKey].position, pose.position);
  reloaded.unmount();
});

test('briefing flag changes keep the same live spatial reference without rereading an older checkpoint', () => {
  const store = storage(); let reads = 0;
  const getItem = store.getItem;
  store.getItem = key => { reads++; return getItem(key); };
  const app = spatialHookHarness(store);
  const first = app.render({ ...context, narrativeBriefed: true });
  first.spatialRef.current.rooms[roomKey] = pose;
  app.periodic();
  const latest = { ...pose, position: [3, 0, 4] };
  first.spatialRef.current.rooms[roomKey] = latest;
  const before = reads;
  for (const narrativeBriefed of [false, true, false]) {
    const rerendered = app.render({ ...context, narrativeBriefed });
    assert.strictEqual(rerendered.spatialRef, first.spatialRef);
    assert.deepEqual(rerendered.spatialRef.current.rooms[roomKey], latest);
    assert.equal(rerendered.spatialRef.current.arrived, true);
  }
  assert.equal(reads, before, 'briefing presentation changes must not read or persist a replacement workspace');
  app.pagehide();
  assert.deepEqual(readSpatialWorkspace(context, store).value.rooms[roomKey], latest);
  app.unmount();
});

test('an unchanged second tab cannot overwrite the latest position on its timer, pagehide or cleanup', () => {
  const store = storage();
  writeSpatialWorkspace(context, { arrived: true, rooms: { [roomKey]: pose } }, store);
  const firstTab = spatialHookHarness(store);
  const secondTab = spatialHookHarness(store);
  const first = firstTab.render();
  secondTab.render();
  const moved = { ...pose, position: [3, 0, 4] };
  first.spatialRef.current.rooms[roomKey] = moved;
  firstTab.periodic();
  const writes = store.writes;
  secondTab.periodic();
  secondTab.pagehide();
  secondTab.unmount();
  assert.deepEqual(readSpatialWorkspace(context, store).value.rooms[roomKey], moved,
    'a view that has not changed its own position must not replace another tab\'s checkpoint');
  assert.equal(store.writes, writes);
  firstTab.unmount();
});

test('reopening the same save uses the last live position before the old view cleanup writes its checkpoint', () => {
  const app = spatialHookHarness();
  const first = app.render();
  first.spatialRef.current.rooms[roomKey] = pose;
  app.periodic();
  const latest = { ...pose, position: [3, 0, 4] };
  first.spatialRef.current.rooms[roomKey] = latest;
  const restored = app.remount();
  assert.notStrictEqual(restored.spatialRef, first.spatialRef, 'each view keeps an independent scene reference');
  assert.deepEqual(restored.spatialRef.current.rooms[roomKey], latest,
    'a rapid same-save restore must not rewind to the previous one-second checkpoint');
  first.spatialRef.current.rooms[roomKey] = pose;
  restored.spatialRef.current.rooms[roomKey] = { ...latest, position: [4, 0, 5] };
  app.pagehide();
  assert.deepEqual(readSpatialWorkspace(context, app.store).value.rooms[roomKey].position, [4, 0, 5]);
  app.unmount();
});

test('a replacement view keeps an unsaved live position pending until browser storage recovers', () => {
  const store = storage();
  const setItem = store.setItem;
  let denied = true;
  store.setItem = (key, value) => {
    if (denied) throw new Error('Temporary storage quota failure');
    setItem(key, value);
  };
  const app = spatialHookHarness(store);
  const first = app.render();
  first.spatialRef.current.rooms[roomKey] = pose;
  app.periodic();
  assert.equal(app.render().status, 'memory');
  const restored = app.remount();
  assert.deepEqual(restored.spatialRef.current.rooms[roomKey], pose);
  denied = false;
  app.periodic();
  assert.deepEqual(readSpatialWorkspace(context, store).value.rooms[roomKey], pose);
  assert.equal(app.render().status, 'saved');
  app.unmount();
});
