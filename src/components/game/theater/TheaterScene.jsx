/* eslint-disable react/no-unknown-property -- React Three Fiber intrinsic scene properties. */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF, useProgress } from '@react-three/drei';
import { MathUtils, Mesh, Raycaster, SkinnedMesh, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useLang } from '@/lib/lang.jsx';
import {
  CHARACTER_FILES, MAX_FRAME_DELTA, SCENE_FILES, cameraRelativeMovement, interactionIntent,
  interactionTargets, isViewportKeyTarget, movePlayer, nearestTarget, restoreSpatial,
  sceneForZone, stageNpcs, targetKey, validateTheaterManifest, withNpcColliders,
} from '@/game/theaterWorld.js';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/theater/`;
const EMPTY_CONTROLS = { forward: false, backward: false, left: false, right: false };
const KEY_DIRECTIONS = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'backward', ArrowDown: 'backward', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
const QUALITY = { low: { dpr: 1, shadows: false, antialias: false }, auto: { dpr: 1.35, shadows: false, antialias: true }, high: { dpr: 1.75, shadows: true, antialias: true } };

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

function useViewportInput(viewportRef, controlsRef, live, input, interact) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    let dragging = null;
    let keyboardAttached = false;
    const pressed = new Set();
    const clear = () => {
      pressed.clear();
      Object.assign(input.current.keys, EMPTY_CONTROLS);
      input.current.orbitX = 0;
      input.current.orbitY = 0;
      if (controlsRef.current) {
        Object.assign(controlsRef.current, EMPTY_CONTROLS);
        controlsRef.current.orbitDelta = null;
      }
      if (dragging && viewport.hasPointerCapture?.(dragging.id)) viewport.releasePointerCapture(dragging.id);
      dragging = null;
    };
    input.current.clear = clear;
    const keydown = event => {
      if (live.current.paused || !input.current.windowActive || !input.current.focused || !isViewportKeyTarget(event.target, viewport) || event.altKey || event.ctrlKey || event.metaKey) return;
      const direction = KEY_DIRECTIONS[event.code];
      if (direction) {
        event.preventDefault(); pressed.add(event.code); input.current.keys[direction] = true;
      } else if (event.code === 'KeyE') {
        event.preventDefault(); if (!event.repeat) interact();
      }
    };
    const keyup = event => {
      const direction = KEY_DIRECTIONS[event.code];
      if (!direction) return;
      pressed.delete(event.code);
      input.current.keys[direction] = [...pressed].some(code => KEY_DIRECTIONS[code] === direction);
      if (isViewportKeyTarget(event.target, viewport)) event.preventDefault();
    };
    const attachKeyboard = () => {
      if (keyboardAttached) return;
      viewport.addEventListener('keydown', keydown);
      viewport.addEventListener('keyup', keyup);
      keyboardAttached = true;
    };
    const detachKeyboard = () => {
      if (!keyboardAttached) return;
      viewport.removeEventListener('keydown', keydown);
      viewport.removeEventListener('keyup', keyup);
      keyboardAttached = false;
    };
    const focus = event => {
      if (!isViewportKeyTarget(event.target, viewport) || document.hidden) return;
      input.current.focused = true;
      input.current.windowActive = document.hasFocus();
      attachKeyboard();
      input.current.invalidate?.();
    };
    const blur = event => {
      if (isViewportKeyTarget(event.relatedTarget, viewport)) return;
      input.current.focused = false; clear(); detachKeyboard();
    };
    const pointerdown = event => {
      if (live.current.paused || event.button !== 0 || !isViewportKeyTarget(event.target, viewport)) return;
      viewport.focus({ preventScroll: true });
      input.current.focused = true;
      input.current.windowActive = !document.hidden && document.hasFocus();
      attachKeyboard();
      input.current.invalidate?.();
      if (!input.current.windowActive) return;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewport.setPointerCapture(event.pointerId);
    };
    const pointermove = event => {
      if (!dragging || dragging.id !== event.pointerId || live.current.paused || !input.current.windowActive) return;
      input.current.orbitX += Math.max(-80, Math.min(80, event.clientX - dragging.x));
      input.current.orbitY += Math.max(-80, Math.min(80, event.clientY - dragging.y));
      dragging.x = event.clientX; dragging.y = event.clientY;
    };
    const pointerup = event => {
      if (!dragging || dragging.id !== event.pointerId) return;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      dragging = null;
    };
    const suspend = () => {
      input.current.windowActive = false;
      input.current.focused = false;
      clear(); detachKeyboard();
    };
    const visibility = () => { if (document.hidden) suspend(); };
    // Window focus alone never resumes movement: the viewport must be focused/clicked again.
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
      input.current.clear = null;
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

function RoomModel({ sceneName, meshRef, quality }) {
  // Decoder arguments explicitly disable CDN-backed Draco/Meshopt; these GLBs are self-contained.
  const gltf = useGLTF(`${ASSET_ROOT}${SCENE_FILES[sceneName]}`, false, false);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    let meshes = 0;
    clone.traverse(node => {
      if (node instanceof Mesh) { meshes++; node.castShadow = quality.shadows; node.receiveShadow = true; }
    });
    if (!meshes) throw new Error(`The bundled ${sceneName} room has no renderable geometry.`);
    return clone;
  }, [gltf.scene, sceneName, quality.shadows]);
  return <primitive ref={meshRef} object={scene} dispose={null} />;
}

function Avatar({ role, position, rotationY = 0, player = null, talking = false, targetPosition = null, live, input, quality }) {
  const gltf = useGLTF(`${ASSET_ROOT}${CHARACTER_FILES[role]}`, false, false);
  const root = useRef(null);
  const previousAnimation = useRef(null);
  const model = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene);
    let skinned = false;
    cloned.traverse(node => {
      if (node instanceof Mesh) node.receiveShadow = true;
      if (node instanceof SkinnedMesh) skinned = true;
    });
    if (!skinned || !['Idle', 'Walk', 'Talk'].every(name => gltf.animations.some(clip => clip.name === name))) throw new Error(`The bundled ${role} character needs a rig and Idle/Walk/Talk animations.`);
    return cloned;
  }, [gltf.scene, gltf.animations, role]);
  useEffect(() => { model.traverse(node => { if (node instanceof Mesh) node.castShadow = quality.shadows; }); }, [model, quality.shadows]);
  const { actions, mixer } = useAnimations(gltf.animations, model);
  useEffect(() => () => {
    model.traverse(node => { if (node instanceof SkinnedMesh) node.skeleton.dispose(); });
  }, [model]);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, MAX_FRAME_DELTA);
    const background = live.current.suspended || !input.current.windowActive || document.hidden;
    const walking = player?.current.walking && !live.current.paused && !background;
    const animation = walking ? 'Walk' : talking ? 'Talk' : 'Idle';
    const reduced = live.current.reducedMotion;
    if (previousAnimation.current !== animation) {
      const previous = actions[previousAnimation.current];
      if (previous) previous.fadeOut(reduced ? 0 : 0.18);
      actions[animation]?.reset().fadeIn(reduced ? 0 : 0.18).play();
      previousAnimation.current = animation;
    }
    mixer.timeScale = background || reduced || (live.current.paused && !talking) ? 0 : rawDelta > 0 ? delta / rawDelta : 1;
    if (!root.current) return;
    if (player) {
      root.current.position.fromArray(player.current.position);
      root.current.rotation.y = player.current.rotationY;
    } else {
      const face = talking && targetPosition ? Math.atan2(targetPosition.current.position[0] - position[0], targetPosition.current.position[2] - position[2]) : rotationY;
      const difference = Math.atan2(Math.sin(face - root.current.rotation.y), Math.cos(face - root.current.rotation.y));
      if (!background) root.current.rotation.y += difference * (reduced ? 1 : 1 - Math.exp(-delta * 7));
    }
  }, -0.5);
  return <group ref={root} position={position} rotation={[0, rotationY, 0]} dispose={null}><primitive object={model} dispose={null} /></group>;
}

function HotspotRing({ target, nearby, selected }) {
  const active = nearby || selected;
  const color = target.kind === 'npc' ? '#87eeea' : target.kind === 'door' ? '#a7b7ff' : '#ffd39a';
  return <mesh position={[target.position[0], 0.028, target.position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
    <ringGeometry args={[active ? 0.4 : 0.33, active ? 0.46 : 0.37, 32]} />
    <meshBasicMaterial color={color} transparent opacity={active ? 0.95 : 0.45} depthWrite={false} />
  </mesh>;
}

function World({ caseData, zoneId, manifest, selectedNpcId, controlsRef, spatialRef, live, input, nearbyRef, sceneReady, quality }) {
  const sceneName = sceneForZone(zoneId);
  const room = manifest.scenes[sceneName];
  const staged = useMemo(() => stageNpcs(caseData.npcs, room, caseData.case_id), [caseData.npcs, caseData.case_id, room]);
  const movementRoom = useMemo(() => withNpcColliders(room, staged), [room, staged]);
  const targets = useMemo(() => interactionTargets(room, staged), [room, staged]);
  const spatialKey = JSON.stringify([caseData.case_id, zoneId]);
  const player = useRef(null);
  if (!player.current) player.current = { ...restoreSpatial(spatialRef.current?.rooms?.[spatialKey], movementRoom), walking: false };
  const roomMesh = useRef(null);
  const orbit = useRef({ yaw: player.current.yaw, pitch: player.current.pitch });
  const previousTarget = useRef('');
  const [nearbyKey, setNearbyKey] = useState('');
  const { camera, invalidate } = useThree();
  const cameraState = useMemo(() => ({ target: new Vector3(), desired: new Vector3(), direction: new Vector3(), smoothTarget: new Vector3(), ray: new Raycaster(), initialized: false }), []);
  const selected = staged.find(npc => npc.npcId === selectedNpcId);

  useEffect(() => {
    if (nearbyRef.current) live.current.onNearbyChange?.(null);
    nearbyRef.current = null;
    sceneReady();
    const timeout = window.setTimeout(() => invalidate(), 0);
    return () => {
      window.clearTimeout(timeout);
      input.current.clear?.();
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
    const movingAllowed = !live.current.paused && input.current.windowActive && !document.hidden;
    state.walking = false;
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
      const movement = cameraRelativeMovement({
        forward: touch.forward || (input.current.focused && input.current.keys.forward),
        backward: touch.backward || (input.current.focused && input.current.keys.backward),
        left: touch.left || (input.current.focused && input.current.keys.left),
        right: touch.right || (input.current.focused && input.current.keys.right),
      }, orbit.current.yaw);
      const next = movePlayer(state.position, movement, delta, movementRoom);
      const moveX = next[0] - state.position[0];
      const moveZ = next[2] - state.position[2];
      state.walking = Math.hypot(moveX, moveZ) > 0.0001;
      if (state.walking) {
        const angle = Math.atan2(moveX, moveZ);
        const difference = Math.atan2(Math.sin(angle - state.rotationY), Math.cos(angle - state.rotationY));
        state.rotationY += difference * (live.current.reducedMotion ? 1 : 1 - Math.exp(-delta * 15));
        state.position = next;
      }
    }
    const target = nearestTarget(state.position, targets);
    const key = targetKey(target);
    nearbyRef.current = target;
    if (previousTarget.current !== key) {
      previousTarget.current = key;
      setNearbyKey(key);
      live.current.onNearbyChange?.(target);
    }

    const view = cameraState;
    view.target.set(state.position[0], 1.1, state.position[2]);
    let distance = 5.2;
    let yaw = orbit.current.yaw;
    let pitch = orbit.current.pitch;
    if (selected && live.current.paused) {
      // Dialogue framing changes only the view: the detective never teleports to a contact.
      view.target.set(selected.position[0], 1.2, selected.position[2]);
      const separation = Math.hypot(state.position[0] - selected.position[0], state.position[2] - selected.position[2]);
      if (separation < 3.2) { view.target.x = (view.target.x + state.position[0]) / 2; view.target.z = (view.target.z + state.position[2]) / 2; }
      distance = 3.9;
      yaw = selected.rotationY + 0.45;
      pitch = 0.45;
    }
    view.desired.set(view.target.x + Math.sin(yaw) * Math.cos(pitch) * distance, view.target.y + Math.sin(pitch) * distance, view.target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    // Keep the lens inside walls and below ceilings, then test the actual GLB for line of sight.
    view.desired.x = MathUtils.clamp(view.desired.x, room.bounds.min[0] + 0.4, room.bounds.max[0] - 0.4);
    view.desired.z = MathUtils.clamp(view.desired.z, room.bounds.min[2] + 0.4, room.bounds.max[2] - 0.4);
    view.desired.y = MathUtils.clamp(view.desired.y, 1.9, Math.min(4.8, room.bounds.max[1] - 0.18));
    const snap = live.current.reducedMotion || !view.initialized;
    if (snap) { camera.position.copy(view.desired); view.smoothTarget.copy(view.target); }
    else if (!live.current.suspended && input.current.windowActive && !document.hidden) {
      camera.position.lerp(view.desired, 1 - Math.exp(-delta * 6));
      view.smoothTarget.lerp(view.target, 1 - Math.exp(-delta * 8));
    }
    // Check after smoothing as well, so orbit interpolation cannot cut through a cabinet.
    view.direction.subVectors(camera.position, view.smoothTarget);
    const length = view.direction.length();
    if (roomMesh.current && length > 0.01) {
      view.ray.set(view.smoothTarget, view.direction.normalize());
      view.ray.far = length + 0.2;
      const hit = view.ray.intersectObject(roomMesh.current, true)[0];
      if (hit && hit.distance < length + 0.2) camera.position.copy(view.smoothTarget).addScaledVector(view.direction, Math.max(0.08, hit.distance - 0.22));
    }
    camera.lookAt(view.smoothTarget);
    view.initialized = true;
    if (!live.current.suspended && !document.hidden && input.current.windowActive) invalidate();
  }, -1);

  return <>
    <color attach="background" args={['#08141e']} />
    <ambientLight intensity={0.65} />
    <hemisphereLight args={['#d0f5ff', '#394052', 1.7]} />
    <directionalLight position={[2.5, 6, 3.5]} intensity={2.4} color="#f5ebdb" castShadow={quality.shadows} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={0.035} />
    <RoomModel sceneName={sceneName} meshRef={roomMesh} quality={quality} />
    <Avatar role="detective" position={player.current.position} rotationY={player.current.rotationY} player={player} live={live} input={input} quality={quality} />
    {staged.map(npc => <Avatar key={npc.npcId} role={npc.role} position={npc.position} rotationY={npc.rotationY} talking={npc.npcId === selectedNpcId} targetPosition={player} live={live} input={input} quality={quality} />)}
    {targets.map(target => <HotspotRing key={targetKey(target)} target={target} nearby={targetKey(target) === nearbyKey} selected={target.kind === 'npc' && target.npcId === selectedNpcId} />)}
  </>;
}

export default function TheaterScene({ caseData, zoneId, selectedNpcId, paused, suspended = false, quality, reducedMotion, onInteract, onReady, onFailure, controlsRef, spatialRef, onNearbyChange }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const viewport = useRef(null);
  const manifest = useTheaterManifest(onFailure);
  const [readyRoom, setReadyRoom] = useState(null);
  const roomKey = JSON.stringify([caseData.case_id, zoneId]);
  const settings = QUALITY[quality] || QUALITY.auto;
  const nearby = useRef(null);
  const live = useRef({ paused, suspended, reducedMotion, onInteract, onReady, onFailure, onNearbyChange });
  live.current = { paused, suspended, reducedMotion, onInteract, onReady, onFailure, onNearbyChange };
  const input = useRef({ keys: { ...EMPTY_CONTROLS }, focused: false, windowActive: !document.hidden && document.hasFocus(), orbitX: 0, orbitY: 0, clear: null });
  const interact = useCallback(() => {
    if (live.current.paused || document.hidden || !input.current.windowActive) return;
    const intent = interactionIntent(nearby.current);
    if (intent) live.current.onInteract?.(intent);
  }, []);
  const ready = useCallback(() => { setReadyRoom(roomKey); live.current.onReady?.(); }, [roomKey]);
  useViewportInput(viewport, controlsRef, live, input, interact);
  useEffect(() => { if (paused) input.current.clear?.(); }, [paused]);

  // Fiber always mounts native canvas fallback content, including on working WebGL devices.
  return <div ref={viewport} tabIndex={0} role="group" aria-label={zh ? '3D 侦探现场：点击聚焦，WASD 或方向键移动，拖动视角，E 交互' : '3D detective scene: click to focus, WASD or arrows to move, drag to orbit, E to interact'} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320, touchAction: 'none', outlineOffset: -3 }}>
    {manifest && <Canvas frameloop="demand" dpr={[1, settings.dpr]} shadows={settings.shadows} gl={{ antialias: settings.antialias, alpha: false, powerPreference: 'low-power' }} camera={{ position: [0, 3.2, 6], fov: 52, near: 0.06, far: 70 }} aria-label={zh ? '以第三人称探索案件现场' : 'Explore the case scene in third person'} fallback={<p>{zh ? '此设备无法显示 3D 场景，请切换文字模式继续调查。' : 'This device cannot display the 3D scene. Continue your investigation in text mode.'}</p>}>
      <RendererLifecycle live={live} input={input} suspended={suspended} />
      <Suspense fallback={null}><World key={roomKey} caseData={caseData} zoneId={zoneId} manifest={manifest} selectedNpcId={selectedNpcId} controlsRef={controlsRef} spatialRef={spatialRef} live={live} input={input} nearbyRef={nearby} sceneReady={ready} quality={settings} /></Suspense>
    </Canvas>}
    <LoadingProgress zh={zh} preparing={readyRoom !== roomKey} />
  </div>;
}
