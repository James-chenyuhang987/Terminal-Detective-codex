import { AnimationClip, Matrix3, Matrix4, Vector3 } from 'three';
import { MAX_FRAME_DELTA, PLAYER_RADIUS, WALK_SPEED, movePlayer } from './theaterWorld.js';

const soleCache = new WeakMap();
// The authored clip keeps the planted sole within a 0.42 m forward stride at
// the current 1.4 m/s walk speed. Allow that full stance span before
// re-anchoring so a sharp turn cannot create a visible periodic snap.
const FOOT_LOCK_MAX_OFFSET = .42;
const FOOT_LOCK_BLEND_RATE = 18;
const FOOT_LOCK_RELEASE_RATE = 12;
const FOOT_LOCK_MAX_STEP = .02;
const FOOT_LOCK_MAX_SPEED = .6;

const DEFAULT_GAIT = Object.freeze({ stance: .56, heelEnd: .10, toeStart: .40, doubleSupport: .06 });
const LOCOMOTION_EPSILON = .015;
const TALK_BLEND_DURATION = .5;
const WALK_STOP_DURATION = .3;

const clamp01 = value => Math.max(0, Math.min(1, value));
const wrapPhase = value => ((value % 1) + 1) % 1;
const smoothBlend = value => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

function locomotionTrack(track) {
  return /^(?:Root|Hips|(?:Coat|Thigh|Shin|Foot)\.?[LR])\./.test(track.name);
}

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
  animation.contact.support = contact.support;
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
    appliedWorld: new Vector3(),
    parentBasis: new Matrix3(),
    previousApplied: new Vector3(),
    appliedStep: new Vector3(),
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
 * Once locomotion stops, preserve the displayed offset without following a
 * foot through its Idle blend. Recentring the whole model while stationary
 * would visually move the actor after input has already stopped it.
 */
export function updateFootLock(lock, animation, model = lock?.model, { delta = 0, enabled = true, stationary = false } = {}) {
  if (!lock || !model) return;
  const elapsed = Number.isFinite(delta) ? Math.max(0, Math.min(delta, MAX_FRAME_DELTA)) : 0;
  if (!elapsed) return;
  const parent = model.parent || lock.parent;
  if (!parent) return;
  lock.parent = parent;

  // Remove only our previous horizontal compensation so all measurements are
  // taken from the authored pose and any external model transform is retained.
  model.position.x -= lock.applied.x;
  model.position.z -= lock.applied.z;
  parent.updateWorldMatrix(true, false);
  // Store the correction in world space between frames. The parent can turn
  // toward an NPC before this callback, including the first stopped frame;
  // keeping an old local offset would orbit the model around the actor root.
  lock.parentBasis.setFromMatrix4(parent.matrixWorld).invert();
  lock.previousApplied.copy(lock.appliedWorld).applyMatrix3(lock.parentBasis);
  lock.previousApplied.y = 0;
  if (stationary) {
    lock.activeSide = null;
    lock.lockWeight = 0;
    lock.applied.copy(lock.previousApplied);
    model.position.x += lock.applied.x;
    model.position.z += lock.applied.z;
    model.updateWorldMatrix(true, true);
    return;
  }
  model.updateWorldMatrix(true, true);

  const contact = animation?.contact;
  const side = enabled && contact?.safe && !contact.double
    && (contact.support === 'left' || contact.support === 'right')
    ? contact.support : null;
  const bone = side ? lock.bones[side] : null;
  const rate = 1 - Math.exp(-elapsed * (side ? FOOT_LOCK_BLEND_RATE : FOOT_LOCK_RELEASE_RATE));

  if (bone) {
    bone.getWorldPosition(lock.rawWorld);
    if (lock.activeSide !== side) {
      // Anchor the new foot at its displayed position, including the previous
      // correction. Reusing the uncorrected position would drag the whole
      // model back toward zero during every handoff.
      lock.activeSide = side;
      parent.worldToLocal(lock.anchorLocal.copy(lock.rawWorld));
      lock.anchorLocal.add(lock.previousApplied);
      parent.localToWorld(lock.anchorWorld.copy(lock.anchorLocal));
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
    // Re-entering even the same foot's contact window needs a fresh anchor.
    lock.activeSide = null;
    lock.lockWeight += (0 - lock.lockWeight) * rate;
    lock.targetLocal.set(0, 0, 0);
    if (lock.lockWeight < .001) {
      lock.lockWeight = 0;
      lock.activeSide = null;
    }
  }

  lock.desiredLocal.copy(lock.targetLocal);
  lock.applied.copy(lock.previousApplied).lerp(lock.desiredLocal, rate);
  // A collision edge or support handoff can change the desired correction by
  // more than one rendered frame should visibly move. Cap only the
  // presentation offset; the collision-authoritative actor remains exact.
  lock.appliedStep.subVectors(lock.applied, lock.previousApplied);
  const stepLength = Math.hypot(lock.appliedStep.x, lock.appliedStep.z);
  const maxStep = Math.min(FOOT_LOCK_MAX_STEP, elapsed * FOOT_LOCK_MAX_SPEED);
  if (stepLength > maxStep) lock.applied.copy(lock.previousApplied).addScaledVector(lock.appliedStep, maxStep / stepLength);
  if (!bone && lock.applied.lengthSq() < 1e-10) lock.applied.set(0, 0, 0);
  model.position.x += lock.applied.x;
  model.position.z += lock.applied.z;
  lock.appliedWorld.copy(lock.applied).applyMatrix3(lock.parentBasis.setFromMatrix4(parent.matrixWorld));
  model.updateWorldMatrix(true, true);
}

export function stopLocomotion(state, decayDelta = 0) {
  state.velocityX = 0;
  state.velocityZ = 0;
  state.speed = 0;
  state.distance = 0;
  state.walking = false;
  state.sprinting = false;
  state.turnRate = 0;
  state.visualTurnRate = decayDelta > 0
    ? (state.visualTurnRate || 0) * Math.exp(-decayDelta * 12)
    : 0;
}

/** Presentation-only velocity; actual collision-resolved distance drives the gait. */
export function stepLocomotion(state, direction, rawDelta, room, {
  allowed = true,
  reducedMotion = false,
  speed = WALK_SPEED,
  sprinting = false,
} = {}) {
  const delta = Number.isFinite(rawDelta) ? Math.max(0, Math.min(rawDelta, MAX_FRAME_DELTA)) : 0;
  const magnitude = Math.hypot(direction[0], direction[1]);
  if (!allowed || !delta || !magnitude) { stopLocomotion(state, delta); return state; }
  const targetX = direction[0] / magnitude * speed;
  const targetZ = direction[1] / magnitude * speed;
  let oldX = state.velocityX || 0;
  let oldZ = state.velocityZ || 0;
  // A sprint release changes the requested speed immediately. Limit the
  // carried velocity before integrating the new target so a fast stride
  // cannot leak into the next walk frame or a direction change.
  const oldMagnitude = Math.hypot(oldX, oldZ);
  if (oldMagnitude > speed && oldMagnitude > 0) {
    const scale = speed / oldMagnitude;
    oldX *= scale;
    oldZ *= scale;
    state.velocityX = oldX;
    state.velocityZ = oldZ;
  }
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
  // Sprint is a presentation state derived from actual, collision-resolved
  // movement. A held sprint key without a direction, or a blocked actor,
  // therefore cannot leave a stale sprint gait behind.
  state.sprinting = Boolean(sprinting && state.walking);
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
  // A departing conversation should lower the arm while the legs can already
  // walk. Keep the pelvis/legs/coat independent of the upper-body Talk fade.
  // Small non-skeletal clips used by other callers keep their original shape.
  const layered = clips.length > 0 && clips.every(clip => clip.tracks.some(locomotionTrack)
    && clip.tracks.some(track => !locomotionTrack(track)));
  const actions = Object.fromEntries(clips.map(clip => [clip.name, mixer.clipAction(layered
    ? new AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => !locomotionTrack(track))) : clip)]));
  const locomotionActions = layered ? Object.fromEntries(clips.filter(clip => clip.name !== 'Talk')
    .map(clip => [clip.name, mixer.clipAction(new AnimationClip(`${clip.name}:Locomotion`, clip.duration, clip.tracks.filter(locomotionTrack)))])) : null;
  for (const [name, action] of Object.entries(actions)) action.setEffectiveWeight(name === 'Idle' ? 1 : 0).play();
  if (locomotionActions) for (const [name, action] of Object.entries(locomotionActions)) action.setEffectiveWeight(name === 'Idle' ? 1 : 0).play();
  const walkDuration = actions.Walk?.getClip().duration || 1;
  const gaitProfile = { ...DEFAULT_GAIT, ...gait };
  const animation = {
    mixer,
    actions,
    locomotionActions,
    walkWeight: 0,
    talkWeight: 0,
    talking: false,
    talkBase: 0,
    talkTransitions: [],
    walkStopStart: 0,
    walkStopElapsed: WALK_STOP_DURATION,
    // Blend state is exposed for presentation; it never advances a step
    // once collision-resolved locomotion has stopped.
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
 * On release, stop the phase immediately and ease the held pose back to Idle.
 * Grounding keeps blended soles above the floor. Neither a settling step nor
 * a support-foot correction may move the character after input is released.
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
  writeContactState(animation, prePhase, profile);

  if (walking) {
    if (!animation._wasWalking && hadWalk) {
      // Resume from the held pose, rather than letting stale stop factors
      // briefly reduce the gait weight again when a direction is re-pressed.
      animation.startBlend = Math.sqrt(animation.walkWeight);
      animation.stopBlend = 1 - animation.startBlend;
    }
    animation.locomotionState = hadWalk ? 'walking' : 'starting';
    animation.startBlend += (1 - animation.startBlend) * blend;
    animation.stopBlend += (0 - animation.stopBlend) * blend;
  } else {
    if (animation._wasWalking) {
      animation.walkStopStart = animation.walkWeight;
      animation.walkStopElapsed = 0;
    }
    animation.locomotionState = hadWalk ? 'stopping' : 'idle';
    animation.startBlend += (0 - animation.startBlend) * blend;
    animation.walkStopElapsed = reducedMotion ? WALK_STOP_DURATION : Math.min(WALK_STOP_DURATION, animation.walkStopElapsed + delta);
    animation.stopBlend = smoothBlend(animation.walkStopElapsed / WALK_STOP_DURATION);
  }

  const authored = Math.max(.001, Math.abs(authoredSpeed));
  const targetWeight = walking ? Math.min(1, speed / authored * 1.35) : 0;
  // Blend the pose without allowing the no-input transition to take a step.
  const transitionWeight = animation.startBlend * (1 - animation.stopBlend);
  // A quick re-press accelerates from zero but already has a visible stride.
  // Keep that pose contribution while the distance-driven phase speeds up;
  // reducing it to the first frame's low speed would twitch back toward Idle.
  const desiredWalkWeight = walking ? Math.max(animation.walkWeight, targetWeight * clamp01(transitionWeight)) : 0;
  if (activeTalk !== animation.talking) {
    // A new conversation starts on the greeting beat only once the previous
    // gesture has disappeared. Reopening during its fade resumes the held
    // clip, otherwise a still-visible hand jumps straight to frame zero.
    if (activeTalk && animation.talkWeight < .001) animation.actions.Talk.reset().play();
    animation.talkTransitions.push({ elapsed: 0, change: Number(activeTalk) - Number(animation.talking) });
  }
  animation.talking = activeTalk;
  if (walking) animation.walkWeight += (desiredWalkWeight - animation.walkWeight) * blend;
  else animation.walkWeight = animation.walkStopStart * (1 - animation.stopBlend);
  // Superpose unfinished target changes instead of restarting the curve on
  // every click. This is a positive smoothing kernel over the 0/1 signal:
  // weights stay bounded and rapid reversals retain velocity/acceleration.
  if (reducedMotion) {
    animation.talkTransitions.length = 0;
    animation.talkBase = 0;
    animation.talkWeight = 0;
  } else {
    let pending = 0, contribution = 0;
    for (const transition of animation.talkTransitions) {
      transition.elapsed = Math.min(TALK_BLEND_DURATION, transition.elapsed + delta);
      if (transition.elapsed >= TALK_BLEND_DURATION) animation.talkBase += transition.change;
      else {
        contribution += transition.change * smoothBlend(transition.elapsed / TALK_BLEND_DURATION);
        animation.talkTransitions[pending++] = transition;
      }
    }
    animation.talkTransitions.length = pending;
    animation.talkWeight = clamp01(animation.talkBase + contribution);
  }
  // The optional distance path is used by the theater scene once collision
  // resolution is available. It keeps the visual step cadence tied to actual
  // travel instead of requested velocity.
  const hasDistance = Number.isFinite(distance) && distance >= 0;
  const distanceAdvance = hasDistance ? distance / authored : 0;
  const upperWalkWeight = animation.walkWeight * (1 - animation.talkWeight);
  animation.actions.Walk.setEffectiveWeight(upperWalkWeight)
    .setEffectiveTimeScale(walking && !hasDistance ? speed / authored : 0)
    .play();
  animation.actions.Talk.setEffectiveWeight(animation.talkWeight).setEffectiveTimeScale(activeTalk ? 1 : 0).play();
  animation.actions.Idle.setEffectiveWeight((1 - animation.walkWeight) * (1 - animation.talkWeight)).play();
  if (walking && hasDistance && walkAction) {
    walkAction.time = wrapPhase((walkAction.time + distanceAdvance) / walkDuration) * walkDuration;
  }
  if (animation.locomotionActions) for (const [name, action] of Object.entries(animation.locomotionActions)) {
    const source = animation.actions[name];
    action.time = source.time;
    action.setEffectiveTimeScale(source.getEffectiveTimeScale())
      .setEffectiveWeight(name === 'Walk' ? animation.walkWeight : 1 - animation.walkWeight).play();
  }
  // Evaluate the pose at this frame's phase before contact/foot-lock consumers
  // run. Advancing after update leaves the bones one frame behind the root.
  animation.mixer.update(reducedMotion ? 0 : delta);
  if (walkAction) writeContactState(animation, walkAction.time / walkDuration, profile);
  animation._wasWalking = walking;
  if (!walking && animation.stopBlend > .999) animation.locomotionState = 'idle';
}
