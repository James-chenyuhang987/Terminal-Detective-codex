/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic scene properties. */
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useProgress } from '@react-three/drei';
import { AnimationMixer, Bone, MathUtils, Mesh, SkinnedMesh, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useLang } from '@/lib/lang.jsx';
import {
  CHARACTER_FILES, MAX_FRAME_DELTA, SCENE_FILES, cameraRelativeMovement, interactionIntent,
  interactionTargets, isViewportKeyTarget, nearestTarget, restoreSpatial,
  sceneForZone, stageNpcs, targetKey, validateTheaterManifest, withNpcColliders, SPRINT_SPEED,
} from '@/game/theaterWorld.js';
import { createAvatarAnimation, createFootLock, createSoleGrounding, soleGroundOffset, stepLocomotion, stopLocomotion, updateAvatarAnimation, updateFootLock } from '@/game/theaterMotion.js';
import { buildCameraCollision, cameraClearance } from '@/game/theaterCamera.js';
import { fieldFraming, npcAppearance, npcDemeanor } from '@/game/theaterVisuals.js';
import { fieldMaterial } from '@/game/theaterMaterials.js';
import { cancelDeferredDispose, deferDispose } from '@/lib/deferredDispose.js';
import { FieldFeedback, FieldLighting, FootShadow } from './FieldAtmosphere.jsx';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/theater/`;
const EMPTY_CONTROLS = { forward: false, backward: false, left: false, right: false, sprint: false };
const KEY_DIRECTIONS = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
const QUALITY = { low: { dpr: 1, shadows: false, shadowSize: 512, antialias: false }, auto: { dpr: 1.35, shadows: true, shadowSize: 512, antialias: true }, high: { dpr: 1.75, shadows: true, shadowSize: 1024, antialias: true } };

class TheaterAssetErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // drei/suspend-react keeps rejected loader promises in its cache. Clear
    // only this scene's public assets so an explicit return to 3D can retry.
    for (const url of this.props.assetUrls || []) {
      try { this.props.clear?.(url); } catch { /* a failed cache entry is already gone */ }
    }
    this.props.onFailure?.(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LoadingProgress({ zh, preparing }) {
  const { active, progress } = useProgress();
  if (!preparing && !active) return null;
  return <div role="status" aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', gap: 10, textAlign: 'center', background: '#07131ce8', color: '#d6f9ff', zIndex: 2, pointerEvents: 'none' }}>
    <strong>{zh ? '正在加载现场与角色' : 'Loading the room and characters'}</strong>
    <span>{active ? `${Math.round(progress)}%` : (zh ? '正在读取场景清单…' : 'Reading scene manifest…')}</span>
    <span>{zh ? '可随时切换文字模式，调查进度不会丢失。' : 'Text mode is always available; your investigation is safe.'}</span>
  </div>;
}

function useTheaterManifest(onFailure) {
  const failure = useRef(onFailure);
  failure.current = onFailure;
  const [result, setResult] = useState({ manifest: null, error: null });
  useEffect(() => {
    const abort = new AbortController();
    let mounted = true;
    const timeout = window.setTimeout(() => abort.abort(), 20000);
    (async () => {
      try {
        const response = await fetch(`${ASSET_ROOT}manifest.json`, { signal: abort.signal, credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Theater manifest could not load (HTTP ${response.status}). Continue in text mode.`);
        const text = await response.text();
        if (text.length > 256000) throw new Error('Theater manifest exceeds the supported size. Continue in text mode.');
        const manifest = validateTheaterManifest(JSON.parse(text));
        if (mounted) setResult({ manifest, error: null });
      } catch (cause) {
        if (mounted) {
          const error = new Error(`Unable to prepare local 3D assets: ${cause instanceof Error ? cause.message : 'invalid asset manifest'}`);
          setResult({ manifest: null, error });
          failure.current?.(error);
        }
      } finally { window.clearTimeout(timeout); }
    })();
    return () => { mounted = false; window.clearTimeout(timeout); abort.abort(); };
  }, []);
  if (result.error) throw result.error;
  return result.manifest;
}

function useExplorationFocus(viewportRef, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    let pending = true;
    let frame;
    const handoff = () => {
      if (!pending || document.hidden || !document.hasFocus()) return;
      pending = false;
      const viewport = viewportRef.current;
      if (!viewport?.isConnected || !viewport.getClientRects().length || viewport.closest('[hidden], [inert]')) return;
      if (Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]')).some(dialog =>
        dialog.getClientRects().length && !dialog.closest('[hidden], [inert]'))) return;
      const focused = document.activeElement;
      if (focused?.isConnected && focused.getClientRects().length && !focused.closest('[hidden], [inert]')
        && focused.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"]')) return;
      viewport.focus({ preventScroll: true });
    };
    // Defer panel cleanup races, and finish a background-loaded scene's handoff on return.
    const schedule = () => {
      if (!pending) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(handoff);
    };
    schedule();
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      pending = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [viewportRef, enabled]);
}

function useViewportInput(viewportRef, controlsRef, live, input, interact) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    let dragging = null;
    const pressed = new Set();
    const clear = () => {
      pressed.clear();
      Object.assign(input.current.keys, EMPTY_CONTROLS);
      input.current.orbitX = 0;
      input.current.orbitY = 0;
      input.current.stopMotion?.();
      // Demand rendering has no clock of its own. Wake one frame so a
      // release/blur can apply the stopped locomotion and settle the camera.
      input.current.invalidate?.();
      if (controlsRef.current) {
        Object.assign(controlsRef.current, EMPTY_CONTROLS);
        controlsRef.current.orbitDelta = null;
      }
      if (dragging && viewport.hasPointerCapture?.(dragging.id)) viewport.releasePointerCapture(dragging.id);
      dragging = null;
    };
    input.current.clear = clear;
    const activate = () => {
      if (live.current.paused || live.current.suspended || document.hidden || !document.hasFocus()) return false;
      if (!input.current.windowActive) clear();
      input.current.windowActive = true;
      input.current.invalidate?.();
      return true;
    };
    controlsRef.current.activate = activate;
    const keydown = event => {
      if (live.current.paused || live.current.suspended || document.hidden || !document.hasFocus() || !isViewportKeyTarget(event.target, viewport) || event.altKey || event.ctrlKey || event.metaKey) return;
      const direction = KEY_DIRECTIONS[event.code];
      const sprint = event.code === 'KeyR';
      if (!direction && !sprint && event.code !== 'KeyE') return;
      if (!input.current.windowActive || !input.current.focused) {
        if (event.repeat || !activate()) return;
        input.current.focused = true;
      }
      if (direction) {
        event.preventDefault();
        if (!event.repeat) { pressed.add(event.code); input.current.keys[direction] = true; }
        input.current.invalidate?.();
      } else if (sprint) {
        event.preventDefault();
        // R is a hold action. Repeated keydown events must not toggle it or
        // change its state after the initial press.
        if (!event.repeat) input.current.keys.sprint = true;
        input.current.invalidate?.();
      } else if (event.code === 'KeyE') {
        event.preventDefault(); if (!event.repeat) interact();
      }
    };
    const keyup = event => {
      const direction = KEY_DIRECTIONS[event.code];
      if (event.code === 'KeyR') {
        input.current.keys.sprint = false;
        input.current.invalidate?.();
        if (isViewportKeyTarget(event.target, viewport)) event.preventDefault();
        return;
      }
      if (!direction) return;
      pressed.delete(event.code);
      input.current.keys[direction] = [...pressed].some(code => KEY_DIRECTIONS[code] === direction);
      input.current.invalidate?.();
      if (isViewportKeyTarget(event.target, viewport)) event.preventDefault();
    };
    const focus = event => {
      if (!isViewportKeyTarget(event.target, viewport) || !activate()) return;
      input.current.focused = true;
    };
    const blur = event => {
      if (isViewportKeyTarget(event.relatedTarget, viewport)) return;
      input.current.focused = false; clear();
    };
    const pointerdown = event => {
      if (event.button !== 0 || !isViewportKeyTarget(event.target, viewport) || !activate()) return;
      viewport.focus({ preventScroll: true });
      input.current.focused = true;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewport.setPointerCapture(event.pointerId);
    };
    const pointermove = event => {
      if (!dragging || dragging.id !== event.pointerId || live.current.paused || !input.current.windowActive) return;
      input.current.orbitX += Math.max(-80, Math.min(80, event.clientX - dragging.x));
      input.current.orbitY += Math.max(-80, Math.min(80, event.clientY - dragging.y));
      dragging.x = event.clientX; dragging.y = event.clientY;
      input.current.invalidate?.();
    };
    const pointerup = event => {
      if (!dragging || dragging.id !== event.pointerId) {
        // Touch-pad buttons are handled by React rather than the drag state,
        // but their release still needs to render one final stopped frame.
        input.current.invalidate?.();
        return;
      }
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      dragging = null;
      input.current.invalidate?.();
    };
    const suspend = () => {
      input.current.windowActive = false;
      input.current.focused = false;
      clear();
    };
    const visibility = () => { if (document.hidden) suspend(); };
    // Keep listeners local; only fresh input, not window focus, can resume after blur.
    viewport.addEventListener('keydown', keydown);
    viewport.addEventListener('keyup', keyup);
    viewport.addEventListener('focusin', focus);
    viewport.addEventListener('focusout', blur);
    viewport.addEventListener('pointerdown', pointerdown);
    viewport.addEventListener('pointermove', pointermove);
    viewport.addEventListener('pointerup', pointerup);
    viewport.addEventListener('pointercancel', pointerup);
    viewport.addEventListener('lostpointercapture', pointerup);
    window.addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      suspend();
      viewport.removeEventListener('keydown', keydown);
      viewport.removeEventListener('keyup', keyup);
      input.current.clear = null;
      if (controlsRef.current.activate === activate) controlsRef.current.activate = null;
      viewport.removeEventListener('focusin', focus);
      viewport.removeEventListener('focusout', blur);
      viewport.removeEventListener('pointerdown', pointerdown);
      viewport.removeEventListener('pointermove', pointermove);
      viewport.removeEventListener('pointerup', pointerup);
      viewport.removeEventListener('pointercancel', pointerup);
      viewport.removeEventListener('lostpointercapture', pointerup);
      window.removeEventListener('blur', suspend);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [viewportRef, controlsRef, live, input, interact]);
}

function RendererLifecycle({ live, input, suspended }) {
  const { gl, invalidate } = useThree();
  useEffect(() => { if (!suspended) invalidate(); }, [suspended, invalidate]);
  useEffect(() => {
    const canvas = gl.domElement;
    input.current.invalidate = invalidate;
    const lost = event => {
      event.preventDefault();
      input.current.windowActive = false;
      input.current.clear?.();
      live.current.onFailure?.(new Error('The 3D graphics context was lost. Continue the same investigation in text mode.'));
    };
    const wake = () => invalidate();
    canvas.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      input.current.invalidate = null;
      canvas.removeEventListener('webglcontextlost', lost);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [gl, invalidate, live, input]);
  return null;
}

function RoomModel({ gltf, quality }) {
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const materials = new Map();
    let meshes = 0;
    clone.traverse(node => {
      if (node instanceof Mesh) {
        meshes++; node.castShadow = quality.shadows; node.receiveShadow = true;
        const copy = material => { if (!materials.has(material)) materials.set(material, fieldMaterial(material)); return materials.get(material); };
        node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
      }
    });
    if (!meshes) throw new Error('The bundled room has no renderable geometry.');
    return clone;
  }, [gltf.scene, quality.shadows]);
  useEffect(() => {
    cancelDeferredDispose(scene);
    return () => deferDispose(scene, () => {
      scene.traverse(node => {
        if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose());
      });
    });
  }, [scene]);
  return <primitive object={scene} dispose={null} />;
}

function Avatar({ role, position, rotationY = 0, player = null, talking = false, interacting = false, targetPosition = null, interactionTarget = null, appearance = null, emotion = 'calm', locomotion, gait, live, input, quality }) {
  const gltf = useGLTF(`${ASSET_ROOT}${CHARACTER_FILES[role]}`, false, false);
  const root = useRef(null);
  const model = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene);
    let skinned = false;
    cloned.traverse(node => {
      if (node instanceof Mesh) node.receiveShadow = true;
      if (node instanceof SkinnedMesh) skinned = true;
    });
    {
      const owned = new Map();
      cloned.traverse(node => {
        if (!(node instanceof Mesh)) return;
        const copy = material => {
          if (!owned.has(material)) {
            const clone = fieldMaterial(material);
            if (appearance && ((role === 'witness' && material.name === 'wine') || (role === 'security' && material.name === 'blue') || (role === 'scientist' && material.name === 'paper'))) clone.color.set(appearance.coat);
            owned.set(material, clone);
          }
          return owned.get(material);
        };
        node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
      });
    }
    if (!skinned || !['Idle', 'Walk', 'Talk'].every(name => gltf.animations.some(clip => clip.name === name))) throw new Error(`The bundled ${role} character needs a rig and Idle/Walk/Talk animations.`);
    return cloned;
  }, [gltf.scene, gltf.animations, role, appearance]);
  useEffect(() => { model.traverse(node => { if (node instanceof Mesh) node.castShadow = quality.shadows; }); }, [model, quality.shadows]);
  // The authored gait already animates Hips and both leg chains. Keep dynamic
  // balance adjustments on Spine so the support foot stays in the model's
  // local frame instead of rotating the group that contains both feet.
  const spine = useMemo(() => {
    let result = null;
    model.traverse(node => {
      if (!result && node instanceof Bone && /^(?:Spine)(?:\.|$)/.test(node.name)) result = node;
    });
    return result;
  }, [model]);
  const appliedSpineOffset = useRef({ x: 0, y: 0, z: 0 });
  const animation = useMemo(() => {
    const result = createAvatarAnimation(new AnimationMixer(model), gltf.animations, gait);
    result.actions.Idle.time = appearance?.phase || 0;
    result.actions.Talk.time = appearance?.phase || 0;
    return result;
  }, [gltf.animations, model, appearance, gait]);
  const footLock = useMemo(() => createFootLock(model), [model]);
  const grounding = useMemo(() => createSoleGrounding(model), [model]);
  useEffect(() => {
    // StrictMode can replay this effect with the same clone. Cancel a pending
    // disposal when that happens; a real unmount still releases the clone.
    cancelDeferredDispose(model);
    return () => deferDispose(model, () => {
      animation.mixer.stopAllAction();
      model.traverse(node => { if (node instanceof SkinnedMesh) node.skeleton.dispose(); });
      model.traverse(node => {
        if (node instanceof Mesh) (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => material.dispose());
      });
    });
  }, [animation, model]);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
    const background = live.current.suspended || !input.current.windowActive || document.hidden;
    const reduced = live.current.reducedMotion;
    // Remove the previous presentation offset before the mixer writes the
    // next authored pose. This also handles a frozen frame without leaving a
    // lean behind when the viewport loses focus.
    if (spine) {
      const previous = appliedSpineOffset.current;
      spine.rotation.x -= previous.x;
      spine.rotation.y -= previous.y;
      spine.rotation.z -= previous.z;
      previous.x = 0;
      previous.y = 0;
      previous.z = 0;
    }
    updateAvatarAnimation(animation, delta, {
      speed: !live.current.paused ? player?.current.speed : 0,
      distance: !live.current.paused ? player?.current.distance : 0,
      authoredSpeed: locomotion.speed,
      talking: talking || interacting,
      frozen: background,
      reducedMotion: reduced,
      gait,
    });
    // Keep a short demand-render chain for walk/talk fade-outs. The World
    // subscriber may stop locomotion later in this frame, so it cannot by
    // itself know that the mixer still needs a few frames to settle.
    if (!background && !reduced && (animation.walkWeight > 0.0001 || animation.talkWeight > 0.0001)) input.current.invalidate?.();
    // Publish the authoritative actor transform before measuring foot world
    // positions. World runs immediately before Avatar, so this reflects the
    // collision-resolved position for the current frame.
    if (root.current) {
      if (player) {
        root.current.position.fromArray(player.current.position);
        const focus = interacting && interactionTarget?.current?.position;
        if (focus) {
          const face = Math.atan2(focus[0] - player.current.position[0], focus[2] - player.current.position[2]);
          const difference = Math.atan2(Math.sin(face - root.current.rotation.y), Math.cos(face - root.current.rotation.y));
          if (!background) {
            root.current.rotation.y += difference * (reduced ? 1 : 1 - Math.exp(-delta * 7));
            // Conversation turns become the actor's current facing too. A
            // closed dialogue must not snap back to its pre-conversation yaw.
            player.current.rotationY = root.current.rotation.y;
          }
        } else root.current.rotation.y = player.current.rotationY;
      } else {
        const face = (talking || interacting) && targetPosition ? Math.atan2(targetPosition.current.position[0] - position[0], targetPosition.current.position[2] - position[2]) : rotationY;
        const difference = Math.atan2(Math.sin(face - root.current.rotation.y), Math.cos(face - root.current.rotation.y));
        if (!background) root.current.rotation.y += difference * (reduced ? 1 : 1 - Math.exp(-delta * 7));
      }
      root.current.updateWorldMatrix(true, false);
    }
    if (!background) {
      const demeanor = npcDemeanor(emotion);
      const speedRatio = player ? MathUtils.clamp((player.current.speed || 0) / Math.max(.01, locomotion.speed), 0, 1) : 0;
      const turnLean = player ? MathUtils.clamp(-(player.current.visualTurnRate || player.current.turnRate || 0) * .014, -.055, .055) : 0;
      // Apply balance only to the upper body. Rotating a parent around the
      // hips moves both ankles in world X/Z and produces visible foot sliding.
      if (spine && !reduced) {
        const offset = appliedSpineOffset.current;
        offset.x = player ? speedRatio * .012 : demeanor.bodyPitch;
        offset.y = !player ? Math.sin(animation.mixer.time * 1.8 + (appearance?.phase || 0)) * demeanor.hesitation : 0;
        offset.z = player ? turnLean : 0;
        spine.rotation.x += offset.x;
        spine.rotation.y += offset.y;
        spine.rotation.z += offset.z;
      }
      // Lock only a single foot during its authored mid-stance contact. The
      // compensation lives on the render model; player.current.position stays
      // collision-authoritative and is never altered by presentation code.
      if (player || footLock.lockWeight > .001) updateFootLock(footLock, animation, model, {
        delta,
        // Reduced-motion mode intentionally freezes authored gait. Do not
        // retain a stale support-foot anchor while the actor is transitioning
        // back to Idle; the lock is presentation-only and should release with
        // the same preference as the animation itself.
        enabled: Boolean(player && !reduced && animation.walkWeight > 0.0001),
      });
      model.position.y = player && animation.walkWeight > 0.0001 ? soleGroundOffset(grounding, model) : 0;
    } else {
      // Release a stale lock when the tab is suspended or the scene is
      // backgrounded. Keep this path presentation-only as well.
      if (player || footLock.lockWeight > .001) updateFootLock(footLock, animation, model, { delta, enabled: false });
    }
    // Foot-lock release can outlast the Walk fade. Finish its small remaining
    // correction before the demand canvas goes idle.
    if (!background && footLock.applied.lengthSq() > 1e-10) input.current.invalidate?.();
    if (!root.current) return;
  }, -0.5);
  // Keep the model at the actor root. Presentation lean is applied to Spine
  // above, so no parent transform can move both support feet sideways.
  return <group ref={root} position={position} rotation={[0, rotationY, 0]} scale={appearance?.stature || 1} dispose={null}><primitive object={model} dispose={null} /></group>;
}

function HotspotRing({ target, nearby, selected }) {
  const active = nearby || selected;
  const color = target.kind === 'npc' ? '#a5c8c0' : target.kind === 'door' ? '#a7b7ff' : target.accent || (target.hotspotType === 'terminal' ? '#8ebfb4' : '#e1d0ac');
  return <mesh position={[target.position[0], 0.018, target.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
    <ringGeometry args={[active ? .32 : .21, active ? .345 : .225, 32, 1, Math.PI / 4, Math.PI * 1.5]} />
    <meshBasicMaterial color={color} transparent opacity={active ? .85 : .18} depthWrite={false} />
  </mesh>;
}

function World({ caseData, zoneId, manifest, selectedNpcId, interactionNpcId = null, npcEmotionLevels = {}, progress = { evidenceCount: 0, terminalActive: false }, focusTargetType = '', controlsRef, spatialRef, live, input, nearbyRef, sceneReady, quality }) {
  const sceneName = sceneForZone(zoneId);
  const room = manifest.scenes[sceneName];
  const staged = useMemo(() => stageNpcs(caseData.npcs, room, caseData.case_id), [caseData.npcs, caseData.case_id, room]);
  const appearances = useMemo(() => Object.fromEntries(staged.map(npc => [npc.npcId, npcAppearance(caseData.case_id, npc.npcId, npc.role)])), [staged, caseData.case_id]);
  const movementRoom = useMemo(() => withNpcColliders(room, staged), [room, staged]);
  const targets = useMemo(() => interactionTargets(room, staged, sceneName), [room, staged, sceneName]);
  const interactionNpc = staged.find(npc => npc.npcId === (interactionNpcId || selectedNpcId)) || null;
  const interactionTarget = useMemo(() => interactionNpc ? { current: { position: interactionNpc.position } } : null, [interactionNpc]);
  const spatialKey = JSON.stringify([caseData.case_id, zoneId]);
  const player = useRef(null);
  if (!player.current) player.current = { ...restoreSpatial(spatialRef.current?.rooms?.[spatialKey], movementRoom), walking: false };
  // Local decoder-free GLB; collision broadphase is cached once per loaded scene.
  const roomGltf = useGLTF(`${ASSET_ROOT}${SCENE_FILES[sceneName]}`, false, false);
  const collision = useMemo(() => buildCameraCollision(roomGltf.scene), [roomGltf.scene]);
  const orbit = useRef({ yaw: player.current.yaw, pitch: player.current.pitch });
  const intent = useMemo(() => ({ controls: { ...EMPTY_CONTROLS }, direction: [0, 0] }), []);
  const previousTarget = useRef('');
  const [nearbyKey, setNearbyKey] = useState('');
  const { camera, invalidate, size } = useThree();
  const cameraState = useMemo(() => ({ target: new Vector3(), desired: new Vector3(), boom: new Vector3(), direction: new Vector3(), smoothTarget: new Vector3(), framing: { target: [0, 0, 0], distance: 0, yaw: 0, pitch: 0 }, distance: 0, initialized: false, viewShift: -1, width: 0, height: 0 }), []);
  const selected = staged.find(npc => npc.npcId === selectedNpcId);

  useEffect(() => {
    input.current.stopMotion = () => stopLocomotion(player.current);
    if (nearbyRef.current) live.current.onNearbyChange?.(null);
    nearbyRef.current = null;
    // Fiber may render a frame before this passive effect. Invalidate its
    // published target too, so a stationary restored player gets the prompt back.
    previousTarget.current = '';
    setNearbyKey('');
    sceneReady();
    const timeout = window.setTimeout(() => invalidate(), 0);
    return () => {
      window.clearTimeout(timeout);
      input.current.clear?.();
      input.current.stopMotion = null;
      if (nearbyRef.current) live.current.onNearbyChange?.(null);
      nearbyRef.current = null;
      const current = spatialRef.current || (spatialRef.current = {});
      current.rooms ||= {};
      current.rooms[spatialKey] = { position: [...player.current.position], rotationY: player.current.rotationY, yaw: orbit.current.yaw, pitch: orbit.current.pitch };
    };
  }, [sceneReady, spatialKey, spatialRef, live, nearbyRef, input, invalidate]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
    const state = player.current;
    const movingAllowed = !live.current.paused && !live.current.suspended && input.current.windowActive && !document.hidden;
    if (movingAllowed) {
      const touch = controlsRef.current || EMPTY_CONTROLS;
      // Optional touch orbit uses accumulated pixel deltas: { x, y }, consumed once per frame.
      const touchOrbit = touch.orbitDelta;
      const dx = input.current.orbitX + (Number.isFinite(touchOrbit?.x) ? touchOrbit.x : 0);
      const dy = input.current.orbitY + (Number.isFinite(touchOrbit?.y) ? touchOrbit.y : 0);
      orbit.current.yaw = (orbit.current.yaw - MathUtils.clamp(dx, -160, 160) * 0.005) % (Math.PI * 2);
      orbit.current.pitch = MathUtils.clamp(orbit.current.pitch + MathUtils.clamp(dy, -160, 160) * 0.004, 0.35, 1.05);
      input.current.orbitX = 0; input.current.orbitY = 0;
      if (controlsRef.current) controlsRef.current.orbitDelta = null;
      for (const key in EMPTY_CONTROLS) intent.controls[key] = touch[key] || (input.current.focused && input.current.keys[key]);
      const movement = cameraRelativeMovement(intent.controls, orbit.current.yaw, intent.direction);
      const walkingSpeed = manifest.characters.detective.locomotion.speed;
      const sprinting = Boolean(intent.controls.sprint && Math.hypot(movement[0], movement[1]) > 0);
      stepLocomotion(state, movement, delta, movementRoom, {
        reducedMotion: live.current.reducedMotion,
        speed: sprinting ? SPRINT_SPEED : walkingSpeed,
        sprinting,
      });
    } else stopLocomotion(state);
    const target = nearestTarget(state.position, targets);
    const key = targetKey(target);
    nearbyRef.current = target;
    if (previousTarget.current !== key) {
      previousTarget.current = key;
      setNearbyKey(key);
      live.current.onNearbyChange?.(target);
    }

    const view = cameraState;
    const spot = room.hotspots.find(spot => spot.id === live.current.focusTargetId);
    const { distance, yaw, pitch } = fieldFraming({ position: state.position, yaw: orbit.current.yaw, pitch: orbit.current.pitch, aspect: 'aspect' in camera ? camera.aspect : 1.6, contact: live.current.paused ? selected : null, focus: live.current.paused ? spot?.focusPosition : null, overview: live.current.overview }, view.framing);
    // Portrait panels occupy the bottom half; lift the composition without moving its collision target.
    const shift = 'aspect' in camera && camera.aspect < 1.1 && (live.current.overview || (live.current.paused && (selected || spot))) ? (spot ? .26 : .20) : 0;
    const width = size?.width || 900, height = size?.height || 900;
    if (view.viewShift !== shift || view.width !== width || view.height !== height) {
      if (shift) camera.setViewOffset(width, height, 0, height * shift, width, height);
      else camera.clearViewOffset();
      view.viewShift = shift; view.width = width; view.height = height;
    }
    view.target.fromArray(view.framing.target);
    view.desired.set(view.target.x + Math.sin(yaw) * Math.cos(pitch) * distance, view.target.y + Math.sin(pitch) * distance, view.target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    // Open cutaway walls are camera space. Solid walls/furniture still constrain the boom.
    view.desired.y = MathUtils.clamp(view.desired.y, 1.65, 8.5);
    const snap = live.current.reducedMotion || !view.initialized;
    const cameraActive = !live.current.suspended && input.current.windowActive && !document.hidden;
    if (snap) { view.boom.copy(view.desired); view.smoothTarget.copy(view.target); }
    else if (cameraActive) {
      view.boom.lerp(view.desired, 1 - Math.exp(-delta * 6));
      view.smoothTarget.lerp(view.target, 1 - Math.exp(-delta * 8));
    }
    view.direction.subVectors(view.boom, view.smoothTarget);
    const length = view.direction.length();
    let targetDistance = view.distance;
    if (length > 0.01 && (snap || cameraActive)) {
      view.direction.divideScalar(length);
      const clear = Math.max(0, cameraClearance(collision, view.smoothTarget, view.direction, length) - 0.03);
      targetDistance = clear;
      // Contract immediately; recover gently without feeding the collision into orbit smoothing.
      view.distance = snap || clear < view.distance ? clear : MathUtils.lerp(view.distance, clear, 1 - Math.exp(-delta * 5));
      camera.position.copy(view.smoothTarget).addScaledVector(view.direction, Math.max(0.01, view.distance));
    }
    camera.lookAt(view.smoothTarget);
    view.initialized = true;
    // A demand canvas should schedule another frame only while something can
    // visibly change. Keyboard/pointer handlers request the first frame;
    // locomotion, camera easing and active dialogue keep the chain alive until
    // they settle. An idle, unfocused scene therefore stops rendering.
    const orbitPending = Math.abs(input.current.orbitX) > 0.001 || Math.abs(input.current.orbitY) > 0.001;
    const cameraSettling = cameraActive && (
      view.boom.distanceToSquared(view.desired) > 0.00001
      || view.smoothTarget.distanceToSquared(view.target) > 0.00001
      || Math.abs(view.distance - targetDistance) > 0.0001
    );
    const animationActive = !live.current.reducedMotion && Boolean(selectedNpcId || interactionNpcId);
    if (!live.current.suspended && !document.hidden && input.current.windowActive
      && (state.walking || orbitPending || cameraSettling || animationActive)) invalidate();
  }, -1);

  return <>
    <FieldLighting sceneName={sceneName} room={room} quality={quality} />
    <RoomModel gltf={roomGltf} quality={quality} />
    <FootShadow position={player.current.position} player={player} />
    <FieldFeedback room={room} progress={progress} focusedId={live.current.focusTargetId} focusedType={focusTargetType} sceneName={sceneName} caseData={caseData} zoneId={zoneId} />
    <Avatar role="detective" position={player.current.position} rotationY={player.current.rotationY} player={player} interacting={Boolean(interactionNpc)} interactionTarget={interactionTarget} locomotion={manifest.characters.detective.locomotion} gait={manifest.characters.detective.gait} live={live} input={input} quality={quality} />
    {staged.map(npc => <group key={npc.npcId}><FootShadow position={npc.position} scale={appearances[npc.npcId].stature} /><Avatar role={npc.role} position={npc.position} rotationY={npc.rotationY} talking={npc.npcId === selectedNpcId} interacting={npc.npcId === interactionNpcId} targetPosition={player} appearance={appearances[npc.npcId]} emotion={npcEmotionLevels[npc.npcId] || 'calm'} locomotion={manifest.characters[npc.role].locomotion} gait={manifest.characters[npc.role].gait} live={live} input={input} quality={quality} /></group>)}
    {targets.map(target => <HotspotRing key={targetKey(target)} target={target} nearby={targetKey(target) === nearbyKey} selected={target.kind === 'npc' && target.npcId === selectedNpcId} />)}
  </>;
}

export default function TheaterScene({ caseData, zoneId, selectedNpcId, interactionNpcId = null, npcEmotionLevels, progress, focusTargetId = null, focusTargetType = '', overview = false, paused, suspended = false, quality, reducedMotion, onInteract, onReady, onFailure, controlsRef, spatialRef, onNearbyChange }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const viewport = useRef(null);
  const manifest = useTheaterManifest(onFailure);
  const [readyRoom, setReadyRoom] = useState(null);
  const roomKey = JSON.stringify([caseData.case_id, zoneId]);
  const settings = QUALITY[quality] || QUALITY.auto;
  const assetUrls = useMemo(() => [
    `${ASSET_ROOT}${SCENE_FILES[sceneForZone(zoneId)]}`,
    ...Object.values(CHARACTER_FILES).map(file => `${ASSET_ROOT}${file}`),
  ], [zoneId]);
  const nearby = useRef(null);
  const live = useRef({ paused, suspended, reducedMotion, onInteract, onReady, onFailure, onNearbyChange, focusTargetId, overview });
  live.current = { paused, suspended, reducedMotion, onInteract, onReady, onFailure, onNearbyChange, focusTargetId, overview };
  const input = useRef({ keys: { ...EMPTY_CONTROLS }, focused: false, windowActive: !document.hidden && document.hasFocus(), orbitX: 0, orbitY: 0, clear: null });
  const interact = useCallback(() => {
    if (live.current.paused || live.current.suspended || document.hidden || !input.current.windowActive) return;
    const intent = interactionIntent(nearby.current);
    if (intent) live.current.onInteract?.(intent);
  }, []);
  const ready = useCallback(() => { setReadyRoom(roomKey); live.current.onReady?.(); }, [roomKey]);
  useViewportInput(viewport, controlsRef, live, input, interact);
  useEffect(() => { if (paused || suspended) input.current.clear?.(); }, [paused, suspended]);
  useExplorationFocus(viewport, readyRoom === roomKey && !paused && !suspended);

  // Fiber always mounts native canvas fallback content, including on working WebGL devices.
  return <div ref={viewport} tabIndex={0} role="group" aria-label={zh ? '3D 侦探现场：WASD 或方向键移动，按住 R 疾跑，拖动视角，E 交互；关闭面板后可直接继续移动' : '3D detective scene: WASD or arrows to move, hold R to sprint, drag to orbit, E to interact; movement is ready after closing panels'} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320, touchAction: 'none', outlineOffset: -3 }}>
    {manifest && <Canvas frameloop="demand" dpr={[1, settings.dpr]} shadows={settings.shadows} gl={{ antialias: settings.antialias, alpha: false, powerPreference: 'low-power' }} camera={{ position: [0, 3.2, 6], fov: 52, near: 0.06, far: 70 }} aria-label={zh ? '以第三人称探索案件现场' : 'Explore the case scene in third person'} fallback={<p>{zh ? '此设备无法显示 3D 场景，请切换文字模式继续调查。' : 'This device cannot display the 3D scene. Continue your investigation in text mode.'}</p>}>
      <RendererLifecycle live={live} input={input} suspended={suspended} />
      <TheaterAssetErrorBoundary assetUrls={assetUrls} clear={useGLTF.clear} onFailure={onFailure}>
        <Suspense fallback={null}><World key={roomKey} caseData={caseData} zoneId={zoneId} manifest={manifest} selectedNpcId={selectedNpcId} interactionNpcId={interactionNpcId} npcEmotionLevels={npcEmotionLevels} progress={progress} focusTargetType={focusTargetType} controlsRef={controlsRef} spatialRef={spatialRef} live={live} input={input} nearbyRef={nearby} sceneReady={ready} quality={settings} /></Suspense>
      </TheaterAssetErrorBoundary>
    </Canvas>}
    <LoadingProgress zh={zh} preparing={readyRoom !== roomKey} />
  </div>;
}
