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
import * as visuals from '../src/game/theaterVisuals.js';

const source = ts.createSourceFile('TheaterScene.jsx', readFileSync(new URL('../src/components/game/theater/TheaterScene.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'World');
const { outputText } = ts.transpileModule(`const result = (${declaration.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const inputDeclaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useViewportInput');
const { outputText: inputOutputText } = ts.transpileModule(`const result = (${inputDeclaration.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });

function inputHarness() {
  const listeners = new Map();
  const windowListeners = new Map();
  const documentListeners = new Map();
  const viewport = {
    contains: target => target === viewport,
    closest: () => null,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    focus: () => {},
  };
  const document = { hidden: false, hasFocus: () => true, addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: name => documentListeners.delete(name) };
  const window = { addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: name => windowListeners.delete(name) };
  let cleanup;
  const live = { current: { paused: false, suspended: false } };
  const controlsRef = { current: { forward: false, backward: false, left: false, right: false, sprint: false } };
  const input = { current: { windowActive: true, focused: true, orbitX: 0, orbitY: 0, keys: { forward: false, backward: false, left: false, right: false, sprint: false }, invalidate: () => {}, stopMotion: () => {} } };
  const bindings = {
    EMPTY_CONTROLS: { forward: false, backward: false, left: false, right: false, sprint: false },
    KEY_DIRECTIONS: { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' },
    isViewportKeyTarget: (target, element) => target === element,
    useEffect: fn => { cleanup = fn(); },
    document,
    window,
  };
  const hook = compileFunction(`${inputOutputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
  hook({ current: viewport }, controlsRef, live, input, () => {});
  const fire = (name, event = {}) => listeners.get(name)?.({ target: viewport, preventDefault: () => {}, ...event });
  return {
    input,
    controlsRef,
    live,
    document,
    fire,
    windowBlur: () => windowListeners.get('blur')?.(),
    visibility: () => documentListeners.get('visibilitychange')?.(),
    cleanup,
  };
}

function harness({ deferEffects = false, npcs = [], selectedNpcId = null, interactionNpcId = null } = {}) {
  const camera = new PerspectiveCamera();
  const gltf = { scene: new Group() };
  const refs = [];
  const cleanups = [];
  const effects = [];
  const runEffect = fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); };
  let frame;
  let invalidations = 0;
  const bindings = {
    ...world, ...motion, ...cameraCollision, ...visuals, MathUtils, Vector3, React,
    ASSET_ROOT: '/assets/theater/', EMPTY_CONTROLS: { forward: false, backward: false, left: false, right: false, sprint: false },
    useMemo: fn => fn(), useRef: current => { const ref = { current }; refs.push(ref); return ref; },
    useState: initial => [initial, () => {}], useThree: () => ({ camera, invalidate: () => invalidations++ }),
    useEffect: fn => { if (deferEffects) effects.push(fn); else runEffect(fn); },
    useFrame: callback => { frame = callback; }, useGLTF: () => gltf,
    document: { hidden: false }, window: { setTimeout: fn => fn(), clearTimeout: () => {} },
    RoomModel: () => null, Avatar: () => null, HotspotRing: () => null, FieldLighting: () => null, FootShadow: () => null, FieldFeedback: () => null,
  };
  const component = compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
  const controlsRef = { current: { forward: false, backward: false, left: false, right: false, sprint: false } };
  const input = { current: { windowActive: true, focused: true, orbitX: 0, orbitY: 0, keys: { forward: false, backward: false, left: false, right: false, sprint: false }, clear: () => { Object.assign(controlsRef.current, { forward: false, backward: false, left: false, right: false, sprint: false }); Object.assign(input.current.keys, { forward: false, backward: false, left: false, right: false, sprint: false }); input.current.stopMotion?.(); } } };
  const live = { current: { paused: false, suspended: false, reducedMotion: false } };
  const manifest = world.validateTheaterManifest(JSON.parse(readFileSync(new URL('../public/assets/theater/manifest.json', import.meta.url), 'utf8')));
  const spatialRef = { current: {} };
  const tree = component({ caseData: { case_id: 'test', npcs }, zoneId: 'datacenter', manifest, selectedNpcId, interactionNpcId, controlsRef, spatialRef, live, input, nearbyRef: { current: null }, sceneReady: () => {}, quality: { shadows: false } });
  return { tree, state: refs[0].current, live, input, controlsRef, camera, document: bindings.document, frame: delta => frame({}, delta), flushEffects: () => effects.splice(0).forEach(runEffect), cleanup: () => cleanups.reverse().forEach(fn => fn()), spatialRef, manifest, invalidations: () => invalidations };
}

test('detective keeps the conversation pose and facing target when 3D mounts during an open dialogue', () => {
  const npc = { npc_id: 'witness', name: 'Witness' };
  for (const selection of [{ interactionNpcId: npc.npc_id }, { selectedNpcId: npc.npc_id }]) {
    const h = harness({ npcs: [npc], ...selection });
    const detective = React.Children.toArray(h.tree.props.children).find(child => child.props.role === 'detective');
    assert.equal(detective.props.interacting, true);
    const staged = world.stageNpcs([npc], h.manifest.scenes.datacenter, 'test');
    assert.deepEqual(detective.props.interactionTarget.current.position, staged[0].position);
    h.cleanup();
  }
  const h = harness({ npcs: [npc] });
  const detective = React.Children.toArray(h.tree.props.children).find(child => child.props.role === 'detective');
  assert.equal(detective.props.interacting, false);
  assert.equal(detective.props.interactionTarget, null);
  h.cleanup();
});

test('a frame before passive setup cannot leave the stationary nearby interaction disabled', () => {
  const h = harness({ deferEffects: true });
  const spot = h.manifest.scenes.datacenter.hotspots[0];
  h.state.position = [...spot.position];
  const notifications = [];
  h.live.current.onNearbyChange = target => notifications.push(target?.id ?? null);
  h.frame(1 / 60);
  assert.equal(notifications.at(-1), spot.id);
  h.flushEffects();
  assert.equal(notifications.at(-1), null, 'Room setup clears the previous interaction');
  h.frame(1 / 60);
  assert.equal(notifications.at(-1), spot.id, 'The first stable frame restores the interaction without requiring movement');
  assert.deepEqual(h.state.position, spot.position);
  h.cleanup();
});

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

test('World requires a direction with R to sprint and clears sprint on pause or hidden page', () => {
  const h = harness();
  const start = [...h.state.position];
  h.controlsRef.current.sprint = true;
  for (let frame = 0; frame < 30; frame++) h.frame(1 / 60);
  assert.deepEqual(h.state.position, start, 'R alone cannot move the actor');
  assert.equal(h.state.sprinting, false);

  h.controlsRef.current.forward = true;
  for (let frame = 0; frame < 120; frame++) h.frame(1 / 60);
  assert.equal(h.state.sprinting, true);
  assert.ok(h.state.speed <= world.SPRINT_SPEED + 1e-8);
  assert.ok(h.state.speed > h.manifest.characters.detective.locomotion.speed);

  h.live.current.paused = true;
  h.frame(1 / 60);
  assert.equal(h.state.sprinting, false);
  assert.equal(h.state.speed, 0);
  h.live.current.paused = false;
  h.document.hidden = true;
  h.frame(1 / 60);
  assert.equal(h.state.sprinting, false);
  assert.equal(h.state.speed, 0);
  h.cleanup();
});

test('World publishes a position-only live snapshot before cleanup so pagehide can preserve the current frame', () => {
  const h = harness();
  h.controlsRef.current.forward = true;
  h.controlsRef.current.sprint = true;
  h.frame(1 / 60);
  const saved = h.spatialRef.current.rooms['["test","datacenter"]'];
  assert.deepEqual(saved.position, h.state.position);
  assert.equal(saved.rotationY, h.state.rotationY);
  assert.deepEqual(Object.keys(saved).sort(), ['pitch', 'position', 'rotationY', 'yaw']);
  const position = [...saved.position];
  h.state.position[0] += .1;
  assert.deepEqual(saved.position, position, 'the workspace snapshot must not alias mutable locomotion arrays');
  h.cleanup();
});

test('movement onboarding only advances once after actual collision-resolved travel', () => {
  const h = harness();
  let notifications = 0;
  h.live.current.onActualMove = () => notifications++;
  h.controlsRef.current.sprint = true;
  for (let frame = 0; frame < 60; frame++) h.frame(1 / 60);
  assert.equal(notifications, 0, 'R without a direction cannot complete movement');
  h.controlsRef.current.forward = true;
  h.live.current.paused = true;
  for (let frame = 0; frame < 60; frame++) h.frame(1 / 60);
  assert.equal(notifications, 0, 'held movement during a pause cannot complete the tutorial');
  h.live.current.paused = false;
  h.frame(1 / 60);
  assert.equal(notifications, 0, 'one sub-threshold frame is insufficient');
  for (let frame = 0; frame < 180; frame++) h.frame(1 / 60);
  assert.equal(notifications, 1, 'genuine movement reports once, including subsequent frames');
  h.cleanup();
});

test('viewport input treats R as a held sprint key and clears it on release, blur, or hidden page', () => {
  const h = inputHarness();
  h.fire('keydown', { code: 'KeyR', repeat: false });
  assert.equal(h.input.current.keys.sprint, true);
  h.fire('keydown', { code: 'KeyR', repeat: true });
  assert.equal(h.input.current.keys.sprint, true, 'repeated keydown does not toggle sprint off');
  h.fire('keyup', { code: 'KeyR' });
  assert.equal(h.input.current.keys.sprint, false);

  h.fire('keydown', { code: 'KeyR', repeat: false });
  h.fire('keydown', { code: 'KeyW', repeat: false });
  assert.equal(h.input.current.keys.sprint, true);
  assert.equal(h.input.current.keys.forward, true);
  h.windowBlur();
  assert.equal(h.input.current.keys.sprint, false);
  assert.equal(h.input.current.keys.forward, false);

  h.fire('keydown', { code: 'KeyR', repeat: false });
  h.document.hidden = true;
  h.visibility();
  assert.equal(h.input.current.keys.sprint, false);
  assert.equal(h.controlsRef.current.sprint, false);
  h.cleanup?.();
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

test('portrait arrival framing leaves room above its panel and restores projection after closing', () => {
  const h = harness();
  h.camera.aspect = .46;
  h.camera.updateProjectionMatrix();
  const position = [...h.state.position];
  h.live.current.overview = true;
  h.live.current.paused = true;
  h.frame(1 / 60);
  assert.equal(h.camera.view.enabled, true);
  assert.equal(h.camera.view.offsetY, 180);
  for (let frame = 0; frame < 100; frame++) h.frame(1 / 60);
  assert.deepEqual(h.state.position, position);
  h.live.current.overview = false;
  h.live.current.paused = false;
  h.frame(1 / 60);
  assert.equal(h.camera.view.enabled, false);
  assert.deepEqual(h.state.position, position);
  h.cleanup();
});

function avatarFrame({ root, player = null, talking = false, interacting = false, interactionTarget = null, targetPosition = null, live, bindings: overrides = {} }) {
  const avatar = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Avatar');
  let callback;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'useFrame') callback = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(avatar);
  const { outputText } = ts.transpileModule(`const result = (${callback.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  const bindings = {
    MAX_FRAME_DELTA: world.MAX_FRAME_DELTA, MathUtils, root: { current: root }, player,
    talking, interacting, interactionTarget, targetPosition, live,
    input: { current: { windowActive: true } }, document: { hidden: false },
    spine: null, appliedSpineOffset: { current: { x: 0, y: 0, z: 0 } },
    animation: { walkWeight: 0, talkWeight: 0 }, updateAvatarAnimation: () => {},
    locomotion: { speed: world.WALK_SPEED }, gait: {}, position: [0, 0, 0], rotationY: 0,
    npcDemeanor: visuals.npcDemeanor, emotion: 'calm', appearance: null,
    footLock: { lockWeight: 0, applied: new Vector3() }, updateFootLock: () => {},
    model: new Group(), grounding: {}, soleGroundOffset: () => 0,
    ...overrides,
  };
  return compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
}

test('ending a conversation preserves the detective facing instead of snapping to the old walking direction', () => {
  for (const reducedMotion of [false, true]) {
    const root = new Group();
    const player = { current: { position: [0, 0, 0], rotationY: 0, speed: 0, distance: 0 } };
    const live = { current: { suspended: false, paused: true, reducedMotion } };
    const speaking = avatarFrame({ root, player, live, interacting: true, interactionTarget: { current: { position: [0, 0, -2] } } });
    for (let index = 0; index < 90; index++) speaking({}, 1 / 60);
    const facing = root.rotation.y;
    assert.ok(Math.abs(facing) > 3, 'the detective has turned to face the person behind them');
    const idle = avatarFrame({ root, player, live });
    idle({}, 1 / 60);
    assert.ok(Math.abs(root.rotation.y - facing) < 1e-8, 'closing dialogue cannot undo the rendered turn');
    assert.equal(player.current.rotationY, facing, 'spatial persistence and the next movement start from the visible facing');
    assert.deepEqual(player.current.position, [0, 0, 0], 'conversation orientation cannot move the collision body');
  }
});

test('stopping, pausing or suspending an Avatar never recenters its visible foot-lock offset', () => {
  for (const reason of ['released', 'paused', 'suspended', 'blurred', 'hidden', 'reduced']) {
    const root = new Group();
    const model = new Group();
    root.add(model);
    const footLock = motion.createFootLock(model);
    // A turn or a partially blended stride can have a nonzero presentation
    // correction when input stops. Never trade that offset for visible drift.
    footLock.applied.set(.018, 0, -.032);
    footLock.appliedWorld.copy(footLock.applied);
    footLock.lockWeight = 1;
    footLock.activeSide = 'left';
    model.position.copy(footLock.applied);
    const released = model.position.clone();
    const player = { current: { position: [1, 0, 2], rotationY: 0, speed: 0, distance: 0, walking: reason !== 'released' } };
    const live = { current: { suspended: reason === 'suspended', paused: reason === 'paused', reducedMotion: reason === 'reduced' } };
    let invalidations = 0;
    const frame = avatarFrame({ root, player, live, bindings: {
      model, footLock, updateFootLock: motion.updateFootLock,
      input: { current: { windowActive: reason !== 'blurred', invalidate: () => invalidations++ } },
      document: { hidden: reason === 'hidden' },
    } });
    for (let index = 0; index < 60; index++) frame({}, 1 / 60);
    assert.deepEqual(model.position.toArray(), released.toArray(), `${reason}: the model stays at its last displayed position`);
    assert.deepEqual(root.position.toArray(), player.current.position);
    assert.equal(footLock.activeSide, null, 'the old world-space anchor is discarded');
    assert.equal(footLock.lockWeight, 0);
    if (reason === 'released') assert.equal(invalidations, 0, 'a held offset must not keep the idle canvas rendering');
    const nextSceneLock = motion.createFootLock(new Group());
    assert.equal(nextSceneLock.applied.length(), 0, 'a fresh scene cannot inherit the old offset');
  }
});

test('an NPC turns toward the detective during pending conversation without waiting for the dialogue panel', () => {
  const root = new Group();
  const live = { current: { suspended: false, paused: true, reducedMotion: false } };
  const frame = avatarFrame({ root, live, interacting: true, targetPosition: { current: { position: [2, 0, 0] } } });
  frame({}, 1 / 60);
  assert.ok(root.rotation.y > 0, 'a newly interacting NPC turns with the talk gesture');
  const facing = root.rotation.y;
  live.current.suspended = true;
  frame({}, 1 / 60);
  assert.equal(root.rotation.y, facing, 'background conversation remains frozen');
});
