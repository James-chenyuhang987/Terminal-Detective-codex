import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AnimationClip, AnimationMixer, Bone, Box3, Group, NumberKeyframeTrack, Ray, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createAvatarAnimation, createFootLock, createSoleGrounding, soleGroundOffset, stepLocomotion, stopLocomotion, updateAvatarAnimation, updateFootLock } from '../src/game/theaterMotion.js';
import { SPRINT_SPEED, WALK_SPEED, isWalkable } from '../src/game/theaterWorld.js';

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

test('sprinting integrates consistently at 30/60/144 Hz and stays within 2.4 m/s', () => {
  const distances = [];
  for (const hz of [30, 60, 144]) {
    const state = player();
    for (let frame = 0; frame < hz * 2; frame++) {
      stepLocomotion(state, [0, -1], 1 / hz, room, { speed: SPRINT_SPEED, sprinting: true });
      assert.ok(state.speed <= SPRINT_SPEED + 1e-8);
      if (frame === 0) assert.ok(state.speed < SPRINT_SPEED * 0.2);
      assert.equal(state.sprinting, true);
    }
    distances.push(3 - state.position[2]);
  }
  close(distances[0], distances[1]); close(distances[0], distances[2]);
  close(distances[0], SPRINT_SPEED * (2 - (1 - Math.exp(-24)) / 12));
});

test('interaction Talk clips start at a clear beat and pause when the conversation ends', () => {
  const instance = animation();
  updateAvatarAnimation(instance, 1 / 60, { speed: 0, talking: false });
  close(instance.actions.Talk.time, 0);
  updateAvatarAnimation(instance, 1 / 60, { speed: 0, talking: true });
  assert.ok(instance.actions.Talk.time > 0 && instance.actions.Talk.time < .05);
  assert.ok(instance.actions.Talk.getEffectiveWeight() > 0);
  const endTime = instance.actions.Talk.time;
  for (let frame = 0; frame < 30; frame++) updateAvatarAnimation(instance, 1 / 60, { speed: 0, talking: false });
  assert.ok(instance.actions.Talk.getEffectiveWeight() < .01);
  close(instance.actions.Talk.time, endTime, 1e-6);
  updateAvatarAnimation(instance, 1 / 60, { speed: 0, talking: true });
  assert.ok(instance.actions.Talk.time > 0 && instance.actions.Talk.time < .05, 'a new interaction restarts the greeting beat');
});

test('conversation gestures ease in and out over 0.5 seconds independently of frame rate', () => {
  for (const hz of [30, 60, 144]) {
    const instance = animation();
    const advance = (seconds, options) => {
      for (let elapsed = 0; elapsed < seconds - 1e-10;) {
        const delta = Math.min(1 / hz, seconds - elapsed);
        updateAvatarAnimation(instance, delta, options);
        elapsed += delta;
      }
    };
    updateAvatarAnimation(instance, 1 / hz, { talking: true });
    assert.ok(instance.talkWeight < .01, 'the arm starts gently instead of snapping upwards');
    advance(.25 - 1 / hz, { talking: true });
    close(instance.talkWeight, .5);
    advance(.25, { talking: true });
    close(instance.talkWeight, 1);
    const time = instance.actions.Talk.time;
    updateAvatarAnimation(instance, 1 / hz, { talking: false });
    assert.ok(instance.talkWeight > .99, 'lowering the arm also starts gently');
    advance(.25 - 1 / hz, { talking: false });
    close(instance.talkWeight, .5);
    advance(.25, { talking: false });
    close(instance.talkWeight, 0);
    close(instance.actions.Talk.time, time, 1e-6);
  }
});

test('conversation fades freeze in the background and respect reduced motion without a stale pose', () => {
  const instance = animation();
  for (let frame = 0; frame < 10; frame++) updateAvatarAnimation(instance, 1 / 60, { talking: true });
  const weight = instance.talkWeight;
  const time = instance.actions.Talk.time;
  for (let frame = 0; frame < 30; frame++) updateAvatarAnimation(instance, 1 / 60, { talking: false, frozen: true });
  close(instance.talkWeight, weight);
  close(instance.actions.Talk.time, time);
  updateAvatarAnimation(instance, 1 / 60, { talking: true, reducedMotion: true });
  close(instance.talkWeight, 0);
  close(instance.actions.Idle.getEffectiveWeight(), 1);
  close(instance.actions.Talk.time, time);
  updateAvatarAnimation(instance, 1 / 60, { talking: false });
  close(instance.talkWeight, 0, 1e-6);
});

test('reopening dialogue while its arm is lowering resumes the visible gesture without snapping', () => {
  const model = new Group();
  const clips = [
    new AnimationClip('Idle', 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 0])]),
    new AnimationClip('Walk', 1, []),
    new AnimationClip('Talk', 1, [new NumberKeyframeTrack('.position[x]', [0, .5, 1], [0, 1, 0])]),
  ];
  const instance = createAvatarAnimation(new AnimationMixer(model), clips);
  for (let frame = 0; frame < 36; frame++) updateAvatarAnimation(instance, 1 / 60, { talking: true });
  for (let frame = 0; frame < 6; frame++) updateAvatarAnimation(instance, 1 / 60, { talking: false });
  const time = instance.actions.Talk.time;
  const position = model.position.x;
  assert.ok(instance.talkWeight > .9, 'the previous gesture is still visibly contributing');
  updateAvatarAnimation(instance, 1 / 60, { talking: true });
  close(instance.actions.Talk.time, time + 1 / 60);
  assert.ok(Math.abs(model.position.x - position) < .04, 'resuming a visible clip must not reset it to a different pose');
});

function thinkingCoatClearance(model) {
  model.updateMatrixWorld(true);
  const spine = model.getObjectByName('Spine');
  const toSpine = spine.matrixWorld.clone().invert();
  const glove = [], candidates = [];
  const posedVertex = ({ mesh, index }) => {
    const point = new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index);
    mesh.applyBoneTransform(index, point);
    return mesh.localToWorld(point);
  };
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const chest = new Set();
    for (let index = 0; index < position.count; index++) {
      const influences = Array.from({ length: 4 }, (_, component) => ({
        name: mesh.skeleton.bones[skinIndex.getComponent(index, component)].name,
        weight: skinWeight.getComponent(index, component),
      })).filter(({ weight }) => weight > .001);
      if (influences.every(({ name }) => name === 'HandR')) glove.push({ mesh, index });
      if (mesh.material.name === 'coat-noir' && influences.every(({ name }) => name === 'Spine')) chest.add(index);
    }
    const indices = mesh.geometry.index;
    for (let index = 0; index < indices.count; index += 3) {
      const triangle = [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)];
      if (triangle.every(vertex => chest.has(vertex))) {
        candidates.push(triangle.map(index => posedVertex({ mesh, index }).applyMatrix4(toSpine)));
      }
    }
  });
  // Isolate the continuous closed torso from separate lapels and collar
  // pieces. Join coincident vertices too, since glTF splits hard normals.
  const key = point => point.toArray().map(value => value.toFixed(5)).join(',');
  const neighbors = new Map();
  candidates.forEach((triangle, index) => triangle.forEach(point => {
    const position = key(point);
    if (!neighbors.has(position)) neighbors.set(position, []);
    neighbors.get(position).push(index);
  }));
  const seen = new Set(), components = [];
  for (let index = 0; index < candidates.length; index++) {
    if (seen.has(index)) continue;
    const component = [index];
    seen.add(index);
    for (let cursor = 0; cursor < component.length; cursor++) {
      for (const point of candidates[component[cursor]]) {
        for (const neighbor of neighbors.get(key(point))) {
          if (seen.has(neighbor)) continue;
          seen.add(neighbor);
          component.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  assert.ok(components[0]?.length > 200 && glove.length > 100, 'Measure the exported coat body and full glove surface');
  const triangles = components[0].map(index => candidates[index]);
  const bounds = new Box3().setFromPoints(triangles.flat());
  const ray = new Ray(new Vector3(), new Vector3(.173, .317, 1).normalize());
  const intersection = new Vector3();
  const contains = point => {
    if (!bounds.containsPoint(point)) return false;
    ray.origin.copy(point);
    const hits = [];
    for (const [a, b, c] of triangles) {
      if (!ray.intersectTriangle(a, b, c, false, intersection)) continue;
      const distance = point.distanceTo(intersection);
      if (!hits.some(hit => Math.abs(hit - distance) < .000001)) hits.push(distance);
    }
    return hits.length % 2 === 1;
  };
  assert.ok(contains(bounds.getCenter(new Vector3())), 'The torso surface must detect a probe inside the jacket');
  return { spine, glove, posedVertex, contains };
}

test('actual detective lifts one hand smoothly, holds it across Talk loops, then lowers it after dialogue', async () => {
  const bytes = readFileSync(new URL('../public/assets/theater/detective.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  for (const hz of [30, 60, 144]) {
    const model = clone(gltf.scene);
    const clearance = thinkingCoatClearance(model);
    const instance = createAvatarAnimation(new AnimationMixer(model), gltf.animations);
    const raisedHand = model.getObjectByName('HandR');
    const restingHand = model.getObjectByName('HandL');
    assert.ok(raisedHand && restingHand);
    updateAvatarAnimation(instance, 0);
    model.updateMatrixWorld(true);
    const idle = raisedHand.getWorldPosition(new Vector3());
    let previous = idle.clone();
    let lowestHold = Infinity;
    let highestHold = -Infinity;
    let firstRelease = null;
    const clearanceSamples = { lifting: 0, lowering: 0 };
    for (let frame = 0; frame < hz * 6; frame++) {
      const talking = frame < hz * 5;
      updateAvatarAnimation(instance, 1 / hz, { talking });
      model.updateMatrixWorld(true);
      const hand = raisedHand.getWorldPosition(new Vector3());
      const displacement = hand.distanceTo(previous);
      assert.ok(displacement * hz < 3.6, `${hz} Hz hand should travel continuously during the crossfade`);
      if (frame === 0 || frame === hz * 5) assert.ok(displacement < .006, 'raising and lowering start gently');
      // Test the real glove against the closed jacket throughout both
      // transitions. A fixed forward plane rejects safe paths beside the
      // waist while missing penetration by the back of a raised glove.
      if (instance.talkWeight > 0 && (instance.talkWeight < 1 || frame % Math.round(hz / 4) === 0)) {
        clearanceSamples[talking ? 'lifting' : 'lowering']++;
        const toSpine = clearance.spine.matrixWorld.clone().invert();
        for (const vertex of clearance.glove) {
          const point = clearance.posedVertex(vertex).applyMatrix4(toSpine);
          assert.ok(!clearance.contains(point), `${hz} Hz thinking glove penetrates the jacket at frame ${frame}, blend ${instance.talkWeight}: ${point.toArray()}`);
        }
      }
      if (frame > hz && talking) {
        lowestHold = Math.min(lowestHold, hand.y);
        highestHold = Math.max(highestHold, hand.y);
        assert.ok(restingHand.getWorldPosition(new Vector3()).y < idle.y + .06, 'only one arm is raised');
      }
      if (frame === hz * 5) firstRelease = hand.clone();
      previous.copy(hand);
    }
    assert.ok(lowestHold > idle.y + .4, 'the thinking hand remains raised throughout successive Talk loops');
    assert.ok(highestHold - lowestHold < .015, 'breathing never becomes a repeated arm drop');
    assert.ok(firstRelease.y - previous.y > .4, 'closing dialogue lowers the thinking hand');
    assert.ok(clearanceSamples.lifting > 0 && clearanceSamples.lowering > 0, 'sample the actual glove during both lift and release');
    assert.ok(previous.distanceTo(idle) < .002, 'the actual bones return to their Idle pose');
    close(instance.talkWeight, 0);
  }
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

test('releasing sprint clears the sprint state and does not leave a release impulse', () => {
  const state = player();
  for (let frame = 0; frame < 60; frame++) {
    stepLocomotion(state, [0, -1], 1 / 60, room, { speed: SPRINT_SPEED, sprinting: true });
  }
  assert.equal(state.sprinting, true);
  const position = [...state.position];
  stepLocomotion(state, [0, -1], 1 / 60, room, { speed: WALK_SPEED, sprinting: false });
  assert.equal(state.sprinting, false);
  assert.ok(state.speed <= WALK_SPEED + 1e-8);
  assert.ok(Math.hypot(state.velocityX, state.velocityZ) <= WALK_SPEED + 1e-8);
  assert.ok(state.position[2] < position[2]);
  stepLocomotion(state, [0, 0], 1 / 60, room, { speed: SPRINT_SPEED, sprinting: true });
  assert.equal(state.sprinting, false);
  assert.equal(state.speed, 0);
  assert.equal(state.distance, 0);
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

test('blocked sprinting cannot accumulate a release lurch', () => {
  const wallRoom = { ...room, colliders: [{ min: [-4, 0], max: [4, 0.05] }] };
  const state = player();
  for (let frame = 0; frame < 240; frame++) {
    stepLocomotion(state, [0, -1], 1 / 60, wallRoom, { speed: SPRINT_SPEED, sprinting: true });
  }
  const stopped = [...state.position];
  assert.equal(state.sprinting, false);
  assert.equal(state.speed, 0);
  for (let frame = 0; frame < 120; frame++) {
    stepLocomotion(state, [0, -1], 1 / 60, wallRoom, { speed: SPRINT_SPEED, sprinting: false });
    assert.deepEqual(state.position, stopped);
    assert.equal(state.sprinting, false);
    assert.equal(state.speed, 0);
  }
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

test('turn presentation lean decays after a blocked or released turn', () => {
  const state = player();
  for (let frame = 0; frame < 30; frame++) stepLocomotion(state, [0, -1], 1 / 60, room);
  stepLocomotion(state, [1, -1], 1 / 60, room);
  const turning = Math.abs(state.visualTurnRate || 0);
  assert.ok(turning > 0);
  stepLocomotion(state, [0, 0], 1 / 60, room);
  assert.ok(Math.abs(state.visualTurnRate) < turning);
});

test('actual Idle/Walk crossfades stay above the floor without moving the actor root or cached geometry', async () => {
  const bytes = readFileSync(new URL('../public/assets/theater/detective.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  let worstUncorrected = 0;
  let worstCorrected = 0;
  for (const offset of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    const model = clone(gltf.scene);
    const root = new Group(); root.add(model);
    root.position.set(2, 0, -1);
    root.rotation.y = offset * Math.PI * 2;
    const instance = createAvatarAnimation(new AnimationMixer(model), gltf.animations);
    const grounding = createSoleGrounding(model);
    const soleSamples = { L: [], R: [] };
    for (const { mesh, indices } of grounding.meshes) {
      for (const index of indices) {
        const joint = mesh.geometry.attributes.skinIndex.getX(index);
        const side = mesh.skeleton.bones[joint].name.slice(-1);
        soleSamples[side].push(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.bindMatrix));
      }
    }
    for (const samples of Object.values(soleSamples)) {
      assert.ok(samples.length >= 8, 'Grounding samples both complete soles regardless of shoe-upper topology');
      assert.ok(Math.min(...samples.map(point => point.z)) < -.065, 'Include the heel contact edge');
      assert.ok(Math.max(...samples.map(point => point.z)) > .18, 'Include the toe contact edge');
    }
    instance.actions.Walk.time = offset;
    const state = player();
    const positions = grounding.meshes.map(({ mesh }) => mesh.geometry.attributes.position.array.slice());
    for (let frame = 0; frame < 150; frame++) {
      stepLocomotion(state, frame < 60 ? [0, -1] : [0, 0], 1 / 60, room);
      updateAvatarAnimation(instance, 1 / 60, { speed: state.speed });
      model.position.y = 0;
      const lift = soleGroundOffset(grounding, model);
      worstUncorrected = Math.min(worstUncorrected, -lift);
      assert.ok(lift < 0.04, 'Correction stays narrowly limited to the measured blend penetration');
      model.position.y = lift;
      root.updateMatrixWorld(true);
      model.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
      worstCorrected = Math.min(worstCorrected, new Box3().setFromObject(model, true).min.y);
      close(soleGroundOffset(grounding, model), lift, 1e-6);
      assert.deepEqual(root.position.toArray(), [2, 0, -1], 'Grounding is model-only, not spatial/game state');
      close(root.rotation.y, offset * Math.PI * 2);
    }
    grounding.meshes.forEach(({ mesh }, index) => assert.deepEqual(mesh.geometry.attributes.position.array, positions[index]));
  }
  assert.ok(worstUncorrected < -0.02, 'Exercise the nonlinear IK crossfade regression, not just full Walk');
  assert.ok(worstCorrected >= -0.00001, `Blended floor penetration ${worstCorrected}`);
});

function animation() {
  const model = new Group();
  const clips = ['Idle', 'Walk', 'Talk'].map(name => new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[y]', [0, 0.5, 1], [0, 0.01, 0])]));
  return createAvatarAnimation(new AnimationMixer(model), clips);
}

test('owned mixer actions can restart after StrictMode effect cleanup', () => {
  const instance = animation();
  updateAvatarAnimation(instance, 1 / 60, { speed: WALK_SPEED });
  instance.mixer.stopAllAction();
  for (let frame = 0; frame < 30; frame++) updateAvatarAnimation(instance, 1 / 60, { speed: WALK_SPEED });
  close(instance.actions.Walk.time, 0.5);
  assert.equal(instance.mixer.stats.actions.inUse, 3);
  assert.ok(instance.mixer.stats.bindings.inUse > 0);
});

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

test('walk-to-idle waits for a stable contact phase and exposes damped stop state', () => {
  const instance = animation();
  // Reach the settled walking blend, then release near toe-off. Phase .45 is
  // deliberately outside the mid-stance window and should settle at .5.
  for (let frame = 0; frame < 30; frame++) updateAvatarAnimation(instance, 1 / 60, { speed: WALK_SPEED });
  instance.actions.Walk.time = .45;
  const before = instance.actions.Walk.time;
  updateAvatarAnimation(instance, 1 / 60, { speed: 0 });
  assert.ok(instance.actions.Walk.time > before, 'stop advances only to the next planted contact');
  assert.ok(instance.stopBlend < .1, 'Idle fade remains held while the foot is in transition');
  assert.equal(instance.contactPhase, 'left');
  assert.equal(instance.contact.safe, false);

  let sawSafe = false;
  let previousStopBlend = instance.stopBlend;
  for (let frame = 0; frame < 30; frame++) {
    updateAvatarAnimation(instance, 1 / 60, { speed: 0 });
    if (instance.contact.safe) sawSafe = true;
    assert.ok(instance.stopBlend + 1e-8 >= previousStopBlend, 'stop blend is monotonic after contact');
    previousStopBlend = instance.stopBlend;
  }
  assert.ok(sawSafe, 'stop transition reaches a planted contact phase');
  assert.ok(instance.stopBlend > .99);
  assert.equal(instance.locomotionState, 'idle');
});

test('Walk keeps its visible pose until the settling foot reaches contact at every display rate', () => {
  for (const hz of [30, 60, 144]) for (const releasePhase of [.401, .901]) {
    const instance = animation();
    for (let frame = 0; frame < hz; frame++) updateAvatarAnimation(instance, 1 / hz, { speed: WALK_SPEED });
    instance.actions.Walk.time = releasePhase;
    let heldFrames = 0;
    let fadedFrames = 0;
    for (let frame = 0; frame < hz; frame++) {
      const previousWeight = instance.actions.Walk.getEffectiveWeight();
      updateAvatarAnimation(instance, 1 / hz, { speed: 0, distance: 0 });
      const weight = instance.actions.Walk.getEffectiveWeight();
      if (!instance.contact.safe) {
        close(weight, previousWeight);
        heldFrames++;
      } else if (weight < previousWeight) fadedFrames++;
    }
    assert.ok(heldFrames > 0, `${hz} Hz: exercise a foot still settling before contact`);
    assert.ok(fadedFrames > 0, 'the pose fades normally after contact');
    assert.ok(instance.actions.Walk.getEffectiveWeight() < .001);
  }
});

test('optional collision-resolved distance drives walk phase independently of requested speed', () => {
  const instance = animation();
  updateAvatarAnimation(instance, 1 / 60, { speed: WALK_SPEED, distance: WALK_SPEED / 120 });
  close(instance.actions.Walk.time, 1 / 120);
  updateAvatarAnimation(instance, 1 / 60, { speed: WALK_SPEED, distance: 0 });
  close(instance.actions.Walk.time, 1 / 120);
  assert.equal(instance.contactPhaseValue, instance.gaitPhase);
});

test('distance-driven bones and contact phase are evaluated in the same frame at every display rate', () => {
  for (const duration of [1, 2]) {
    for (const hz of [30, 60, 144]) {
      const model = new Group();
      const clips = [new AnimationClip('Idle', duration, []), new AnimationClip('Talk', duration, []),
        new AnimationClip('Walk', duration, [new NumberKeyframeTrack('.position[z]', [0, duration], [0, duration])])];
      const instance = createAvatarAnimation(new AnimationMixer(model), clips);
      Object.assign(instance, { walkWeight: 1, startBlend: 1, stopBlend: 0, _wasWalking: true });
      let travel = 0;
      for (let frame = 0; frame < hz * 3; frame++) {
        // Alternating frame times expose a one-frame pose delay that constant
        // cadence and tests inspecting only action.time cannot detect.
        const delta = (frame % 2 ? 1.25 : .75) / hz;
        const speed = frame < hz ? WALK_SPEED : SPRINT_SPEED;
        travel += speed * delta;
        updateAvatarAnimation(instance, delta, { speed, distance: speed * delta });
        const time = (travel / WALK_SPEED) % duration;
        close(model.position.z, instance.actions.Walk.time, 1e-6);
        const phaseError = Math.abs(instance.gaitPhase - time / duration);
        assert.ok(Math.min(phaseError, 1 - phaseError) < 1e-6, 'phase follows cumulative travel across the seam');
        assert.equal(instance.contact.support, instance.supportFoot);
      }
    }
  }
});

test('foot lock preserves handoffs, bounds corrections and releases fully without moving the actor', () => {
  for (const hz of [30, 60, 144]) {
    const root = new Group();
    const model = new Group();
    for (const side of ['L', 'R']) {
      const foot = new Bone();
      foot.name = `Foot${side}`;
      foot.position.set(side === 'L' ? -.1 : .1, .1, 0);
      model.add(foot);
    }
    root.add(model);
    const instance = animation();
    const lock = createFootLock(model);
    const delta = 1 / hz;
    const step = phase => {
      instance.actions.Walk.time = phase;
      updateAvatarAnimation(instance, delta, { speed: WALK_SPEED, distance: 0 });
      updateFootLock(lock, instance, model, { delta, enabled: true });
    };
    step(.20);
    assert.equal(instance.contact.support, 'left');
    root.position.z = .15;
    for (let frame = 0; frame < hz / 4; frame++) {
      const previous = lock.applied.clone();
      step(.20);
      assert.ok(lock.applied.distanceTo(previous) <= .6 * delta + 1e-8);
    }
    assert.ok(lock.applied.length() > 0, 'the supporting foot receives a presentation lock');
    const beforeHandoff = lock.applied.clone();
    step(.70);
    assert.equal(instance.contact.support, 'right');
    assert.equal(lock.activeSide, 'right');
    assert.ok(lock.applied.distanceTo(beforeHandoff) < 1e-8, 'new support inherits the displayed correction');
    const beforeFreeze = lock.applied.clone();
    updateFootLock(lock, instance, model, { delta: 0, enabled: false });
    assert.deepEqual(lock.applied, beforeFreeze);
    for (let frame = 0; frame < hz * 2; frame++) {
      const length = lock.applied.length();
      updateFootLock(lock, instance, model, { delta, enabled: false });
      assert.ok(lock.applied.length() <= length + 1e-8, 'release decays without a reset or oscillation');
    }
    assert.equal(lock.applied.length(), 0);
    assert.equal(lock.activeSide, null);
    close(model.position.z, 0);
    close(root.position.z, .15, 1e-8);
  }
});

test('real Walk foot plants stay stable with the runtime phase and foot lock at walk and sprint speeds', async () => {
  const bytes = readFileSync(new URL('../public/assets/theater/detective.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  for (const hz of [30, 60, 144]) for (const speed of [WALK_SPEED, SPRINT_SPEED]) {
    const root = new Group();
    const model = clone(gltf.scene);
    root.add(model);
    const instance = createAvatarAnimation(new AnimationMixer(model), gltf.animations);
    const lock = createFootLock(model);
    Object.assign(instance, { walkWeight: 1, startBlend: 1, stopBlend: 0, _wasWalking: true });
    let anchor = null;
    let side = null;
    let samples = 0;
    for (let frame = 0; frame < hz * 3; frame++) {
      const delta = (frame % 2 ? 1.25 : .75) / hz;
      root.position.z += speed * delta;
      updateAvatarAnimation(instance, delta, { speed, distance: speed * delta });
      updateFootLock(lock, instance, model, { delta });
      if (lock.activeSide) {
        const foot = lock.bones[lock.activeSide].getWorldPosition(new Vector3());
        if (side === lock.activeSide) {
          assert.ok(foot.distanceTo(anchor) < .002, `${hz}Hz / ${speed}m/s: planted foot must not jitter`);
          samples++;
        } else anchor = foot;
      }
      side = lock.activeSide;
      assert.ok(lock.applied.length() < .002, 'a matching stride needs no visible whole-model correction');
    }
    assert.ok(samples > 10, 'exercise repeated left/right plants');
  }
});
