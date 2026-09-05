import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = ts.createSourceFile('TheaterScene.jsx', readFileSync(new URL('../src/components/game/theater/TheaterScene.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function findNodes(root, predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}
function evaluate(node, bindings) {
  const { outputText } = ts.transpileModule(`const result = (${node.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  return compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
}

const canvas = findNodes(source, node => ts.isJsxOpeningElement(node) && node.tagName.getText() === 'Canvas')[0];
const fallback = canvas.attributes.properties.find(attribute => attribute.name?.getText() === 'fallback').initializer.expression;

test('Canvas fallback is inert native content, even though fiber mounts it on working WebGL devices', () => {
  const tags = findNodes(fallback, node => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
  assert.ok(tags.length > 0);
  for (const tag of tags) {
    assert.match(tag.tagName.getText(), /^[a-z][a-z0-9-]*$/, 'Fallback components can run mount effects even when WebGL works');
    for (const attribute of tag.attributes.properties) {
      assert.ok(ts.isJsxAttribute(attribute), 'Do not spread side-effecting handlers into native canvas fallback');
      assert.doesNotMatch(attribute.name.getText(), /^on|^ref$/);
      assert.notEqual(attribute.getText(), 'role="alert"', 'Hidden canvas fallback is not a real graphics failure alert');
    }
  }
  assert.equal(findNodes(fallback, ts.isCallExpression).length, 0);
  assert.doesNotMatch(fallback.getText(), /onFailure|CanvasUnavailable/);
  for (const zh of [false, true]) {
    const element = evaluate(fallback, { React, zh });
    assert.equal(element.type, 'p');
    const rendered = renderToStaticMarkup(React.createElement('canvas', null, element));
    assert.ok(rendered.includes(zh ? '文字模式' : 'text mode'));
    assert.ok(rendered.startsWith('<canvas><p>'));
  }
});

test('renderer initialization does not report failure; actual context loss does and cleans up listeners', () => {
  const lifecycle = findNodes(source, node => ts.isFunctionDeclaration(node) && node.name?.text === 'RendererLifecycle')[0];
  const makeEvents = () => {
    const listeners = new Map();
    return {
      listeners,
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name, callback) => { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    };
  };
  const canvasEvents = makeEvents();
  const documentEvents = makeEvents();
  const windowEvents = makeEvents();
  const cleanups = [];
  const failures = [];
  let cleared = 0;
  let frames = 0;
  const input = { current: { windowActive: true, invalidate: null, clear: () => { cleared++; } } };
  const live = { current: { onFailure: error => failures.push(error) } };
  const runLifecycle = evaluate(lifecycle, {
    useThree: () => ({ gl: { domElement: canvasEvents }, invalidate: () => { frames++; } }),
    useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    document: documentEvents, window: windowEvents,
  });
  runLifecycle({ live, input, suspended: false });
  assert.equal(frames, 1);
  assert.deepEqual(failures, []);
  assert.equal(input.current.windowActive, true);
  let prevented = false;
  canvasEvents.listeners.get('webglcontextlost')({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /context was lost/);
  assert.equal(cleared, 1);
  assert.equal(input.current.windowActive, false);
  cleanups.forEach(cleanup => cleanup());
  assert.equal(input.current.invalidate, null);
  for (const events of [canvasEvents, documentEvents, windowEvents]) assert.equal(events.listeners.size, 0);
});
