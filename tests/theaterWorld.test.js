import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL_CASES } from '../src/game/caseData.js';
import { createInitialGameState } from '../src/game/gameState.js';
import { SCENE_FILES, CHARACTER_FILES, PLAYER_RADIUS, MAX_FRAME_DELTA, WALK_SPEED, sceneForZone, validateTheaterManifest, withNpcColliders, isWalkable, cameraRelativeMovement, movePlayer, characterRole, stageNpcs, interactionTargets, targetKey, nearestTarget, interactionIntent, restoreSpatial, isViewportKeyTarget } from '../src/game/theaterWorld.js';

function manifest() {
  return {
    version: 1, units: 'meters', upAxis: 'Y', forwardAxis: '+Z', spawn: [0, 0, 3],
    scenes: Object.fromEntries(Object.entries(SCENE_FILES).map(([key, file]) => [key, {
      file, bounds: { min: [-6, -0.2, -5], max: [6, 3.5, 5] }, spawn: [0, 0, 3],
      colliders: [{ id: 'desk', min: [-5, -3.5], max: [-3, -2.5] }],
      doors: [{ id: 'exit', position: [0, 0, -4.65], width: 1.6 }],
      hotspots: [{ id: 'workstation', position: [-3.6, 0, -1.55], radius: 1.15 }, { id: 'evidence', position: [3.7, 0, -1.7], radius: 1.15 }],
      npcs: [{ role: 'witness', position: [-2.1, 0, 0.25], rotationY: 0.25 }, { role: 'security', position: [2.1, 0, 1.35], rotationY: -0.35 }, { role: 'scientist', position: [2.1, 0, -2.25], rotationY: -0.25 }],
    }])),
    characters: Object.fromEntries(Object.entries(CHARACTER_FILES).map(([key, file]) => [key, { file, height: 1.75, bounds: { min: [-0.4, 0, -0.2], max: [0.4, 1.75, 0.2] }, animations: ['Idle', 'Walk', 'Talk'] }])),
  };
}
const room = () => validateTheaterManifest(manifest()).scenes.office;
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function close(actual, expected, tolerance = 1e-8) { assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`); }

test('authored first-case scenes and semantic variants map to local allowlisted GLBs; generic rooms use office', () => {
  for (const [zone, scene] of Object.entries({ zone_datacenter: 'datacenter', zone_lobby: 'lobby', zone_lab: 'laboratory', zone_balcony: 'balcony', zone_server: 'datacenter', zone_lab_core: 'laboratory', zone_archive_lab: 'laboratory', zone_restoration_lab: 'laboratory', zone_laboratory: 'laboratory', 'DATA-CENTER': 'datacenter', zone_backroom: 'office', zone_lounge: 'office', zone_collaboration: 'office' })) assert.equal(sceneForZone(zone), scene);
  for (const caseData of ALL_CASES) for (const zone of Object.keys(caseData.scene.zones)) assert.ok(Object.hasOwn(SCENE_FILES, sceneForZone(zone)));
  assert.equal(sceneForZone(null), 'office');
  assert.equal(sceneForZone('__proto__'), 'office');
});

test('manifest extraction copies only safe public geometry and never trusts asset paths or labels', () => {
  const source = manifest();
  source.scenes.office.hiddenClue = 'not-for-rendering';
  source.scenes.office.hotspots[0].label = 'undiscovered secret';
  const validated = validateTheaterManifest(freeze(source));
  assert.equal(validated.scenes.office.hiddenClue, undefined);
  assert.equal(validated.scenes.office.hotspots[0].label, undefined);
  validated.scenes.office.spawn[0] = 1;
  assert.deepEqual(source.scenes.office.spawn, [0, 0, 3]);
  for (const path of ['https://example.com/office.glb', '//example.com/office.glb', '../office.glb', 'office.glb?redirect=1']) {
    const invalid = manifest(); invalid.scenes.office.file = path;
    assert.throws(() => validateTheaterManifest(invalid), /bundled office.glb/);
  }
});

test('exported decimal collider identifiers and center-based walking bounds are supported', () => {
  const source = manifest();
  source.walkableBounds = { min: [-5.5, -4.6], max: [5.5, 4.6] };
  source.scenes.office.colliders[0].id = 'side-wall--5.86';
  const geometry = validateTheaterManifest(source).scenes.office;
  assert.equal(geometry.colliders[0].id, 'side-wall--5.86');
  assert.ok(isWalkable([5.5, 0, 4.6], geometry));
  assert.equal(isWalkable([5.51, 0, 0], geometry), false);
  assert.equal(isWalkable([0, 0, 4.61], geometry), false);
  let player = [0, 0, 3];
  for (let frame = 0; frame < 400; frame++) player = movePlayer(player, [1, 1], 1 / 60, geometry);
  close(player[0], 5.5, 0.001); close(player[2], 4.6, 0.001);
  source.walkableBounds.min[0] = -7;
  assert.throws(() => validateTheaterManifest(source), /walkableBounds must fit/);
  source.walkableBounds.min[0] = Infinity;
  assert.throws(() => validateTheaterManifest(source), /walkableBounds.min/);
});

test('malformed or unsafe manifest geometry produces explanatory asset errors', () => {
  const mutations = [
    input => { input.version = 2; }, input => { input.units = 'cm'; }, input => { input.upAxis = 'Z'; }, input => { input.forwardAxis = '-Z'; },
    input => { input.spawn = [Infinity, 0, 3]; }, input => { input.scenes.office.bounds.min = [0, 0, 0]; input.scenes.office.bounds.max = [0, 0, 0]; },
    input => { input.scenes.office.spawn = [-4, 0, -3]; }, input => { input.scenes.office.spawn = [30, 0, 0]; },
    input => { input.scenes.office.colliders[0].min = [NaN, 0]; }, input => { input.scenes.office.colliders[0].max = [-9, -10]; },
    input => { input.scenes.office.hotspots[0].position = [0, 8, 0]; }, input => { input.scenes.office.hotspots[0].radius = -1; },
    input => { input.scenes.office.doors[0].width = Infinity; }, input => { input.scenes.office.doors.push(input.scenes.office.doors[0]); },
    input => { input.scenes.office.npcs[0].rotationY = NaN; }, input => { input.scenes.office.npcs[0].role = 'culprit'; },
    input => { input.scenes.office.npcs[0].position = [-4, 0, -3]; }, input => { input.scenes.office.npcs = []; },
    input => { input.characters.detective.file = 'https://example.com/detective.glb'; }, input => { input.characters.detective.animations = ['Idle']; },
    input => { input.characters.detective.height = 0; },
    input => { input.characters.detective.locomotion = { speed: Infinity, duration: 1 }; },
    input => { input.characters.detective.locomotion = { speed: 1.4, duration: 0 }; },
    input => { input.characters.detective.locomotion = null; },
  ];
  for (const mutate of mutations) { const invalid = manifest(); mutate(invalid); assert.throws(() => validateTheaterManifest(invalid), /Theater asset manifest:/); }
  for (const invalid of [null, {}, [], 'bad']) assert.throws(() => validateTheaterManifest(invalid), /Theater asset manifest:/);
});

test('camera-relative WASD is normalized, cancels opposites and follows the orbit yaw', () => {
  assert.deepEqual(cameraRelativeMovement({ forward: true }), [0, -1]);
  const orbit = cameraRelativeMovement({ forward: true }, Math.PI / 2);
  close(orbit[0], -1); close(orbit[1], 0);
  const strafe = cameraRelativeMovement({ right: true }, Math.PI / 2);
  close(strafe[0], 0); close(strafe[1], -1);
  close(Math.hypot(...cameraRelativeMovement({ forward: true, right: true })), 1);
  assert.deepEqual(cameraRelativeMovement({ forward: true, backward: true, left: true, right: true }), [0, 0]);
  assert.deepEqual(cameraRelativeMovement(null), [0, 0]);
});

test('capsule stays within xz bounds, stops at colliders and slides along furniture', () => {
  const geometry = room();
  geometry.colliders = [{ id: 'thin-wall', min: [0, -4], max: [0.01, 4] }];
  let position = [-1, 0, 0];
  for (let i = 0; i < 300; i++) position = movePlayer(position, [1, 0], 1 / 60, geometry);
  close(position[0], -PLAYER_RADIUS, 0.001);
  for (let i = 0; i < 100; i++) position = movePlayer(position, [1, 1], 1 / 60, geometry);
  close(position[2], WALK_SPEED * 100 / 60 / Math.sqrt(2), 0.001);
  assert.ok(isWalkable(position, geometry));
  geometry.colliders = [];
  for (let i = 0; i < 1000; i++) position = movePlayer(position, [1, 1], 1 / 60, geometry);
  close(position[0], 6 - PLAYER_RADIUS, 0.001);
  close(position[2], 5 - PLAYER_RADIUS, 0.001);
});

test('interview characters are solid without changing the authored room geometry', () => {
  const geometry = freeze(room());
  const staged = stageNpcs(ALL_CASES[0].npcs, geometry, 'Lvl_01');
  const movementRoom = withNpcColliders(geometry, staged);
  assert.equal(movementRoom.colliders.length, geometry.colliders.length + staged.length);
  assert.equal(geometry.colliders.length, 1);
  assert.ok(isWalkable(geometry.spawn, movementRoom));
  for (const npc of staged) {
    assert.equal(isWalkable(npc.position, movementRoom), false);
    let player = [npc.position[0], 0, npc.position[2] + 0.9];
    for (let frame = 0; frame < 120; frame++) player = movePlayer(player, [0, -1], 1 / 60, movementRoom);
    assert.ok(player[2] >= npc.position[2] + 0.2 + PLAYER_RADIUS - 0.001);
    assert.ok(isWalkable(player, movementRoom));
  }
});

test('ordinary frame rates produce the same walking distance and never mutate input positions', () => {
  const geometry = room();
  const start = freeze([0, 0, 3]);
  const simulate = hz => {
    let player = start;
    for (let frame = 0; frame < hz; frame++) player = movePlayer(player, [0, -1], 1 / hz, geometry);
    return player;
  };
  const slow = simulate(30);
  const fast = simulate(144);
  close(slow[2], fast[2]);
  close(start[2] - slow[2], WALK_SPEED);
  assert.deepEqual(start, [0, 0, 3]);
});

test('capsule footprint has rounded corners rather than a square-expanded blocker', () => {
  const geometry = room();
  geometry.colliders = [{ id: 'corner', min: [0, 0], max: [1, 1] }];
  assert.equal(isWalkable([-0.22, 0, -0.22], geometry), true);
  assert.equal(isWalkable([-0.1, 0, -0.1], geometry), false);
  assert.equal(isWalkable([0.5, 0, 0.5], geometry), false);
});

test('frame spikes and diagonal input cannot accelerate or tunnel through thin objects', () => {
  const geometry = room();
  const moved = movePlayer([0, 0, 3], [1, 1], 800, geometry);
  close(Math.hypot(moved[0], moved[2] - 3), WALK_SPEED * MAX_FRAME_DELTA);
  geometry.colliders = [{ id: 'thin', min: [0, -1], max: [0.001, 1] }];
  const stopped = movePlayer([-0.29, 0, 0], [1, 0], 1e6, geometry, PLAYER_RADIUS, 1e6);
  assert.ok(stopped[0] <= -PLAYER_RADIUS + 1e-6);
  assert.ok(isWalkable(stopped, geometry));
  for (const delta of [0, -1, NaN, Infinity]) assert.deepEqual(movePlayer([-1, 0, 0], [1, 0], delta, geometry), [-1, 0, 0]);
});

test('saved spatial state is copied and validated against the current room, never engine state', () => {
  const geometry = room();
  const saved = freeze({ position: [1, 0, 2], yaw: 8, pitch: 0.6, rotationY: 1 });
  const restored = restoreSpatial(saved, geometry);
  assert.deepEqual(restored.position, saved.position);
  assert.notStrictEqual(restored.position, saved.position);
  close(restored.yaw, 8 % (Math.PI * 2));
  const invalid = restoreSpatial({ position: [-4, 0, -3], yaw: NaN, pitch: 100 }, geometry);
  assert.deepEqual(invalid.position, geometry.spawn);
  assert.equal(invalid.yaw, 0);
  assert.equal(invalid.pitch, 1.05);
});

test('all eight cases stage every actual NPC in every room, only using public identity', () => {
  const geometry = room();
  assert.equal(ALL_CASES.length, 8);
  for (const caseData of ALL_CASES) {
    const npcs = caseData.npcs.map(npc => ({ npc_id: npc.npc_id, name: npc.name, role: npc.role,
      get personality() { throw new Error('private personality read'); }, get hidden() { throw new Error('hidden read'); }, get culprit() { throw new Error('culprit read'); },
    }));
    for (const zone of Object.keys(caseData.scene.zones)) {
      const staged = stageNpcs(npcs, geometry, caseData.case_id);
      assert.deepEqual(staged.map(npc => npc.npcId), npcs.map(npc => npc.npc_id), zone);
      assert.equal(new Set(staged.map(npc => npc.position.join(','))).size, npcs.length);
      assert.ok(staged.every(npc => isWalkable(npc.position, geometry)));
      assert.ok(staged.every(npc => Object.hasOwn(CHARACTER_FILES, npc.role)));
    }
  }
  assert.deepEqual(stageNpcs(ALL_CASES[0].npcs, geometry, 'Lvl_01').map(npc => npc.role), ['witness', 'security', 'scientist']);
  assert.equal(characterRole({ role: '大楼保安', name: 'Someone' }), 'security');
  assert.equal(characterRole({ role: 'Researcher' }), 'scientist');
  assert.equal(characterRole({ role: 'Head Bartender' }), 'witness');
  assert.equal(stageNpcs(Array.from({ length: 6 }, (_, i) => ({ npc_id: `npc_${i}`, name: 'Contact', role: 'Witness' })), geometry).length, 6);
});

test('nearest hotspots expose generic labels and exact intents; exploration cannot unlock clues or spend AP', () => {
  const geometry = room();
  for (const caseData of ALL_CASES) {
    const state = freeze(createInitialGameState(caseData));
    const before = structuredClone(state);
    const targets = interactionTargets(geometry, stageNpcs(caseData.npcs, geometry, caseData.case_id));
    for (const target of targets) {
      assert.equal(targetKey(nearestTarget(target.position, targets)), targetKey(target));
      const intent = interactionIntent(target);
      assert.deepEqual(Object.keys(intent), target.kind === 'npc' ? ['kind', 'npcId'] : ['kind', 'id']);
      assert.ok(['Talk / 交谈', 'Inspect workstation / 调查工作台', 'Inspect scene / 调查现场', 'Room routes / 区域通道'].includes(target.label));
    }
    assert.equal(nearestTarget([50, 0, 50], targets), null);
    assert.deepEqual(state, before);
  }
  assert.equal(interactionIntent({ kind: 'settle' }), null);
  assert.equal(targetKey(null), '');
  const target = { kind: 'investigate', id: 'public', position: [0, 0, 0], radius: 1 };
  assert.equal(nearestTarget([1, 0, 0], [target]), target);
  assert.equal(nearestTarget([1.01, 0, 0], [target]), null);
});

test('back-wall routes remain reachable before the capsule touches perimeter geometry', () => {
  const geometry = room();
  geometry.colliders.push({ id: 'back-wall', min: [-6, -5], max: [6, -4.5] });
  const targets = interactionTargets(geometry, []);
  const door = targets.find(target => target.kind === 'door');
  assert.ok(door.radius >= 1.3);
  let player = [0, 0, -3];
  for (let frame = 0; frame < 120; frame++) player = movePlayer(player, [0, -1], 1 / 60, geometry);
  assert.ok(isWalkable(player, geometry));
  assert.equal(nearestTarget(player, targets), door);
  assert.deepEqual(interactionIntent(door), { kind: 'door', id: 'exit' });
});

test('keyboard ownership excludes form fields, editable content, buttons and page-level targets', () => {
  const viewport = { contains: target => target.inside === true };
  const canvas = { tagName: 'CANVAS', inside: true, closest: () => null };
  assert.equal(isViewportKeyTarget(canvas, viewport), true);
  assert.equal(isViewportKeyTarget({ ...canvas, inside: false }, viewport), false);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SPAN']) assert.equal(isViewportKeyTarget({ inside: true, tagName, closest: () => ({}) }, viewport), false);
  assert.equal(isViewportKeyTarget(null, viewport), false);
});

test('renderer uses local GLBs, skinned clones, animations and intent-only focused controls', () => {
  const source = readFileSync(new URL('../src/components/game/theater/TheaterScene.jsx', import.meta.url), 'utf8');
  assert.match(source, /useGLTF\(/);
  assert.match(source, /new AnimationMixer\(model\)/);
  assert.match(source, /updateAvatarAnimation\(/);
  assert.doesNotMatch(source, /useAnimations\(|intersectObject\(/);
  assert.match(source, /SkeletonUtils/);
  assert.match(source, /dispose=\{null\}/);
  assert.match(source, /webglcontextlost/);
  assert.match(source, /const background = live.current.suspended \|\|/);
  assert.match(source, /if \(!live.current.suspended && !document.hidden && input.current.windowActive\) invalidate\(\)/);
  assert.match(source, /useEffect\(\(\) => \{ if \(!suspended\) invalidate\(\); \}, \[suspended, invalidate\]\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /isViewportKeyTarget/);
  assert.match(source, /useProgress\(/);
  assert.doesNotMatch(source, /requestPointerLock|useGLTF\.preload|setGameState|applySettlementResult|unlocked_clues|personality|culprit/);
});
