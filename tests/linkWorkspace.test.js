import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { hypothesisKey } from '../src/game/hypothesisNotebook.js';

let language = 'zh';
function loadComponent(path, imports, document = {}, window = {}, ResizeObserver) {
  const source = readFileSync(new URL(`../src/components/game/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports', 'document', 'window', 'ResizeObserver'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected link workspace dependency ${id}`);
    return imports[id];
  }, exports, document, window, ResizeObserver);
  return exports;
}
const imports = {
  react: { ...React, default: React },
  '@/lib/lang.jsx': { useLang: () => ({ lang: language }) },
  '@/components/ui/Icon': { default: () => null },
  '@/components/ui/palette': { noirColor: value => value },
  '@/game/investigationChoices': { localizedInvestigationText },
  '@/game/investigationChoices.js': { localizedInvestigationText },
  './evidenceArchive.css': {},
  './hypothesisNotebook.css': {},
  '@/game/hypothesisNotebook': { hypothesisKey },
};
const reference = loadComponent('investigation/EvidenceReference.jsx', imports);
const notebook = loadComponent('investigation/HypothesisNotebook.jsx', imports).default;

function instance(props) {
  const state = [];
  const refs = [];
  let stateCursor = 0;
  let refCursor = 0;
  let hoverId = '';
  let targetInside = true;
  const effects = [];
  const resizeCallbacks = [];
  const box = { scrollTop: 0, scrollLeft: 0,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 200 }),
    contains: node => node.inside,
  };
  const hooks = { ...React, default: React,
    useState(initial) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useLayoutEffect: callback => { effects.push(callback); },
  };
  const dom = { elementFromPoint: () => hoverId ? { closest: () => ({ getAttribute: () => hoverId, inside: targetInside }) } : null };
  const fakeWindow = { addEventListener() {}, removeEventListener() {} };
  class FakeResizeObserver {
    constructor(callback) { resizeCallbacks.push(callback); }
    observe() {}
    disconnect() {}
  }
  const LinkBoard = loadComponent('LinkBoard.jsx', { ...imports, react: hooks,
    '@/components/game/investigation/HypothesisNotebook': { default: notebook },
    '@/components/game/investigation/EvidenceReference': reference }, dom, fakeWindow, FakeResizeObserver).default;
  return {
    render() {
      stateCursor = 0;
      refCursor = 0;
      effects.length = 0;
      const tree = LinkBoard(props);
      const graph = descendants(tree, node => typeof node.props.onPointerMove === 'function')[0];
      graph.ref.current = box;
      descendants(tree, node => Boolean(node.props['data-clue-id'])).forEach((row, index) => row.ref({
        getBoundingClientRect: () => ({ left: 20 - box.scrollLeft, top: 40 + index * 70 - box.scrollTop, width: 260, height: 50 }),
      }));
      effects.forEach(callback => callback());
      return tree;
    },
    hover(id, inside = true) { hoverId = id; targetInside = inside; },
    scroll(top, left = 0) { box.scrollTop = top; box.scrollLeft = left; },
    resize() { resizeCallbacks.forEach(callback => callback()); },
  };
}

function descendants(element, predicate) {
  if (!React.isValidElement(element)) return [];
  return [
    ...(predicate(element) ? [element] : []),
    ...React.Children.toArray(element.props.children).flatMap(child => descendants(child, predicate)),
  ];
}
function text(element) {
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (!React.isValidElement(element)) return '';
  return React.Children.toArray(element.props.children).map(text).join('');
}
function button(tree, label) {
  const found = descendants(tree, node => node.type === 'button' && text(node) === label)[0];
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
function propsFor(lang = language) {
  const zh = lang === 'zh';
  const calls = [];
  const props = {
    clues: [
      { clue_id: 'first', keyword: zh ? '门禁原始记录' : 'Original access record',
        description: zh ? '硬件签章原文第一行。\n第二行保留完整时间记录。' : 'Original hardware signature, first line.\nThe second line preserves every timestamp.' },
      { clue_id: 'second', keyword: zh ? '已封存样本' : 'Preserved sample',
        description: zh ? '样本保存在独立的密封袋中。' : 'The sample remains in a separate sealed bag.' },
      { clue_id: 'third', keyword: zh ? '现场照片' : 'Scene photograph', description: zh ? '现场边界记录。' : 'The scene boundary record.' },
      { clue_id: 'unseen', keyword: 'UNREVEALED_NAME', description: 'UNREVEALED_RECORD' },
    ],
    unlockedIds: ['first', 'second', 'third'], linkedPairs: [], isChecking: false, relationsEnabled: true,
    draft: { relation: 'supports', firstClue: '', secondClue: '' }, feedback: null,
    onDraftChange(next) { props.draft = next; props.feedback = null; },
    onLink(...args) { calls.push(args); },
    sources: { first: zh ? '北门读卡器' : 'North gate card reader', unseen: 'UNREVEALED_SOURCE' },
    expertNotes: { first: zh ? '按硬件签章分别整理。' : 'Group the hardware signatures separately.', unseen: 'UNREVEALED_EXPERT_NOTE' },
  };
  return { props, calls };
}
function select(tree, label, value) {
  const field = descendants(tree, node => node.type === 'select' && node.props['aria-label'] === label)[0];
  assert.ok(field, label);
  field.props.onChange({ target: { value } });
}
function feedbackNode(tree) {
  return descendants(tree, node => String(node.props.className).startsWith('td-link-feedback'))[0];
}

test('controlled clue and relation selections survive a link workspace remount without submitting', () => {
  for (language of ['zh', 'en']) {
    const { props, calls } = propsFor();
    const mounted = instance(props);
    select(mounted.render(), language === 'zh' ? '证据一' : 'First clue', 'first');
    select(mounted.render(), language === 'zh' ? '证据二' : 'Second clue', 'second');
    button(mounted.render(), language === 'zh' ? '先于' : 'Precedes').props.onClick();
    assert.deepEqual(props.draft, { relation: 'precedes', firstClue: 'first', secondClue: 'second' });
    const remounted = instance(props).render();
    assert.deepEqual(descendants(remounted, node => node.type === 'select').map(node => node.props.value), ['first', 'second']);
    assert.equal(button(remounted, language === 'zh' ? '先于' : 'Precedes').props['aria-pressed'], true);
    assert.equal(calls.length, 0, 'editing and remounting a hypothesis must never send a verification');
  }
});

test('saving and reloading a personal hypothesis never verifies it until the player explicitly submits', () => {
  for (language of ['zh', 'en']) {
    const { props, calls } = propsFor();
    const saved = [];
    const removed = [];
    props.onSaveHypothesis = item => { saved.push(item); props.hypotheses = [item]; };
    props.onRemoveHypothesis = item => removed.push(item);
    props.hypothesisStatus = 'saved';
    const app = instance(props);
    select(app.render(), language === 'zh' ? '证据一' : 'First clue', 'first');
    select(app.render(), language === 'zh' ? '证据二' : 'Second clue', 'second');
    const note = descendants(app.render(), node => node.type === 'textarea')[0];
    note.props.onChange({ target: { value: 'Compare the source clocks.' } });
    button(app.render(), language === 'zh' ? '先保存为待核实假说 · 免费' : 'Save unverified hypothesis · Free').props.onClick();
    assert.deepEqual(saved, [{ a: 'first', b: 'second', relation: 'supports', note: 'Compare the source clocks.' }]);
    assert.equal(calls.length, 0, 'saving cannot send a command, charge AP or add confusion');
    const savedNotebook = descendants(app.render(), node => node.type === notebook)[0];
    savedNotebook.props.onSelect(saved[0]);
    assert.equal(calls.length, 0, 'loading the full evidence comparison cannot auto-submit it');
    assert.equal(descendants(app.render(), node => node.type === 'textarea')[0].props.value, saved[0].note);
    const content = notebook(savedNotebook.props);
    button(content, language === 'zh' ? '移除' : 'Remove').props.onClick();
    assert.deepEqual(removed, saved);
    button(app.render(), language === 'zh' ? '核验关系' : 'Verify relation').props.onClick();
    assert.deepEqual(calls, [['first', 'second', 'supports']]);
    props.isChecking = true;
    assert.equal(button(app.render(), language === 'zh' ? '先保存为待核实假说 · 免费' : 'Save unverified hypothesis · Free').props.disabled, true);
  }
});

test('repeated confirmed relations stay local and their current explanation overrides an older rejected relation', () => {
  for (language of ['zh', 'en']) {
    const { props, calls } = propsFor();
    props.draft = { relation: 'supports', firstClue: 'second', secondClue: 'first' };
    props.linkedPairs = [{ a: 'first', b: 'second', valid: true, relation_type: 'supports',
      label: { zh: '已确认的两份记录互相支持。', en: 'The two confirmed records support each other.' } }];
    const oldFeedback = { valid: false, text: 'OLDER_REJECTED_RELATION' };
    props.feedback = oldFeedback;
    // Preserve the parent prop to exercise local result precedence even before
    // the parent's own feedback-clearing update is delivered.
    props.onDraftChange = next => { props.draft = next; };
    const mounted = instance(props);
    button(mounted.render(), language === 'zh' ? '核验关系' : 'Verify relation').props.onClick();
    const node = feedbackNode(mounted.render());
    assert.ok(node.props.className.includes('is-valid'));
    assert.ok(text(node).includes(props.linkedPairs[0].label[language]));
    assert.equal(text(node).includes(oldFeedback.text), false);
    assert.equal(calls.length, 0, 'a repeated valid symmetric relation must not charge or call the authority again');
  }
});

test('the ordering relation preserves direction and permits a different relation for the same known clues', () => {
  language = 'en';
  const { props, calls } = propsFor();
  props.draft = { relation: 'precedes', firstClue: 'second', secondClue: 'first' };
  props.linkedPairs = [{ a: 'first', b: 'second', valid: true, relation_type: 'precedes', label: { en: 'First precedes second.' } }];
  const mounted = instance(props);
  button(mounted.render(), 'Verify relation').props.onClick();
  assert.deepEqual(calls, [['second', 'first', 'precedes']], 'reversing time order is a separate player hypothesis');
  button(mounted.render(), 'Contradicts').props.onClick();
  button(mounted.render(), 'Verify relation').props.onClick();
  assert.deepEqual(calls[1], ['second', 'first', 'contradicts']);
});

test('selected clue references retain their complete public record, source and earned observation in both languages', () => {
  for (language of ['zh', 'en']) {
    const { props, calls } = propsFor();
    props.draft = { relation: 'supports', firstClue: 'first', secondClue: 'second' };
    const markup = renderToStaticMarkup(instance(props).render());
    const references = [...markup.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)].map(match => match[1]);
    assert.equal(references.length, 2);
    for (const clue of props.clues.slice(0, 2)) assert.ok(references.some(record => record.includes(clue.description)));
    assert.ok(references[0].includes(props.sources.first));
    assert.ok(references[0].includes(props.expertNotes.first));
    references.forEach(record => {
      assert.match(record, /^<summary>/);
      assert.doesNotMatch(record, /<button|aria-pressed|onclick/i, 'reading must remain independent from verifying a hypothesis');
    });
    assert.equal(calls.length, 0);
  }
});

test('only the drag handle prevents default, while clue bodies and the workspace retain vertical scrolling', () => {
  language = 'en';
  const { props, calls } = propsFor();
  const mounted = instance(props);
  let tree = mounted.render();
  const rows = descendants(tree, node => Boolean(node.props['data-clue-id']));
  assert.ok(rows.every(row => !row.props.onPointerDown), 'touching clue text must not start a drag or swallow scrolling');
  const graph = descendants(tree, node => Boolean(node.props.onPointerMove))[0];
  assert.equal(graph.props.style.touchAction, 'pan-y');
  assert.equal(tree.props.style.overflowY, 'auto');
  const handle = descendants(rows[0], node => node.type === 'button')[0];
  assert.equal(handle.props.style.touchAction, 'none');
  let prevented = false;
  handle.props.onPointerDown({ preventDefault() { prevented = true; }, clientX: 20, clientY: 30 });
  assert.equal(prevented, true);
  mounted.hover('second');
  tree = mounted.render();
  descendants(tree, node => Boolean(node.props.onPointerMove))[0].props.onPointerMove({ clientX: 30, clientY: 40 });
  tree = mounted.render();
  descendants(tree, node => Boolean(node.props.onPointerUp))[0].props.onPointerUp({ clientX: 30, clientY: 40 });
  assert.deepEqual(props.draft, { relation: 'supports', firstClue: 'first', secondClue: 'second' },
    'dragged clues must become the controlled selection used for full record review');
  assert.deepEqual(calls, [['first', 'second', 'supports']]);
});

test('unrevealed clues cannot enter options, drag rows or full references even if a stale draft names them', () => {
  language = 'en';
  const { props } = propsFor();
  props.draft = { relation: 'supports', firstClue: 'unseen', secondClue: 'first' };
  const tree = instance(props).render();
  const markup = renderToStaticMarkup(tree);
  assert.doesNotMatch(markup, /UNREVEALED_NAME|UNREVEALED_RECORD|UNREVEALED_SOURCE|UNREVEALED_EXPERT_NOTE/);
  assert.deepEqual(descendants(tree, node => Boolean(node.props['data-clue-id'])).map(node => node.props['data-clue-id']), ['first', 'second', 'third']);
  assert.equal((markup.match(/<details\b/g) || []).length, 1);
});

test('cancelled, escaped and lost-capture drags never verify a stale hovered clue', () => {
  language = 'en';
  for (const cancellation of ['onPointerCancel', 'onLostPointerCapture', 'escape']) {
    const { props, calls } = propsFor();
    const mounted = instance(props);
    let tree = mounted.render();
    const handle = descendants(tree, node => node.type === 'button' && node.props.onPointerDown)[0];
    const captured = [];
    const captureTarget = {
      setPointerCapture: id => captured.push(id),
      hasPointerCapture: id => captured.includes(id),
      releasePointerCapture: id => captured.splice(captured.indexOf(id), 1),
    };
    handle.props.onPointerDown({ preventDefault() {}, pointerId: 7, button: 0, clientX: 30, clientY: 40, currentTarget: captureTarget });
    assert.deepEqual(captured, [7], 'capture retains the release when a mouse or touch leaves the handle');
    mounted.hover('second');
    tree = mounted.render();
    let graph = descendants(tree, node => Boolean(node.props.onPointerMove))[0];
    graph.props.onPointerMove({ pointerId: 7, clientX: 30, clientY: 110 });
    tree = mounted.render();
    graph = descendants(tree, node => Boolean(node.props.onPointerMove))[0];
    assert.ok(descendants(tree, node => node.type === 'line').length > 0);
    if (cancellation === 'escape') graph.props.onKeyDown({ key: 'Escape' });
    else graph.props[cancellation]({ pointerId: 7 });
    tree = mounted.render();
    assert.equal(descendants(tree, node => node.type === 'line').length, 0, `${cancellation} must clear the drag preview`);
    descendants(tree, node => Boolean(node.props.onPointerUp))[0].props.onPointerUp({ pointerId: 7, clientX: 30, clientY: 110 });
    assert.equal(calls.length, 0);
    assert.deepEqual(captured, []);
    assert.deepEqual(props.draft, { relation: 'supports', firstClue: '', secondClue: '' });
  }
});

test('a drop verifies the actual release in this board rather than a previous hover or another pointer', () => {
  language = 'en';
  for (const [releaseId, inside, expected] of [['', true, []], ['second', false, []], ['third', true, [['first', 'third', 'supports']]]]) {
    const { props, calls } = propsFor();
    const mounted = instance(props);
    let tree = mounted.render();
    const handle = descendants(tree, node => node.type === 'button' && node.props.onPointerDown)[0];
    handle.props.onPointerDown({ preventDefault() {}, pointerId: 2, button: 0, clientX: 30, clientY: 40 });
    mounted.hover('second');
    tree = mounted.render();
    let graph = descendants(tree, node => Boolean(node.props.onPointerMove))[0];
    graph.props.onPointerMove({ pointerId: 2, clientX: 30, clientY: 110 });
    tree = mounted.render();
    graph = descendants(tree, node => Boolean(node.props.onPointerMove))[0];
    assert.equal(graph.props.onPointerLeave, undefined, 'leaving the board must never submit the last hovered clue');
    graph.props.onPointerUp({ pointerId: 8, clientX: 30, clientY: 110 });
    assert.equal(calls.length, 0, 'a second finger cannot finish the first drag');
    mounted.hover(releaseId, inside);
    graph.props.onPointerUp({ pointerId: 2, clientX: 30, clientY: 180 });
    assert.deepEqual(calls, expected);
  }
});

test('secondary buttons and non-primary touches cannot start a clue verification drag', () => {
  language = 'en';
  for (const values of [{ button: 2 }, { button: 0, isPrimary: false }]) {
    const { props, calls } = propsFor();
    const mounted = instance(props);
    let tree = mounted.render();
    const handle = descendants(tree, node => node.type === 'button' && node.props.onPointerDown)[0];
    handle.props.onPointerDown({ preventDefault() { assert.fail('native secondary-pointer behavior must be retained'); },
      pointerId: 4, clientX: 30, clientY: 40, ...values });
    mounted.hover('second');
    tree = mounted.render();
    descendants(tree, node => Boolean(node.props.onPointerUp))[0].props.onPointerUp({ pointerId: 4, clientX: 30, clientY: 110 });
    assert.equal(descendants(tree, node => node.type === 'line').length, 0);
    assert.equal(calls.length, 0);
  }
});

test('existing links are measured after mount and remain attached to clues when the board is scrolled', () => {
  language = 'en';
  const { props } = propsFor();
  props.linkedPairs = [{ a: 'first', b: 'second', valid: true, relation_type: 'supports' }];
  const mounted = instance(props);
  mounted.render();
  let tree = mounted.render();
  const positions = root => descendants(root, node => node.type === 'line').map(line =>
    ['x1', 'y1', 'x2', 'y2'].map(key => line.props[key]));
  assert.deepEqual(positions(tree), [[140, 45, 140, 115]], 'initial links need a layout measurement after refs are assigned');
  mounted.scroll(80, 15);
  mounted.resize();
  tree = mounted.render();
  assert.deepEqual(positions(tree), [[140, 45, 140, 115]], 'SVG coordinates belong to the scrollable content, not the viewport');
  descendants(tree, node => node.type === 'button' && node.props.onPointerDown)[0].props.onPointerDown({
    preventDefault() {}, pointerId: 1, button: 0, clientX: 30, clientY: 45,
  });
  tree = mounted.render();
  assert.deepEqual(positions(tree)[1], [140, 45, 35, 105], 'the pointer endpoint uses the same scroll coordinates as the clue centers');
});

test('a repeated relation explanation follows a language change without another authority call', () => {
  language = 'zh';
  const { props, calls } = propsFor();
  props.draft = { relation: 'supports', firstClue: 'first', secondClue: 'second' };
  props.linkedPairs = [{ a: 'first', b: 'second', valid: true, relation_type: 'supports', label: {
    zh: '这两份记录已相互印证。', en: 'These records corroborate one another.',
  } }];
  const mounted = instance(props);
  button(mounted.render(), '核验关系').props.onClick();
  assert.match(text(feedbackNode(mounted.render())), /这两份记录已相互印证/);
  language = 'en';
  const explanation = text(feedbackNode(mounted.render()));
  assert.match(explanation, /These records corroborate one another/);
  assert.doesNotMatch(explanation, /这两份记录已相互印证/);
  assert.equal(calls.length, 0);
});

test('stale draft ids cannot submit an unknown clue even through a retained callback', () => {
  language = 'en';
  const { props, calls } = propsFor();
  props.draft = { relation: 'supports', firstClue: 'unseen', secondClue: 'first' };
  const verify = button(instance(props).render(), 'Verify relation');
  assert.equal(verify.props.disabled, true);
  verify.props.onClick();
  assert.equal(calls.length, 0);
});
