import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { Group, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ALL_CASES } from '../src/game/caseData.js';
import { conversationOffsets, createInvestigationCollisionState, updateInvestigationColliders, investigationPropKind, investigationTargets, isWalkable, sceneForZone, stageNpcs, stageInvestigationNpcs, validateTheaterManifest, withInvestigationColliders, withNpcColliders } from '../src/game/theaterWorld.js';
import { createFootstepTracker, createTheaterAudio, FLOOR_SOUNDS, footstepContacts } from '../src/game/theaterAudio.js';
import { createQualitySampler, sampleTheaterQuality, theaterPerformanceSnapshot, theaterQualitySettings } from '../src/game/theaterQuality.js';
import * as theaterWorld from '../src/game/theaterWorld.js';
import * as theaterMotion from '../src/game/theaterMotion.js';
import * as theaterCamera from '../src/game/theaterCamera.js';
import * as theaterVisuals from '../src/game/theaterVisuals.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';

const assetRoot = new URL('../public/assets/theater/', import.meta.url);
const manifest = validateTheaterManifest(JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8')));

test('version 2 World renders public object intents and separates the dialogue listener from the speaker', () => {
  const file = ts.createSourceFile('TheaterScene.jsx', readFileSync(new URL('../src/components/game/theater/TheaterScene.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'World');
  const { outputText } = ts.transpileModule(`const result = (${declaration.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const components = Object.fromEntries(['RoomModel', 'Avatar', 'HotspotRing', 'FieldLighting', 'FootShadow', 'FieldFeedback', 'InvestigationProps'].map(name => [name, () => null]));
  const live = { current: { paused: false, suspended: false, reducedMotion: false } };
  const input = { current: { windowActive: true, focused: true, clear: () => {} } };
  const bindings = { ...theaterWorld, ...theaterMotion, ...theaterCamera, ...theaterVisuals, ...components, MathUtils, Vector3, React,
    ASSET_ROOT: '/assets/theater/', EMPTY_CONTROLS: {}, document: { hidden: false }, window: { setTimeout: () => 0, clearTimeout() {} },
    useMemo: fn => fn(), useRef: current => ({ current }), useState: initial => [initial, () => {}], useEffect: fn => fn(), useFrame() {},
    useThree: () => ({ camera: new PerspectiveCamera(), invalidate() {} }), useGLTF: () => ({ scene: new Group() }) };
  const World = compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
  const caseData = ALL_CASES[0], zoneId = 'zone_lobby';
  const investigation = { npc_zones: { npc_01: 'zone_balcony', npc_02: zoneId, npc_03: 'zone_lab' }, targets: [{ target_id: 'visible_log', zone_id: zoneId, label: { zh: '门禁原始记录', en: 'Original door record' }, kind: 'terminal' }] };
  const props = { caseData, zoneId, manifest, investigation, selectedNpcId: 'npc_02', speakerNpcId: null, live, input, controlsRef: { current: {} }, spatialRef: { current: {} }, nearbyRef: { current: null }, sceneReady() {}, quality: { shadows: false } };
  for (const speaker of [null, 'npc_02']) {
    const tree = World({ ...props, speakerNpcId: speaker });
    const children = React.Children.toArray(tree.props.children);
    const objects = children.find(child => child.type === components.InvestigationProps);
    assert.equal(objects.props.targets[0].id, 'visible_log');
    assert.equal(objects.props.targets[0].label, '门禁原始记录');
    const npcGroups = children.filter(child => child.type === 'group');
    assert.equal(npcGroups.length, 1, 'contacts from other rooms are absent');
    const avatar = React.Children.toArray(npcGroups[0].props.children).find(child => child.type === components.Avatar);
    assert.equal(avatar.props.talking, speaker !== null);
    assert.equal(avatar.props.interacting, true);
    const rings = children.filter(child => child.type === components.HotspotRing);
    assert.ok(rings.some(child => child.props.target.id === 'visible_log'));
    assert.equal(rings.some(child => child.props.target.id === 'workstation'), false);
  }
});

function reachable(room) {
  const step = .1, spawn = room.spawn;
  const cells = new Map([['0,0', spawn]]), queue = [[0, 0]];
  for (let index = 0; index < queue.length && index < 20000; index++) {
    const [x, z] = queue[index];
    for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
      const key = `${nx},${nz}`;
      if (cells.has(key)) continue;
      const point = [spawn[0] + nx * step, 0, spawn[2] + nz * step];
      if (!isWalkable(point, room)) continue;
      cells.set(key, point); queue.push([nx, nz]);
    }
  }
  return [...cells.values()];
}

test('version 2 only stages contacts assigned to the current zone while legacy staging stays intact', () => {
  for (const caseData of ALL_CASES) {
    const zones = Object.keys(caseData.scene.zones);
    const investigation = { npc_zones: Object.fromEntries(caseData.npcs.map((npc, index) => [npc.npc_id, zones[index % zones.length]])) };
    for (const zoneId of zones) {
      const room = manifest.scenes[sceneForZone(zoneId)];
      const staged = stageInvestigationNpcs(caseData.npcs, room, caseData.case_id, zoneId, investigation);
      assert.deepEqual(staged.map(npc => npc.npcId), caseData.npcs.filter(npc => investigation.npc_zones[npc.npc_id] === zoneId).map(npc => npc.npc_id));
      const original = stageNpcs(caseData.npcs, room, caseData.case_id);
      for (const npc of staged) assert.equal(npc.role, original.find(item => item.npcId === npc.npcId).role);
      assert.equal(stageInvestigationNpcs(caseData.npcs, room, caseData.case_id, zoneId, null).length, caseData.npcs.length);
    }
  }
});

test('all room variants place up to four physical objects without trapping actors or blocking exits', () => {
  for (const [scene, room] of Object.entries(manifest.scenes)) {
    const npcs = stageNpcs(ALL_CASES[0].npcs, room, 'Lvl_01').slice(0, 1);
    const sources = Array.from({ length: 4 }, (_, index) => ({ target_id: `public_${index}`, zone_id: 'test', label: { zh: `物件${index}`, en: `Object ${index}` }, kind: ['document', 'terminal', 'sample', 'device'][index], position: index === 3 ? [99, 0, 99] : undefined, clue_id: 'PRIVATE_ID', method_id: 'PRIVATE_METHOD' }));
    const targets = investigationTargets(room, npcs, { targets: sources }, 'test');
    assert.equal(targets.length, 4, scene);
    const collisionRoom = withInvestigationColliders(withNpcColliders(room, npcs), targets);
    const cells = reachable(collisionRoom);
    assert.ok(isWalkable(room.spawn, collisionRoom), `${scene} spawn`);
    for (const target of [...targets, ...room.doors]) {
      assert.ok(cells.some(point => Math.hypot(point[0] - target.position[0], point[2] - target.position[2]) < (target.radius || 1.4)), `${scene}/${target.id} unreachable`);
    }
    assert.equal(JSON.stringify(targets).includes('PRIVATE_'), false);
    assert.deepEqual(investigationTargets(room, npcs, { targets: sources.map(target => ({ ...target, completed: true })) }, 'test').map(target => target.position), targets.map(target => target.position), 'confirming an object cannot move the physical layout');
    assert.equal(investigationTargets(room, npcs, { targets: sources }, 'another-zone').length, 0);
  }
});

test('all eight authored cases keep each real object, hidden corroboration and assigned contact reachable', () => {
  for (const caseData of ALL_CASES) {
    const content = getInvestigationContent(caseData.case_id);
    const targets = [...content.targets, { ...content.hidden, kind: 'terminal' }].map(({ target_id, zone_id, label, observation, kind }) => ({ target_id, zone_id, label, observation, kind }));
    const investigation = { targets, npc_zones: content.npc_zones };
    for (const zoneId of Object.keys(caseData.scene.zones)) {
      const room = manifest.scenes[sceneForZone(zoneId)];
      const npcs = stageInvestigationNpcs(caseData.npcs, room, caseData.case_id, zoneId, investigation);
      const objects = investigationTargets(room, npcs, investigation, zoneId);
      assert.equal(objects.length, targets.filter(target => target.zone_id === zoneId).length, `${caseData.case_id}/${zoneId} missing object`);
      const geometry = withInvestigationColliders(withNpcColliders(room, npcs), objects);
      const cells = reachable(geometry);
      assert.ok(isWalkable(room.spawn, geometry));
      for (const object of [...objects, ...npcs.map(npc => ({ ...npc, id: npc.npcId, radius: 1.6 })), ...room.doors]) {
        assert.ok(cells.some(cell => Math.hypot(cell[0] - object.position[0], cell[2] - object.position[2]) < (object.radius || 1.4)), `${caseData.case_id}/${zoneId}/${object.id}`);
      }
    }
  }
});

test('a newly revealed object waits for a stationary detective to leave before its collision is armed', () => {
  const room = { ...manifest.scenes.office, colliders: [] };
  const state = createInvestigationCollisionState(), position = [1, 0, 2];
  const original = { id: 'original', position: [-2, 0, 2] }, revealed = { id: 'revealed', position: [...position] };
  updateInvestigationColliders(state, room, [original], position);
  const occupied = updateInvestigationColliders(state, room, [original, revealed], position);
  assert.ok(isWalkable(position, occupied));
  assert.equal(state.pending.size, 1);
  assert.deepEqual(position, [1, 0, 2], 'revealing a clue cannot move a released actor');
  const leaving = updateInvestigationColliders(state, room, [original, revealed], [2, 0, 2]);
  assert.equal(state.pending.size, 0);
  assert.equal(isWalkable(revealed.position, leaving), false);
  assert.ok(isWalkable([2, 0, 2], leaving));
});

test('the new Blender prop library stays decoder-free and keeps the entire theater below 8 MB', async () => {
  const meta = JSON.parse(readFileSync(new URL('investigation-props.json', assetRoot), 'utf8'));
  const bytes = readFileSync(new URL(meta.file, assetRoot));
  assert.equal(bytes.length, meta.bytes);
  assert.ok(bytes.length < 200_000);
  assert.ok(meta.triangles < 3000);
  const original = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8'));
  assert.ok(original.totalBytes + meta.bytes < 8_000_000);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.equal(json.images, undefined); assert.equal(json.textures, undefined); assert.equal(json.extensionsRequired, undefined);
  assert.equal(json.animations, undefined); assert.equal(json.skins, undefined);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  for (const node of Object.values(meta.nodes)) assert.ok(gltf.scene.getObjectByName(node), node);
  assert.deepEqual(Object.keys(meta.nodes).sort(), ['device', 'document', 'sample', 'terminal']);
  assert.equal(investigationPropKind('door_log'), 'document');
  assert.equal(investigationPropKind('unrecognized'), 'device');
});

test('30/60/144 Hz footsteps fire twice per Walk cycle and never replay idle or blocked contacts', () => {
  for (const hz of [30, 60, 144]) {
    const tracker = createFootstepTracker(), contacts = [];
    footstepContacts(tracker, { phase: 0, walking: true, distance: 1 / hz });
    for (let frame = 1; frame <= hz * 3; frame++) contacts.push(...footstepContacts(tracker, { phase: frame / hz, walking: true, distance: 1.4 / hz }));
    assert.deepEqual(contacts, ['right', 'left', 'right', 'left', 'right', 'left']);
    for (const extra of [{ walking: false }, { distance: 0 }, { enabled: false }]) {
      assert.deepEqual(footstepContacts(tracker, { phase: .49, walking: true, distance: .02, ...extra }), []);
      assert.deepEqual(footstepContacts(tracker, { phase: .51, walking: true, distance: .02 }), [], 'restart must not emit a missed contact');
    }
    assert.deepEqual(footstepContacts(tracker, { phase: .98, walking: true, distance: .02 }), [], 'clip seeks do not produce multiple sounds');
  }
  assert.notEqual(FLOOR_SOUNDS.datacenter.cutoff, FLOOR_SOUNDS.office.cutoff);
});

function fakeAudioContext() {
  const nodes = [];
  const parameter = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime(value) { this.value = value; } });
  const node = () => { const result = { gain: parameter(), frequency: parameter(), connect() {}, disconnect() { this.disconnected = true; }, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } }; nodes.push(result); return result; };
  return { currentTime: 0, state: 'running', destination: {}, nodes, createGain: node, createOscillator: node, createBiquadFilter: node, resume() { this.state = 'running'; return Promise.resolve(); }, close() { this.state = 'closed'; return Promise.resolve(); } };
}

test('the audio graph is lazy, obeys sound/foreground settings and releases its owned nodes', () => {
  let created = 0;
  const context = fakeAudioContext(), audio = createTheaterAudio({ contextFactory: () => { created++; return context; } });
  audio.setEnabled(false); audio.unlock(); assert.equal(created, 0);
  audio.setEnabled(true); audio.unlock(); assert.equal(created, 1);
  const movement = { distance: .02, walking: true };
  audio.step({ gaitPhase: .49 }, movement);
  assert.deepEqual(audio.step({ gaitPhase: .51 }, movement), ['right']);
  audio.setActive(false);
  assert.deepEqual(audio.step({ gaitPhase: 0 }, movement), []);
  const count = context.nodes.length;
  audio.cue('discovery'); assert.equal(context.nodes.length, count, 'hidden scenes must be silent');
  audio.dispose(); assert.equal(context.state, 'closed');
  assert.ok(context.nodes.filter(node => node.started).every(node => node.stopped));
  audio.unlock(); assert.equal(created, 1);
});

test('automatic quality requires sustained foreground frame time and includes an eight-second cooldown', () => {
  const slow = createQualitySampler();
  for (let frame = 0; frame < 120; frame++) sampleTheaterQuality(slow, 1 / 30);
  assert.equal(slow.tier, 0);
  const samples = slow.samples;
  for (const delta of [5, Infinity, NaN, -.1]) sampleTheaterQuality(slow, delta);
  sampleTheaterQuality(slow, 1 / 30, false);
  assert.equal(slow.samples, samples, 'idle/tab gaps never become performance samples');
  for (let frame = 0; frame < 60 * 4; frame++) sampleTheaterQuality(slow, 1 / 60);
  assert.equal(slow.tier, 0, 'cooldown prevents quality oscillation');
  for (let frame = 0; frame < 60 * 8; frame++) sampleTheaterQuality(slow, 1 / 60);
  assert.ok(slow.tier >= 1);
  const manual = theaterQualitySettings('high', slow);
  assert.equal(manual.dpr, 1.75); assert.equal(manual.shadowSize, 1024);
  assert.equal(theaterQualitySettings('low', slow).shadows, false);
  const snapshot = theaterPerformanceSnapshot(slow);
  assert.ok(snapshot.sampledSeconds >= 15); assert.ok(snapshot.estimatedFps > 59);
});

test('listener and speaker presentation stays bounded and never alters locomotion or detective chin IK', () => {
  const listener = conversationOffsets(.75, false, true), speaker = conversationOffsets(.75, true, false);
  assert.equal(listener.forearmX, 0);
  assert.notEqual(speaker.forearmX, 0);
  for (let time = 0; time < 40; time += .01) for (const emotion of ['calm', 'shaken', 'broken']) {
    const pose = conversationOffsets(time, true, true, emotion);
    assert.ok(Math.abs(pose.headX) < .09); assert.ok(Math.abs(pose.headY) < .025); assert.ok(Math.abs(pose.forearmX) < .03);
  }
});
