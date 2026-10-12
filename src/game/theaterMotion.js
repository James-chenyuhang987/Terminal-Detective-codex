import { Matrix4, Vector3 } from 'three';
import { MAX_FRAME_DELTA, PLAYER_RADIUS, WALK_SPEED, movePlayer } from './theaterWorld.js';

const soleCache = new WeakMap();
// The authored clip keeps the planted sole within a 0.42 m forward stride at
// the current 1.4 m/s walk speed. Allow that full stance span before
// re-anchoring so a sharp turn cannot create a visible periodic snap.
const FOOT_LOCK_MAX_OFFSET = .42;
const FOOT_LOCK_BLEND_RATE = 18;
const FOOT_LOCK_RELEASE_RATE = 12;

const DEFAULT_GAIT = Object.freeze({ stance: .56, heelEnd: .10, toeStart: .40, doubleSupport: .06 });
const LOCOMOTION_EPSILON = .015;

const clamp01 = value => Math.max(0, Math.min(1, value));
const wrapPhase = value => ((value % 1) + 1) % 1;

function gaitContact(phase, gait) {
  const leftPhase = wrapPhase(phase);
  const rightPhase = wrapPhase(phase - .5);
  const left = leftPhase < gait.stance || leftPhase === 0;
  const right = rightPhase < gait.stance || rightPhase === 0;
  const double = left && right;
  const leftMidStance = leftPhase >= gait.heelEnd && leftPhase <= gait.toeStart;
  const rightMidStance = rightPhase >= gait.heelEnd && rightPhase <= gait.toeStart;
  const support = double ? 'double' : left ? 'left' : right ? 'right' : 'none';
  return {
    phase: wrapPhase(phase),
    left,
    right,
    support,
    // During mid-stance the supporting foot is planted. Double support is
    // also a safe point to blend to Idle without asking the foot to teleport.
    safe: double || leftMidStance || rightMidStance,
  };
}

function nextContactBoundary(phase, gait) {
  const current = wrapPhase(phase);
  // The first frame of a heel contact is a stable place to finish a stop.
  const candidates = [0, gait.heelEnd, .5, .5 + gait.heelEnd, 1];
  for (const candidate of candidates) {
    if (candidate > current + 1e-6) return candidate;
  }
  return 1;
}

function writeContactState(animation, phase, gait) {
  const contact = gaitContact(phase, gait);
  animation.gaitPhase = contact.phase;
  // `walkPhase` and `contactPhaseValue` are aliases kept intentionally small
  // so consumers can inspect the normalized clip phase without knowing the
  // shape of the richer `contact` object.
  animation.walkPhase = contact.phase;
  animation.contactPhaseValue = contact.phase;
  animation.contactPhase = contact.support;
  animation.supportFoot = contact.support;
  animation.contact.left = contact.left;
  animation.contact.right = contact.right;
  animation.contact.double = contact.support === 'double';
  animation.contact.safe = contact.safe;
  animation.contact.phase = contact.phase;
  return contact;
}

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
        if (weights.getX(index) < 0.99 || !/^Foot\.?[LR]$/.test(mesh.skeleton.bones[joints.getX(index)].name)) continue;
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

function findFootBones(model) {
  const bones = { left: null, right: null };
  model.traverse(node => {
    if (!node.isBone) return;
    const match = /^(?:Foot\.?(L|R))$/.exec(node.name);
    if (match) bones[match[1] === 'L' ? 'left' : 'right'] = node;
  });
  return bones;
}

/**
 * Creates presentation-only state for a single support-foot lock. The lock
 * moves the avatar model in its parent-local X/Z plane; game-state position
 * and collision remain entirely authoritative elsewhere.
 */
export function createFootLock(model) {
  return {
    model,
    parent: model.parent || null,
    bones: findFootBones(model),
    activeSide: null,
    lockWeight: 0,
    applied: new Vector3(),
    anchorWorld: new Vector3(),
    rawWorld: new Vector3(),
    anchorLocal: new Vector3(),
    rawLocal: new Vector3(),
    targetLocal: new Vector3(),
    desiredLocal: new Vector3(),
  };
}

/**
 * Keeps the current single support foot in world X/Z while it is in the
 * authored mid-stance interval. The compensation is deliberately bounded and
 * damped; when support changes or the foot enters swing, it releases smoothly.
 */
export function updateFootLock(lock, animation, model = lock?.model, { delta = 0, enabled = true } = {}) {
  if (!lock || !model) return;
  const parent = model.parent || lock.parent;
  if (!parent) return;
  lock.parent = parent;

  // Remove only our previous horizontal compensation so all measurements are
  // taken from the authored pose and any external model transform is retained.
  model.position.x -= lock.applied.x;
  model.position.z -= lock.applied.z;
  lock.applied.set(0, 0, 0);
  parent.updateWorldMatrix(true, false);
  model.updateWorldMatrix(true, true);

  const contact = animation?.contact;
  const side = enabled && contact?.safe && !contact.double
    && (contact.support === 'left' || contact.support === 'right')
    ? contact.support : null;
  const bone = side ? lock.bones[side] : null;
  const rate = 1 - Math.exp(-Math.max(0, delta) * (side ? FOOT_LOCK_BLEND_RATE : FOOT_LOCK_RELEASE_RATE));

  if (bone) {
    bone.getWorldPosition(lock.rawWorld);
    if (lock.activeSide !== side) {
      // The new support is anchored exactly where it is after the old lock is
      // removed. This avoids a discontinuity during a left/right handoff.
      lock.activeSide = side;
      lock.anchorWorld.copy(lock.rawWorld);
      lock.lockWeight = 0;
    }
    parent.worldToLocal(lock.rawLocal.copy(lock.rawWorld));
    parent.worldToLocal(lock.anchorLocal.copy(lock.anchorWorld));
    lock.targetLocal.subVectors(lock.anchorLocal, lock.rawLocal);
    lock.targetLocal.y = 0;
    const length = Math.hypot(lock.targetLocal.x, lock.targetLocal.z);
    if (length > FOOT_LOCK_MAX_OFFSET) {
      // A blocked actor, a hard turn, or a mismatched clip can otherwise
      // accumulate an ever-growing offset. Re-anchor instead of distorting
      // the character when the authored pose no longer matches the root.
      lock.anchorWorld.copy(lock.rawWorld);
      lock.targetLocal.set(0, 0, 0);
    }
    lock.lockWeight += (1 - lock.lockWeight) * rate;
  } else {
    lock.lockWeight += (0 - lock.lockWeight) * rate;
    lock.targetLocal.set(0, 0, 0);
    if (lock.lockWeight < .001) {
      lock.lockWeight = 0;
      lock.activeSide = null;
    }
  }

  lock.desiredLocal.copy(lock.targetLocal).multiplyScalar(lock.lockWeight);
  lock.applied.lerp(lock.desiredLocal, rate);
  model.position.x += lock.applied.x;
  model.position.z += lock.applied.z;
  model.updateWorldMatrix(true, true);
}

export function stopLocomotion(state, decayDelta = 0) {
  state.velocityX = 0;
  state.velocityZ = 0;
  state.speed = 0;
  state.distance = 0;
  state.walking = false;
  state.turnRate = 0;
  state.visualTurnRate = decayDelta > 0
    ? (state.visualTurnRate || 0) * Math.exp(-decayDelta * 12)
    : 0;
}

/** Presentation-only velocity; actual collision-resolved distance drives the gait. */
export function stepLocomotion(state, direction, rawDelta, room, { allowed = true, reducedMotion = false, speed = WALK_SPEED } = {}) {
  const delta = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, MAX_FRAME_DELTA)) : 0;
  const magnitude = Math.hypot(direction[0], direction[1]);
  if (!allowed || !delta || !magnitude) { stopLocomotion(state, delta); return state; }
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
    const turn = difference * (reducedMotion ? 1 : 1 - Math.exp(-delta * 18));
    state.rotationY += turn;
    state.turnRate = turn / delta;
    const turnBlend = reducedMotion ? 1 : 1 - Math.exp(-delta * 16);
    state.visualTurnRate = (state.visualTurnRate || 0) + (state.turnRate - (state.visualTurnRate || 0)) * turnBlend;
  } else {
    state.speed = 0;
    state.distance = 0;
    state.turnRate = 0;
    state.visualTurnRate = (state.visualTurnRate || 0) * Math.exp(-delta * 12);
  }
  // Remove velocity into blocked axes; held keys cannot accumulate a release lurch.
  if (Math.abs(dx) < Math.abs(averageX * delta) * 0.1) state.velocityX = 0;
  if (Math.abs(dz) < Math.abs(averageZ * delta) * 0.1) state.velocityZ = 0;
  return state;
}

export function createAvatarAnimation(mixer, clips, gait = {}) {
  const actions = Object.fromEntries(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  for (const [name, action] of Object.entries(actions)) action.setEffectiveWeight(name === 'Idle' ? 1 : 0).play();
  const walkDuration = actions.Walk?.getClip().duration || 1;
  const gaitProfile = { ...DEFAULT_GAIT, ...gait };
  const animation = {
    mixer,
    actions,
    walkWeight: 0,
    talkWeight: 0,
    talking: false,
    // Blend state is deliberately exposed: the scene can use stopBlend to
    // delay root/foot corrections until the supporting foot is planted.
    startBlend: 0,
    stopBlend: 1,
    locomotionState: 'idle',
    gaitPhase: wrapPhase((actions.Walk?.time || 0) / walkDuration),
    walkPhase: 0,
    contactPhaseValue: 0,
    contactPhase: 'double',
    supportFoot: 'double',
    contact: { left: true, right: true, double: true, safe: true, phase: 0 },
    gait: gaitProfile,
    // `settleRate` is in clip cycles/second. It is only used for the small
    // heel/toe transition window when input is released mid-step.
    settleRate: 1.8,
    walkDuration,
    _wasWalking: false,
  };
  writeContactState(animation, animation.gaitPhase, gaitProfile);
  return animation;
}

/**
 * Walk phase is continuous. When distance is provided, it is authoritative;
 * otherwise the legacy speed/time-scale path is retained for callers that do
 * not yet expose collision-resolved distance.
 *
 * On release, Walk is held through the current support phase. If release lands
 * in the short heel/toe transition window, the clip advances to the next heel
 * contact before its weight is allowed to fade out. This prevents a lifted
 * foot from freezing in mid-air and makes Walk → Idle phase-aware.
 * @param {object} animation
 * @param {number} rawDelta
 * @param {{speed?: number, distance?: number, authoredSpeed?: number, talking?: boolean, frozen?: boolean, reducedMotion?: boolean, gait?: {stance?: number, heelEnd?: number, toeStart?: number, swingLift?: number}}} [options]
 */
export function updateAvatarAnimation(animation, rawDelta, {
  speed = 0,
  distance,
  authoredSpeed = WALK_SPEED,
  talking = false,
  frozen = false,
  reducedMotion = false,
  gait,
} = {}) {
  const delta = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, MAX_FRAME_DELTA)) : 0;
  if (frozen) return;
  const currentGait = animation.gait || DEFAULT_GAIT;
  if (gait) {
    const stance = Number.isFinite(gait.stance) ? gait.stance : currentGait.stance;
    const heelEnd = Number.isFinite(gait.heelEnd) ? gait.heelEnd : currentGait.heelEnd;
    const toeStart = Number.isFinite(gait.toeStart) ? gait.toeStart : currentGait.toeStart;
    const swingLift = Number.isFinite(gait.swingLift) ? gait.swingLift : currentGait.swingLift;
    if (stance !== currentGait.stance || heelEnd !== currentGait.heelEnd
      || toeStart !== currentGait.toeStart || swingLift !== currentGait.swingLift) {
      animation.gait = { ...currentGait, stance, heelEnd, toeStart, swingLift };
    }
  }
  const profile = animation.gait || DEFAULT_GAIT;
  const walkAction = animation.actions.Walk;
  const walkDuration = walkAction?.getClip().duration || animation.walkDuration || 1;
  animation.walkDuration = walkDuration;
  const blend = reducedMotion ? 1 : 1 - Math.exp(-delta * 18);
  const walking = speed > LOCOMOTION_EPSILON && !reducedMotion;
  const hadWalk = animation._wasWalking || animation.walkWeight > .001;
  const activeTalk = Boolean(talking && !walking && !reducedMotion);

  // Keep the public contact state synchronized even when a caller changes the
  // action time (for example, deterministic appearance phase setup).
  const prePhase = walkAction ? wrapPhase(walkAction.time / walkDuration) : animation.gaitPhase;
  let contact = writeContactState(animation, prePhase, profile);

  if (walking) {
    animation.locomotionState = hadWalk ? 'walking' : 'starting';
    animation.startBlend += (1 - animation.startBlend) * blend;
    animation.stopBlend += (0 - animation.stopBlend) * blend;
  } else {
    animation.locomotionState = hadWalk ? 'stopping' : 'idle';
    animation.startBlend += (0 - animation.startBlend) * blend;
    // Do not fade from an arbitrary swing pose. Move only across the tiny
    // heel/toe gap; normal mid-stance stops preserve the exact old clip time.
    if (hadWalk && !contact.safe && walkAction && !reducedMotion) {
      const target = nextContactBoundary(prePhase, profile);
      const distanceToContact = target - prePhase;
      const advance = Math.min(distanceToContact, animation.settleRate * delta);
      walkAction.time = wrapPhase(prePhase + advance) * walkDuration;
      contact = writeContactState(animation, walkAction.time / walkDuration, profile);
    }
    const stopTarget = contact.safe || !hadWalk ? 1 : 0;
    animation.stopBlend += (stopTarget - animation.stopBlend) * blend;
  }

  const authored = Math.max(.001, Math.abs(authoredSpeed));
  const targetWeight = walking ? Math.min(1, speed / authored * 1.35) : 0;
  // startBlend avoids a first-frame pop; stopBlend remains at zero until the
  // support foot has reached a safe contact phase.
  const transitionWeight = walking
    ? animation.startBlend * (1 - animation.stopBlend)
    : 1 - animation.stopBlend;
  const desiredWalkWeight = targetWeight * clamp01(transitionWeight);
  if (activeTalk && !animation.talking) animation.actions.Talk.reset().play();
  animation.talking = activeTalk;
  animation.walkWeight += (desiredWalkWeight - animation.walkWeight) * blend;
  animation.talkWeight += (Number(activeTalk) - animation.talkWeight) * blend;
  // The optional distance path is used by the theater scene once collision
  // resolution is available. It keeps the visual step cadence tied to actual
  // travel instead of requested velocity.
  const hasDistance = Number.isFinite(distance) && distance >= 0;
  const distanceAdvance = hasDistance ? distance / authored * walkDuration : 0;
  animation.actions.Walk.setEffectiveWeight(animation.walkWeight)
    .setEffectiveTimeScale(walking && !hasDistance ? speed / authored : 0)
    .play();
  animation.actions.Talk.setEffectiveWeight(animation.talkWeight).setEffectiveTimeScale(activeTalk ? 1 : 0).play();
  animation.actions.Idle.setEffectiveWeight(Math.max(0, 1 - animation.walkWeight - animation.talkWeight)).play();
  animation.mixer.update(reducedMotion ? 0 : delta);

  if (walking && hasDistance && walkAction) {
    walkAction.time = wrapPhase((walkAction.time / walkDuration) + distanceAdvance) * walkDuration;
  }
  if (walkAction) writeContactState(animation, walkAction.time / walkDuration, profile);
  animation._wasWalking = walking;
  if (!walking && animation.stopBlend > .999) animation.locomotionState = 'idle';
}
