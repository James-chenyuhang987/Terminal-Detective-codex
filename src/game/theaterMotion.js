import { Matrix4, Vector3 } from 'three';
import { MAX_FRAME_DELTA, PLAYER_RADIUS, WALK_SPEED, movePlayer } from './theaterWorld.js';

const soleCache = new WeakMap();

export function createSoleGrounding(model) {
  const meshes = [];
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    let indices = soleCache.get(mesh.geometry);
    if (!indices) {
      const positions = mesh.geometry.attributes.position;
      const joints = mesh.geometry.attributes.skinIndex;
      const weights = mesh.geometry.attributes.skinWeight;
      indices = [];
      const point = new Vector3();
      for (let index = 0; index < positions.count; index++) {
        if (weights.getX(index) < 0.99 || !/^Foot[LR]$/.test(mesh.skeleton.bones[joints.getX(index)].name)) continue;
        const y = point.fromBufferAttribute(positions, index).applyMatrix4(mesh.bindMatrix).y;
        if (Math.abs(y) < 0.001) indices.push(index);
      }
      soleCache.set(mesh.geometry, indices);
    }
    if (indices.length) meshes.push({ mesh, indices });
  });
  return { meshes, point: new Vector3(), inverse: new Matrix4(), transform: new Matrix4() };
}

/** Skin-blend interpolation is not IK. Lift only the model when blended soles cross its floor. */
export function soleGroundOffset(grounding, model) {
  model.updateWorldMatrix(true, false);
  model.updateMatrixWorld(true);
  grounding.inverse.copy(model.matrixWorld).invert();
  let lowest = 0;
  for (const { mesh, indices } of grounding.meshes) {
    mesh.skeleton.update();
    grounding.transform.multiplyMatrices(grounding.inverse, mesh.matrixWorld);
    for (const index of indices) {
      mesh.getVertexPosition(index, grounding.point).applyMatrix4(grounding.transform);
      lowest = Math.min(lowest, grounding.point.y);
    }
  }
  return -lowest;
}

export function stopLocomotion(state) {
  state.velocityX = 0;
  state.velocityZ = 0;
  state.speed = 0;
  state.distance = 0;
  state.walking = false;
}

/** Presentation-only velocity; actual collision-resolved distance drives the gait. */
export function stepLocomotion(state, direction, rawDelta, room, { allowed = true, reducedMotion = false, speed = WALK_SPEED } = {}) {
  const delta = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, MAX_FRAME_DELTA)) : 0;
  const magnitude = Math.hypot(direction[0], direction[1]);
  if (!allowed || !delta || !magnitude) { stopLocomotion(state); return state; }
  const targetX = direction[0] / magnitude * speed;
  const targetZ = direction[1] / magnitude * speed;
  const oldX = state.velocityX || 0;
  const oldZ = state.velocityZ || 0;
  const decay = reducedMotion ? 0 : Math.exp(-12 * delta);
  state.velocityX = targetX + (oldX - targetX) * decay;
  state.velocityZ = targetZ + (oldZ - targetZ) * decay;
  // Integrate the exponential analytically so acceleration travels equally at 30/60/144 Hz.
  const average = reducedMotion ? 0 : (1 - decay) / (12 * delta);
  const averageX = targetX + (oldX - targetX) * average;
  const averageZ = targetZ + (oldZ - targetZ) * average;
  state.stepDirection ||= [0, 0];
  state.nextPosition ||= [0, 0, 0];
  state.stepDirection[0] = averageX / speed;
  state.stepDirection[1] = averageZ / speed;
  const next = movePlayer(state.position, state.stepDirection, delta, room, PLAYER_RADIUS, speed, state.nextPosition);
  const dx = next[0] - state.position[0];
  const dz = next[2] - state.position[2];
  state.distance = Math.hypot(dx, dz);
  state.speed = state.distance / delta;
  state.walking = state.speed > 0.015;
  if (state.walking) {
    state.nextPosition = state.position;
    state.position = next;
    const angle = Math.atan2(dx, dz);
    const difference = Math.atan2(Math.sin(angle - state.rotationY), Math.cos(angle - state.rotationY));
    state.rotationY += difference * (reducedMotion ? 1 : 1 - Math.exp(-delta * 18));
  } else {
    state.speed = 0;
    state.distance = 0;
  }
  // Remove velocity into blocked axes; held keys cannot accumulate a release lurch.
  if (Math.abs(dx) < Math.abs(averageX * delta) * 0.1) state.velocityX = 0;
  if (Math.abs(dz) < Math.abs(averageZ * delta) * 0.1) state.velocityZ = 0;
  return state;
}

export function createAvatarAnimation(mixer, clips) {
  const actions = Object.fromEntries(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  for (const [name, action] of Object.entries(actions)) action.setEffectiveWeight(name === 'Idle' ? 1 : 0).play();
  return { mixer, actions, walkWeight: 0, talkWeight: 0 };
}

/** Walk never resets: phase is advanced only by traversed distance, not wall-clock stalls. */
export function updateAvatarAnimation(animation, rawDelta, { speed = 0, authoredSpeed = WALK_SPEED, talking = false, frozen = false, reducedMotion = false } = {}) {
  const delta = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, MAX_FRAME_DELTA)) : 0;
  if (frozen) return;
  const walking = speed > 0.015 && !reducedMotion;
  const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 18);
  animation.walkWeight += (Number(walking) - animation.walkWeight) * blend;
  animation.talkWeight += (Number(talking && !walking && !reducedMotion) - animation.talkWeight) * blend;
  animation.actions.Walk.setEffectiveWeight(animation.walkWeight).setEffectiveTimeScale(walking ? speed / authoredSpeed : 0).play();
  animation.actions.Talk.setEffectiveWeight(animation.talkWeight).play();
  animation.actions.Idle.setEffectiveWeight(Math.max(0, 1 - animation.walkWeight - animation.talkWeight)).play();
  animation.mixer.update(reducedMotion ? 0 : delta);
}
