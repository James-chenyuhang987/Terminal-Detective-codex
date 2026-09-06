import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimationClip, AnimationMixer, Group, NumberKeyframeTrack } from 'three';
import { createAvatarAnimation, stepLocomotion, stopLocomotion, updateAvatarAnimation } from '../src/game/theaterMotion.js';
import { WALK_SPEED, isWalkable } from '../src/game/theaterWorld.js';

const room = { bounds: { min: [-6, 0, -5], max: [6, 4, 5] }, spawn: [0, 0, 3], colliders: [] };
const player = () => ({ position: [0, 0, 3], rotationY: Math.PI });
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('accelerated walking integrates consistently at 30/60/144 Hz and never exceeds authored speed', () => {
  const distances = [];
  for (const hz of [30, 60, 144]) {
    const state = player();
    for (let frame = 0; frame < hz * 2; frame++) {
      stepLocomotion(state, [0, -1], 1 / hz, room);
      assert.ok(state.speed <= WALK_SPEED + 1e-8);
      if (frame === 0) assert.ok(state.speed < WALK_SPEED * 0.2);
    }
    distances.push(3 - state.position[2]);
  }
  close(distances[0], distances[1]); close(distances[0], distances[2]);
  close(distances[0], WALK_SPEED * (2 - (1 - Math.exp(-24)) / 12));
});

test('released/cancelled input, pause and suspend stop immediately with no stale velocity on resuming', () => {
  for (const cancel of ['released', 'not-allowed', 'clear']) {
    const state = player();
    for (let frame = 0; frame < 30; frame++) stepLocomotion(state, [0, -1], 1 / 60, room);
    const position = [...state.position];
    if (cancel === 'clear') stopLocomotion(state);
    else stepLocomotion(state, cancel === 'released' ? [0, 0] : [0, -1], 1 / 60, room, { allowed: cancel !== 'not-allowed' });
    assert.deepEqual(state.position, position);
    assert.equal(state.speed, 0); assert.equal(state.walking, false);
    stepLocomotion(state, [0, 0], 1 / 60, room);
    assert.deepEqual(state.position, position);
    stepLocomotion(state, [0, -1], 1 / 60, room);
    assert.ok(state.speed < WALK_SPEED * 0.1);
  }
});

test('blocked motion stops the gait without vibration and sliding uses actual distance/heading', () => {
  const wallRoom = { ...room, colliders: [{ min: [-4, 0], max: [4, 0.05] }] };
  const state = player();
  for (let frame = 0; frame < 240; frame++) stepLocomotion(state, [0, -1], 1 / 60, wallRoom);
  assert.ok(isWalkable(state.position, wallRoom));
  close(state.position[2], 0.33, 0.001);
  const stopped = [...state.position];
  for (let frame = 0; frame < 120; frame++) {
    stepLocomotion(state, [0, -1], 1 / 60, wallRoom);
    assert.equal(state.walking, false); assert.equal(state.speed, 0);
    assert.deepEqual(state.position, stopped);
  }
  for (let frame = 0; frame < 30; frame++) stepLocomotion(state, [1, -1], 1 / 60, wallRoom);
  assert.ok(state.position[0] > 0.3); close(state.position[2], stopped[2], 0.0001);
  close(state.rotationY, Math.PI / 2, 0.005);
  assert.ok(state.speed < WALK_SPEED * 0.72);
});

test('direction reversals decelerate before changing heading; reduced motion and frame spikes are safe', () => {
  const state = player();
  for (let frame = 0; frame < 60; frame++) stepLocomotion(state, [0, -1], 1 / 60, room);
  const z = state.position[2];
  stepLocomotion(state, [0, 1], 1 / 60, room);
  assert.ok(state.position[2] < z, 'velocity reverses smoothly, not an instant heading snap');
  assert.ok(state.speed < WALK_SPEED);
  const before = [...state.position];
  stepLocomotion(state, [1, 0], 100, room, { reducedMotion: true });
  close(state.position[0] - before[0], WALK_SPEED * 0.05);
  close(state.rotationY, Math.PI / 2);
});

function animation() {
  const model = new Group();
  const clips = ['Idle', 'Walk', 'Talk'].map(name => new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[y]', [0, 0.5, 1], [0, 0.01, 0])]));
  return createAvatarAnimation(new AnimationMixer(model), clips);
}

test('walk phase follows real distance, never resets at stops, and independent clones cannot share mixer time', () => {
  const first = animation(); const second = animation();
  for (let frame = 0; frame < 30; frame++) updateAvatarAnimation(first, 1 / 60, { speed: WALK_SPEED / 2 });
  close(first.actions.Walk.time, 0.25);
  close(second.actions.Walk.time, 0);
  for (let frame = 0; frame < 30; frame++) updateAvatarAnimation(first, 1 / 60, { speed: 0 });
  close(first.actions.Walk.time, 0.25);
  assert.ok(first.actions.Walk.getEffectiveWeight() < 0.001);
  updateAvatarAnimation(first, 1 / 60, { speed: WALK_SPEED });
  close(first.actions.Walk.time, 0.25 + 1 / 60);
  const time = first.mixer.time;
  updateAvatarAnimation(first, 1 / 60, { speed: WALK_SPEED, frozen: true });
  close(first.mixer.time, time);
  updateAvatarAnimation(first, 1 / 60, { speed: WALK_SPEED, reducedMotion: true });
  close(first.actions.Walk.getEffectiveWeight(), 0);
  close(first.mixer.time, time);
});
