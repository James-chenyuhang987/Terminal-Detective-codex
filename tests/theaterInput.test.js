import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { isViewportKeyTarget } from '../src/game/theaterWorld.js';

function readSource(name) {
  return ts.createSourceFile(name, readFileSync(new URL(`../src/components/game/theater/${name}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}
const scene = readSource('TheaterScene.jsx');
const presentation = readSource('TheaterPresentation.jsx');
function findNodes(root, predicate) {
  const nodes = [];
  const visit = node => { if (predicate(node)) nodes.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return nodes;
}
function evaluate(node, bindings) {
  const { outputText } = ts.transpileModule(`const result = (${node.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
}
function declaration(name) {
  return findNodes(scene, node => ts.isVariableDeclaration(node) && node.name.getText() === name)[0].initializer;
}
function events() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); if (!listeners.get(name)?.size) listeners.delete(name); },
    dispatch(name, event = {}) { for (const callback of listeners.get(name) || []) callback(event); },
  };
}
function harness() {
  const document = { ...events(), hidden: false, focused: true, hasFocus() { return this.focused; } };
  const window = events();
  const canvas = events();
  const captured = new Set();
  const viewport = {
    ...events(), tagName: 'DIV', closest: () => null,
    contains(target) { return target === this; },
    hasPointerCapture: id => captured.has(id),
    setPointerCapture: id => captured.add(id),
    releasePointerCapture: id => captured.delete(id),
    focus() { this.dispatch('focusin', { target: this }); },
  };
  const empty = evaluate(declaration('EMPTY_CONTROLS'), {});
  const controlsRef = { current: { ...empty } };
  const input = { current: { keys: { ...empty }, focused: false, windowActive: true, orbitX: 0, orbitY: 0, invalidate: null } };
  const live = { current: { paused: false, suspended: false } };
  let frames = 0;
  const cleanups = [];
  const bindings = {
    document, window, isViewportKeyTarget, EMPTY_CONTROLS: empty,
    KEY_DIRECTIONS: evaluate(declaration('KEY_DIRECTIONS'), {}),
    useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    useThree: () => ({ gl: { domElement: canvas }, invalidate: () => { frames++; } }),
  };
  for (const name of ['useViewportInput', 'RendererLifecycle']) {
    const fn = evaluate(findNodes(scene, node => ts.isFunctionDeclaration(node) && node.name?.text === name)[0], bindings);
    if (name === 'useViewportInput') fn({ current: viewport }, controlsRef, live, input, () => {});
    else fn({ live, input, suspended: false });
  }
  const button = findNodes(presentation, node => ts.isJsxOpeningElement(node) && node.tagName.getText() === 'button' && node.attributes.properties.some(attribute => attribute.name?.getText() === 'onLostPointerCapture'))[0];
  function handler(name, { movementPaused = false, ready = true, key = 'forward' } = {}) {
    const props = { controlsRef, movementPaused, ready, key };
    const start = findNodes(presentation, node => ts.isVariableDeclaration(node) && node.name.getText() === 'startMovement')[0];
    if (start) props.startMovement = evaluate(start.initializer, props);
    return evaluate(button.attributes.properties.find(attribute => attribute.name?.getText() === name).initializer.expression, props);
  }
  function event(overrides = {}) {
    return { button: 0, pointerId: 1, currentTarget: { setPointerCapture() {} }, preventDefault() { this.prevented = true; }, ...overrides };
  }
  function hideAndReturn() {
    document.hidden = true; document.focused = false;
    window.dispatch('blur'); document.dispatch('visibilitychange');
    document.hidden = false; document.focused = true;
    document.dispatch('visibilitychange'); window.dispatch('focus');
  }
  function pausePresentation() {
    const effect = findNodes(presentation, node => ts.isCallExpression(node) && node.expression.getText() === 'useEffect' && node.arguments[1]?.getText() === '[movementPaused]')[0].arguments[0];
    evaluate(effect, { movementPaused: true, controlsRef })();
  }
  return { document, window, viewport, canvas, input, live, controlsRef, handler, event, hideAndReturn, pausePresentation, frames: () => frames, cleanup: () => cleanups.reverse().forEach(cleanup => cleanup()) };
}

test('touch press after hide/show/focus explicitly resumes demand rendering without an extra viewport tap', () => {
  const h = harness();
  h.viewport.focus();
  h.viewport.dispatch('keydown', h.event({ code: 'KeyW', target: h.viewport }));
  h.controlsRef.current.left = true;
  h.input.current.orbitX = 40;
  h.hideAndReturn();
  assert.equal(h.input.current.windowActive, false, 'window focus alone cannot resume');
  assert.equal(h.input.current.keys.forward, false);
  assert.equal(h.controlsRef.current.left, false);
  assert.equal(h.input.current.orbitX, 0);
  const frames = h.frames();
  h.handler('onPointerDown')(h.event());
  assert.equal(h.controlsRef.current.forward, true);
  assert.equal(h.input.current.windowActive, true, 'visible focused touch press reactivates the renderer input');
  assert.equal(h.input.current.focused, false, 'touch need not steal focus into the viewport');
  assert.ok(h.frames() > frames, 'explicit control activation requests a demand frame');
  assert.equal(h.input.current.keys.forward, false, 'old keyboard input stays cleared');
  h.handler('onPointerUp')();
  assert.equal(h.controlsRef.current.forward, false);
  h.cleanup();
  assert.ok(!h.controlsRef.current.activate);
  for (const target of [h.viewport, h.canvas, h.document, h.window]) assert.equal(target.listeners.size, 0);
});

test('Space and Enter direction presses resume after blur; repeat events never restore held movement', () => {
  for (const key of [' ', 'Enter']) {
    const h = harness();
    h.handler('onKeyDown')(h.event({ key }));
    assert.equal(h.controlsRef.current.forward, true);
    h.hideAndReturn();
    h.handler('onKeyDown')(h.event({ key, repeat: true }));
    assert.equal(h.controlsRef.current.forward, false);
    assert.equal(h.input.current.windowActive, false);
    const frames = h.frames();
    const press = h.event({ key });
    h.handler('onKeyDown')(press);
    assert.equal(press.prevented, true);
    assert.equal(h.controlsRef.current.forward, true);
    assert.equal(h.input.current.windowActive, true);
    assert.ok(h.frames() > frames);
    h.handler('onKeyUp')();
    assert.equal(h.controlsRef.current.forward, false);
    h.cleanup();
  }
});

test('explicit controls reject hidden, unfocused, paused, suspended, loading and unavailable scenes', () => {
  for (const condition of ['hidden', 'unfocused', 'paused', 'suspended', 'movementPaused', 'loading', 'unmounted']) {
    const h = harness();
    h.hideAndReturn();
    if (condition === 'hidden') h.document.hidden = true;
    if (condition === 'unfocused') h.document.focused = false;
    if (condition === 'paused' || condition === 'suspended') h.live.current[condition] = true;
    if (condition === 'unmounted') h.cleanup();
    const options = { movementPaused: condition === 'movementPaused', ready: condition !== 'loading' };
    const frames = h.frames();
    h.handler('onPointerDown', options)(h.event());
    h.handler('onKeyDown', options)(h.event({ key: 'Enter' }));
    assert.equal(h.controlsRef.current.forward, false, condition);
    assert.equal(h.input.current.windowActive, false, condition);
    assert.equal(h.frames(), frames, condition);
    if (condition !== 'unmounted') h.cleanup();
  }
});

test('viewport keyboard focus resumes fresh presses only, and button typing is not intercepted', () => {
  const h = harness();
  h.viewport.focus();
  h.viewport.dispatch('keydown', h.event({ code: 'KeyW', target: h.viewport }));
  h.hideAndReturn();
  h.viewport.focus();
  assert.equal(h.input.current.windowActive, true);
  const staleRepeat = h.event({ code: 'ArrowUp', repeat: true, target: h.viewport });
  h.viewport.dispatch('keydown', staleRepeat);
  assert.equal(h.input.current.keys.forward, false);
  assert.equal(staleRepeat.prevented, true, 'held arrows do not scroll the page');
  h.viewport.dispatch('keydown', h.event({ code: 'KeyW', target: h.viewport }));
  assert.equal(h.input.current.keys.forward, true);
  h.viewport.dispatch('keyup', h.event({ code: 'KeyW', target: h.viewport }));
  assert.equal(h.input.current.keys.forward, false);
  const typing = h.event({ code: 'KeyW', target: { tagName: 'INPUT' } });
  h.viewport.dispatch('keydown', typing);
  assert.equal(h.input.current.keys.forward, false);
  assert.ok(!typing.prevented);
  h.cleanup();
});

test('multi-direction touch and every release path work without clearing the activation bridge on pause', () => {
  const h = harness();
  h.hideAndReturn();
  h.handler('onPointerDown')(h.event());
  h.handler('onPointerDown', { key: 'left' })(h.event({ pointerId: 2 }));
  assert.equal(h.controlsRef.current.forward, true, 'second touch retains the first direction');
  assert.equal(h.controlsRef.current.left, true);
  h.handler('onPointerUp', { key: 'left' })();
  assert.equal(h.controlsRef.current.forward, true);
  assert.equal(h.controlsRef.current.left, false);
  const activate = h.controlsRef.current.activate;
  h.pausePresentation();
  assert.equal(h.controlsRef.current.forward, false);
  assert.equal(h.controlsRef.current.activate, activate, 'modal pause keeps the renderer activation callback');
  for (const release of ['onPointerUp', 'onPointerCancel', 'onLostPointerCapture', 'onBlur']) {
    h.handler('onPointerDown')(h.event());
    assert.equal(h.controlsRef.current.forward, true);
    h.handler(release)();
    assert.equal(h.controlsRef.current.forward, false, release);
  }
  const unrelated = h.event({ key: 'a' });
  h.handler('onKeyDown')(unrelated);
  assert.ok(!unrelated.prevented);
  h.handler('onKeyDown')(h.event({ key: 'Enter', ctrlKey: true }));
  h.handler('onPointerDown')(h.event({ button: 2 }));
  assert.equal(h.controlsRef.current.forward, false);
  h.cleanup();
});

test('viewport focus and pointer activation share the live/document guard with direction controls', () => {
  for (const condition of ['hidden', 'unfocused', 'paused', 'suspended']) {
    const h = harness();
    h.hideAndReturn();
    if (condition === 'hidden') h.document.hidden = true;
    if (condition === 'unfocused') h.document.focused = false;
    if (condition === 'paused' || condition === 'suspended') h.live.current[condition] = true;
    const frames = h.frames();
    h.viewport.focus();
    h.viewport.dispatch('pointerdown', h.event({ target: h.viewport }));
    assert.equal(h.input.current.windowActive, false, condition);
    assert.equal(h.input.current.focused, false, condition);
    assert.equal(h.viewport.hasPointerCapture(1), false, condition);
    assert.equal(h.frames(), frames, condition);
    h.cleanup();
  }
});
