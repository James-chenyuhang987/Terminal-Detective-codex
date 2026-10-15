import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { observationAssist, observationPresentation } from '../src/game/observationPresentation.js';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';

let language = 'zh';
const Canvas = () => null;
const OrbitControls = () => null;
const InvestigationPropModel = () => null;
const ObservationMarkers = () => null;
function descendants(root, predicate) {
  if (!React.isValidElement(root)) return [];
  return [...(predicate(root) ? [root] : []), ...React.Children.toArray(root.props.children).flatMap(child => descendants(child, predicate))];
}
function plainText(element) {
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  return React.isValidElement(element) ? React.Children.toArray(element.props.children).map(plainText).join('') : '';
}
function instance(props) {
  const state = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0;
  const hooks = { ...React, default: React,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(value) { const index = refIndex++; return refs[index] ||= { current: value }; },
    useId: () => 'observation-test',
    useEffect: callback => effects.push(callback),
  };
  const imports = {
    react: hooks,
    '@react-three/fiber': { Canvas }, '@react-three/drei': { OrbitControls },
    '../theater/InvestigationProps.jsx': { InvestigationPropModel },
    '../theater/ObservationPropDetails.jsx': { ObservationMarkers },
    '@/game/observationPresentation.js': { observationAssist, observationPresentation },
    '@/game/investigationChoices.js': { localizedInvestigationText },
    '@/lib/lang.jsx': { useLang: () => ({ lang: language }) }, './observationViewer.css': {},
  };
  const source = readFileSync(new URL('../src/components/game/investigation/EvidenceObjectViewer.jsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected viewer dependency ${id}`);
    return imports[id];
  }, exports);
  return {
    component: exports,
    render() { stateIndex = 0; refIndex = 0; effects.length = 0; return exports.ObjectObservation(props); },
    cleanup() { effects.forEach(effect => effect()?.()); },
  };
}
function button(tree, label) {
  const element = descendants(tree, node => node.type === 'button' && (node.props['aria-label'] === label || plainText(node) === label))[0];
  assert.ok(element, `Missing viewer button: ${label}`);
  return element;
}
const observation = { zh: '纸角有暗红色斑点，购买项目被折痕挡住。', en: 'A dark red stain marks a paper corner; a fold hides the purchased item.' };
function props() {
  return { kind: 'document', targetId: 'target_c_01', label: 'PUBLIC_OBJECT', observation, executorId: 'NEXUS-01',
    executor: { agent_id: 'NEXUS-01', logic_power: 20, observation_focus: 10, hack_level: 10 }, expertNotes: [],
    onCommand() { assert.fail('Free viewing must never issue a game command.'); } };
}

test('the viewer uses the selected public target, provides native keyboard controls and never submits an inspection', () => {
  for (language of ['zh', 'en']) {
    const app = instance(props());
    let tree = app.render();
    const model = descendants(tree, node => node.type === InvestigationPropModel)[0];
    assert.equal(model.props.targetId, 'target_c_01');
    assert.equal(model.props.closeup, true);
    assert.equal(descendants(tree, node => node.type === Canvas)[0].props.frameloop, 'demand');
    assert.equal(descendants(tree, node => node.type === Canvas)[0].props.dpr, 1);
    const group = descendants(tree, node => node.type === 'group' && Boolean(node.props.rotation))[0];
    assert.equal(group.props.rotation[1], 0);
    button(tree, language === 'zh' ? '向右旋转物件' : 'Rotate object right').props.onClick();
    tree = app.render();
    assert.equal(descendants(tree, node => node.type === 'group' && Boolean(node.props.rotation))[0].props.rotation[1], Math.PI / 6);
    for (let i = 0; i < 10; i++) button(app.render(), language === 'zh' ? '放大物件' : 'Enlarge object').props.onClick();
    tree = app.render();
    assert.equal(button(tree, language === 'zh' ? '放大物件' : 'Enlarge object').props.disabled, true);
    assert.equal(descendants(tree, node => node.type === 'group' && Boolean(node.props.rotation))[0].props.scale, 1.6);
    button(tree, language === 'zh' ? '重置角度' : 'Reset view').props.onClick();
    tree = app.render();
    assert.equal(descendants(tree, node => node.type === 'group' && Boolean(node.props.rotation))[0].props.scale, 1);
    assert.ok(descendants(tree, node => node.type === 'button').every(node => node.props.type === 'button'));
    assert.doesNotMatch(renderToStaticMarkup(tree), /onkeydown|<form|onclick/i, 'native buttons retain Enter/Space activation without a separate input handler');
  }
});

test('annotation visibility and text observation are free local controls and retain the original published record', () => {
  for (language of ['zh', 'en']) {
    const app = instance(props());
    let tree = app.render();
    const features = descendants(tree, node => node.type === 'ol')[0];
    assert.equal(React.Children.count(features.props.children), 2);
    assert.equal(descendants(tree, node => node.type === ObservationMarkers)[0].props.visible, true);
    button(tree, language === 'zh' ? '隐藏标注' : 'Hide annotations').props.onClick();
    tree = app.render();
    assert.equal(descendants(tree, node => node.type === 'ol').length, 0);
    assert.equal(descendants(tree, node => node.type === ObservationMarkers)[0].props.visible, false);
    button(tree, language === 'zh' ? '文字观察' : 'Text observation').props.onClick();
    tree = app.render();
    assert.equal(descendants(tree, node => node.type === Canvas).length, 0);
    assert.ok(plainText(tree).includes(observation[language]));
    assert.equal(button(tree, language === 'zh' ? '文字观察' : 'Text observation').props['aria-pressed'], true);
    assert.ok(plainText(tree).includes(language === 'zh' ? '不会新增证据或改变核验费用' : 'do not grant evidence or alter inspection costs'));
  }
});

test('changing experts changes only the guide, while acquired notes stay separate and language-aware', () => {
  const fields = props();
  fields.expertNotes = [{ zh: '已取得的纸张专业观察。', en: 'An earned paper observation.' }];
  const before = JSON.stringify(fields);
  const app = instance(fields);
  for (language of ['zh', 'en']) {
    for (const [key, expected] of [['logic_power', 'compare'], ['observation_focus', 'trace'], ['hack_level', 'carrier']]) {
      fields.executor = { agent_id: 'PUBLIC_CORE', [key]: 30 };
      const tree = app.render();
      const markers = descendants(tree, node => node.type === ObservationMarkers)[0];
      assert.equal(markers.props.assist.key, expected);
      assert.equal(markers.props.presentation.features.length, 2);
      assert.ok(plainText(tree).includes(fields.expertNotes[0][language]));
      assert.ok(plainText(tree).includes(language === 'zh' ? '仅切换查看辅助' : 'changes the viewing aid only'));
    }
    fields.expertNotes = [];
    assert.equal(descendants(app.render(), node => node.type === 'details').length, 0, 'unearned expert analysis must not be invented');
    fields.expertNotes = [{ zh: '已取得的纸张专业观察。', en: 'An earned paper observation.' }];
  }
  assert.equal(JSON.stringify({ ...fields, executor: props().executor }), before);
});

test('a lost WebGL context falls back to the same full observation and can be retried without a command', () => {
  for (language of ['zh', 'en']) {
    const app = instance(props());
    let tree = app.render();
    const listeners = new Map();
    const canvas = { addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); } };
    descendants(tree, node => node.type === Canvas)[0].props.onCreated({ gl: { domElement: canvas } });
    assert.ok(listeners.has('webglcontextlost'));
    let prevented = 0;
    listeners.get('webglcontextlost')({ preventDefault: () => { prevented++; } });
    tree = app.render();
    assert.equal(prevented, 1);
    assert.equal(descendants(tree, node => node.type === Canvas).length, 0);
    assert.ok(plainText(tree).includes(observation[language]));
    assert.ok(plainText(tree).includes(language === 'zh' ? '3D 视图暂不可用' : 'The 3D view is unavailable'));
    app.cleanup();
    assert.equal(listeners.size, 0, 'release old context listeners when the renderer is removed');
    button(tree, language === 'zh' ? '重试 3D' : 'Retry 3D').props.onClick();
    assert.equal(descendants(app.render(), node => node.type === Canvas).length, 1);
  }
});

test('render failures expose public fallback text and switching target remounts the failed reader', () => {
  language = 'en';
  const fields = props();
  const app = instance(fields);
  let tree = app.render();
  const boundaryNode = descendants(tree, node => node.type === app.component.ObservationViewerBoundary)[0];
  const boundary = new app.component.ObservationViewerBoundary(boundaryNode.props);
  boundary.state = app.component.ObservationViewerBoundary.getDerivedStateFromError();
  assert.ok(plainText(boundary.render()).includes(observation.en));
  boundary.componentDidCatch();
  assert.equal(descendants(app.render(), node => node.type === Canvas).length, 0);
  const first = app.component.default(fields);
  const second = app.component.default({ ...fields, targetId: 'target_j_01', kind: 'sample' });
  assert.equal(first.key, 'target_c_01');
  assert.equal(second.key, 'target_j_01');
  assert.notEqual(first.key, second.key, 'a new object must not inherit the previous WebGL failure, rotation or reader mode');
  tree = instance({ ...fields, targetId: 'target_unknown' }).render();
  assert.equal(descendants(tree, node => node.type === ObservationMarkers)[0].props.presentation, null);
  assert.equal(descendants(tree, node => node.type === 'ol').length, 0, 'unknown objects get no guessed annotations');
});
