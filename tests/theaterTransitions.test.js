import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AnimationMixer, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createAvatarAnimation, updateAvatarAnimation } from '../src/game/theaterMotion.js';

const bytes = readFileSync(new URL('../public/assets/theater/detective.glb', import.meta.url));
const detective = new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
const rates = [30, 60, 144];

async function avatar() {
  const gltf = await detective;
  const model = clone(gltf.scene);
  const animation = createAvatarAnimation(new AnimationMixer(model), gltf.animations);
  const update = (delta, options) => {
    updateAvatarAnimation(animation, delta, options);
    model.updateMatrixWorld(true);
    for (const [name, actions] of Object.entries({ upper: animation.actions, lower: animation.locomotionActions })) {
      assert.ok(actions, `The ${name} body must have its own blend`);
      const weights = Object.values(actions).map(action => action.getEffectiveWeight());
      assert.ok(weights.every(weight => weight >= 0 && weight <= 1), `${name} weights stay within their poses`);
      assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-10,
        `${name} weights stay normalized while moving and reversing conversations`);
    }
  };
  update(0);
  return { model, animation, update };
}

function position(model, name) {
  return model.getObjectByName(name).getWorldPosition(new Vector3());
}

test('leaving a conversation preserves the actual distance-driven leg pose while the thinking arm lowers', async () => {
  const legBones = ['Hips', 'ThighL', 'ShinL', 'FootL', 'ThighR', 'ShinR', 'FootR'];
  for (const hz of rates) {
    const talking = await avatar();
    const baseline = await avatar();
    for (let frame = 0; frame < hz; frame++) {
      talking.update(1 / hz, { talking: true });
      baseline.update(1 / hz);
    }
    const raised = position(talking.model, 'HandR');
    let previous = raised.clone();
    let previousVelocity = null;
    for (let frame = 0; frame < hz; frame++) {
      const options = { speed: 1.4, distance: 1.4 / hz };
      talking.update(1 / hz, options);
      baseline.update(1 / hz, options);
      assert.ok(Math.abs(talking.animation.actions.Walk.time - baseline.animation.actions.Walk.time) < 1e-9,
        `${hz} Hz: a held Talk pose must not delay the travelled Walk phase`);
      for (const name of legBones) {
        const actual = talking.model.getObjectByName(name);
        const expected = baseline.model.getObjectByName(name);
        assert.ok(actual.getWorldPosition(new Vector3()).distanceTo(expected.getWorldPosition(new Vector3())) < 1e-5,
          `${hz} Hz: Talk must not dilute ${name}'s walking position at frame ${frame}`);
        assert.ok(actual.getWorldQuaternion(new Quaternion()).normalize().angleTo(expected.getWorldQuaternion(new Quaternion()).normalize()) < 1e-5,
          `${hz} Hz: Talk must not dilute ${name}'s walking rotation at frame ${frame}`);
      }
      const hand = position(talking.model, 'HandR');
      const velocity = hand.clone().sub(previous).multiplyScalar(hz);
      // The arm lowers while its destination also starts swinging. Its
      // combined speed can exceed the isolated Idle/Talk gesture, but that
      // added motion must remain continuous rather than introducing a jump.
      assert.ok(velocity.length() < 4.2,
        `${hz} Hz frame ${frame}: the raised wrist lowers continuously, got ${velocity.length()} m/s`);
      if (previousVelocity) assert.ok(velocity.clone().sub(previousVelocity).length() * hz < 60,
        `${hz} Hz frame ${frame}: combining Talk and Walk must not snap the wrist velocity`);
      previousVelocity = velocity;
      previous = hand;
    }
    assert.ok(position(talking.model, 'HandR').distanceTo(position(baseline.model, 'HandR')) < .002,
      'The arm returns to the same walking pose after the conversation fade');
    assert.ok(raised.y - previous.y > .3, 'The thinking arm actually lowers when walking resumes');
  }
});

test('release freezes the actual gait immediately and eases the leaning head back without a first-frame snap', async () => {
  for (const hz of rates) {
    // Include both passing and maximum stride poses, where an exponential
    // weight drop used to retract the head and the raised foot abruptly.
    for (const phase of [0, .19, .36, .5, .69, .86]) {
      const current = await avatar();
      const idle = await avatar();
      for (let frame = 0; frame < hz; frame++) {
        current.update(1 / hz, { speed: 1.4, distance: 1.4 / hz });
        idle.update(1 / hz);
      }
      current.animation.actions.Walk.time = phase;
      current.update(0, { speed: 1.4, distance: 0 });
      const stoppedPhase = current.animation.actions.Walk.time;
      let previous = position(current.model, 'Head');
      for (let frame = 0; frame < hz; frame++) {
        current.update(1 / hz, { speed: 0, distance: 0 });
        idle.update(1 / hz);
        const head = position(current.model, 'Head');
        const speed = head.distanceTo(previous) * hz;
        if (frame === 0) assert.ok(speed < .25,
          `${hz} Hz phase ${phase}: stopped torso must start returning gently, got ${speed} m/s`);
        if (frame > hz * .8) assert.ok(speed < .12,
          `${hz} Hz phase ${phase}: the head must settle back into standing`);
        assert.equal(current.animation.actions.Walk.time, stoppedPhase, 'No settling step may advance after release');
        previous = head;
      }
      assert.ok(position(current.model, 'Head').distanceTo(position(idle.model, 'Head')) < .002,
        `${hz} Hz phase ${phase}: stopped posture returns completely to Idle`);
    }
  }
});

test('rapid conversation reversals preserve wrist velocity and keep the gesture within its authored poses', async () => {
  for (const hz of rates) {
    const current = await avatar();
    let previous = position(current.model, 'HandR');
    let previousVelocity = new Vector3();
    let previousTalking = false;
    const reversals = new Set([.2, .3, .42, .5, .7].map(time => Math.round(time * hz)));
    let talking = true;
    let checkedReversals = 0;
    for (let frame = 0; frame < hz * 2; frame++) {
      if (reversals.has(frame)) talking = !talking;
      current.update(1 / hz, { talking });
      const hand = position(current.model, 'HandR');
      const velocity = hand.clone().sub(previous).multiplyScalar(hz);
      if (frame > 0 && talking !== previousTalking) {
        const acceleration = velocity.clone().sub(previousVelocity).length() * hz;
        assert.ok(acceleration < 60,
          `${hz} Hz frame ${frame}: changing Talk direction must not reset the wrist velocity, got ${acceleration} m/s²`);
        checkedReversals++;
      }
      assert.ok(current.animation.talkWeight >= 0 && current.animation.talkWeight <= 1,
        'Repeated reversals cannot overshoot the authored arm poses');
      previous = hand;
      previousVelocity = velocity;
      previousTalking = talking;
    }
    assert.equal(checkedReversals, reversals.size);
    assert.ok(current.animation.talkWeight < 1e-9, 'The final close eventually returns the arm fully to rest');
  }
});
