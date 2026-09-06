import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { Group, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import * as world from '../src/game/theaterWorld.js';
import * as motion from '../src/game/theaterMotion.js';
import * as cameraCollision from '../src/game/theaterCamera.js';

const source = ts.createSourceFile('TheaterScene.jsx', readFileSync(new URL('../src/components/game/theater/TheaterScene.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'World');
const { outputText } = ts.transpileModule(`const result = (${declaration.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });

function harness() {
  const camera = new PerspectiveCamera();
  const gltf = { scene: new Group() };
  const refs = [];
  const cleanups = [];
  let frame;
  let invalidations = 0;
  const bindings = {
    ...world, ...motion, ...cameraCollision, MathUtils, Vector3, React,
    ASSET_ROOT: '/assets/theater/', EMPTY_CONTROLS: { forward: false, backward: false, left: false, right: false },
    useMemo: fn => fn(), useRef: current => { const ref = { current }; refs.push(ref); return ref; },
    useState: initial => [initial, () => {}], useThree: () => ({ camera, invalidate: () => invalidations++ }),
    useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
    useFrame: callback => { frame = callback; }, useGLTF: () => gltf,
    document: { hidden: false }, window: { setTimeout: fn => fn(), clearTimeout: () => {} },
    RoomModel: () => null, Avatar: () => null, HotspotRing: () => null,
  };
  const component = compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
  const controlsRef = { current: { forward: false } };
  const input = { current: { windowActive: true, focused: true, orbitX: 0, orbitY: 0, keys: { forward: false }, clear: () => { controlsRef.current.forward = false; input.current.keys.forward = false; input.current.stopMotion?.(); } } };
  const live = { current: { paused: false, suspended: false, reducedMotion: false } };
  const manifest = world.validateTheaterManifest(JSON.parse(readFileSync(new URL('../public/assets/theater/manifest.json', import.meta.url), 'utf8')));
  const spatialRef = { current: {} };
  component({ caseData: { case_id: 'test', npcs: [] }, zoneId: 'datacenter', manifest, selectedNpcId: null, controlsRef, spatialRef, live, input, nearbyRef: { current: null }, sceneReady: () => {}, quality: { shadows: false } });
  return { state: refs[0].current, live, input, controlsRef, camera, document: bindings.document, frame: delta => frame({}, delta), cleanup: () => cleanups.reverse().forEach(fn => fn()), spatialRef, invalidations: () => invalidations };
}

test('real World frame stops movement under Home suspension even when paused is false and keys remain held', () => {
  const h = harness();
  h.controlsRef.current.forward = true;
  for (let frame = 0; frame < 20; frame++) h.frame(1 / 60);
  assert.ok(h.state.position[2] < 3);
  for (const flag of ['suspended', 'paused', 'hidden', 'inactive']) {
    const position = [...h.state.position];
    if (flag === 'hidden') h.document.hidden = true;
    else if (flag === 'inactive') h.input.current.windowActive = false;
    else h.live.current[flag] = true;
    h.frame(1 / 60);
    assert.deepEqual(h.state.position, position, flag);
    assert.equal(h.state.speed, 0, flag);
    assert.equal(h.state.walking, false, flag);
    h.document.hidden = false; h.input.current.windowActive = true;
    h.live.current.paused = false; h.live.current.suspended = false;
  }
  h.input.current.clear();
  const position = [...h.state.position];
  h.frame(1 / 60);
  assert.deepEqual(h.state.position, position, 'resume cannot restore cleared movement');
  h.cleanup();
  assert.deepEqual(h.spatialRef.current.rooms['["test","datacenter"]'].position, position);
});

test('World keeps a stationary camera stable and freezes its pose while suspended', () => {
  const h = harness();
  for (let frame = 0; frame < 100; frame++) h.frame(1 / 60);
  const position = h.camera.position.clone();
  for (let frame = 0; frame < 100; frame++) h.frame(1 / 60);
  assert.ok(position.distanceTo(h.camera.position) < 1e-8);
  h.live.current.suspended = true;
  h.input.current.orbitX = 80;
  const invalidations = h.invalidations();
  h.frame(1 / 60);
  assert.ok(position.distanceTo(h.camera.position) < 1e-8);
  assert.equal(h.invalidations(), invalidations);
  h.cleanup();
});
