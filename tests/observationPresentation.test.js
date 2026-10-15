import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { ALL_CASES } from '../src/game/caseData.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';
import { OBSERVATION_PRESENTATIONS, observationAssist, observationPresentation } from '../src/game/observationPresentation.js';

function load(file, imports) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replaceAll('import.meta.env.BASE_URL', "'/game/'");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected observation dependency ${id}`);
    return imports[id];
  }, exports);
  return exports;
}
function expand(element) {
  if (!React.isValidElement(element)) return element;
  if (typeof element.type === 'function') return expand(element.type(element.props));
  return React.cloneElement(element, {}, ...React.Children.toArray(element.props.children).map(expand));
}
function elements(element, predicate) {
  if (!React.isValidElement(element)) return [];
  return [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props.children).flatMap(child => elements(child, predicate))];
}

const details = load('components/game/theater/ObservationPropDetails.jsx', {
  react: { ...React, default: React },
  '@react-three/drei': { Line: props => React.createElement('study-line', props), Html: () => null },
});

test('all eight cases have distinct surface studies whose captions come only from public observations', () => {
  const targetLists = ALL_CASES.map(caseData => getInvestigationContent(caseData.case_id).targets);
  const variants = new Set();
  for (const targets of targetLists) {
    const studied = targets.filter(target => observationPresentation(target.target_id));
    assert.ok(studied.length >= 1, 'Each case needs an inspectable public surface study.');
    for (const target of studied) {
      const presentation = observationPresentation(target.target_id);
      variants.add(presentation.variant);
      assert.ok(Object.isFrozen(presentation));
      assert.equal(presentation.features.length, 2);
      for (const feature of presentation.features) {
        assert.equal(feature.position.length, 3);
        assert.ok(feature.position.every(Number.isFinite));
        for (const lang of ['zh', 'en']) assert.ok(target.observation[lang].toLowerCase().includes(feature.label[lang].toLowerCase()),
          `The ${target.target_id}/${lang} annotation must already be in the published observation.`);
      }
      assert.deepEqual(Object.keys(presentation).sort(), ['features', 'variant', 'viewHint']);
      const serialized = JSON.stringify(presentation);
      assert.doesNotMatch(serialized, /clue_id|option_id|answer|method_id|reward|support_by_dimension/);
    }
  }
  assert.equal(variants.size, 8);
  assert.equal(Object.keys(OBSERVATION_PRESENTATIONS).length, 8);
  for (const id of ['', undefined, null, 'target_c_secret_99', 'toString', '__proto__']) assert.equal(observationPresentation(id), null);
});

test('representative models have distinct geometry without animated loops, textures or extra lights', () => {
  const signatures = new Set();
  for (const presentation of Object.values(OBSERVATION_PRESENTATIONS)) {
    const tree = expand(React.createElement(details.default, { variant: presentation.variant }));
    const meshes = elements(tree, element => element.type === 'mesh');
    assert.ok(meshes.length >= 3 && meshes.length < 30, `${presentation.variant} stays within a small static scene budget.`);
    assert.equal(elements(tree, element => /Light|texture|primitive/i.test(String(element.type))).length, 0);
    const geometry = elements(tree, element => /Geometry$/.test(String(element.type))).map(element => [element.type, element.props.args]);
    signatures.add(JSON.stringify(geometry));
  }
  assert.equal(signatures.size, 8);
  assert.equal(details.default({ variant: 'unknown' }), null);
  assert.equal(details.ObservationMarkers({ presentation: observationPresentation('target_c_01'), visible: false }), null);
});

test('expert viewing guides use current public attributes and do not claim gameplay rewards', () => {
  for (const [executor, expected] of [
    [{ logic_power: 20, observation_focus: 10, hack_level: 10 }, 'compare'],
    [{ logic_power: 10, observation_focus: 20, hack_level: 10 }, 'trace'],
    [{ logic_power: 10, observation_focus: 10, hack_level: 20 }, 'carrier'],
    [{ logic_power: '30', observation_focus: 10, hack_level: 20, agent_id: 'ELITE-CORE' }, 'compare'],
  ]) {
    const before = JSON.stringify(executor);
    const guide = observationAssist(executor);
    assert.equal(guide.key, expected);
    assert.equal(JSON.stringify(executor), before);
    assert.deepEqual(Object.keys(guide).sort(), ['color', 'instruction', 'key', 'label']);
  }
  for (const executor of [null, undefined, {}, { logic_power: 0, observation_focus: NaN, hack_level: -2 }, { agent_id: 'CIPHER-47' }]) {
    assert.equal(observationAssist(executor), null, 'An ID alone must never invent an agent ability or unlock.');
  }
});
