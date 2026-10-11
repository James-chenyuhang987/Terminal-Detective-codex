/* eslint-disable react/no-unknown-property -- React Three Fiber scene primitives. */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DataTexture, LinearFilter, PMREMGenerator, RGBAFormat } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sceneInteractionProfile } from '@/game/theaterWorld.js';
import { SCENE_ART, sceneEvidenceCount } from '@/game/theaterVisuals.js';
import { cancelDeferredDispose, deferDispose } from '@/lib/deferredDispose.js';

export function FieldLighting({ sceneName, room, quality }) {
  const art = SCENE_ART[sceneName];
  const { gl, scene } = useThree();
  useEffect(() => {
    const environment = new RoomEnvironment();
    const generator = new PMREMGenerator(gl);
    const target = generator.fromScene(environment, .06);
    const previous = scene.environment;
    scene.environment = target.texture;
    scene.environmentIntensity = .22;
    environment.dispose(); generator.dispose();
    return () => { scene.environment = previous; target.dispose(); };
  }, [gl, scene]);
  const console = room.hotspots.find(spot => spot.id === 'workstation')?.focusPosition || [-3.6, 1.2, -2.7];
  return <>
    <color attach="background" args={[art.background]} />
    <fog attach="fog" args={[art.background, 12, art.fog]} />
    <ambientLight intensity={.20} />
    <hemisphereLight args={[art.fill, '#252029', .65]} />
    <directionalLight position={[-3, 7, 4]} intensity={art.intensity} color={art.key} castShadow={quality.shadows} shadow-mapSize-width={quality.shadowSize} shadow-mapSize-height={quality.shadowSize} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.025} shadow-bias={-.0001} shadow-radius={3} />
    <pointLight position={[console[0], 1.65, console[2]]} color={art.accent} intensity={sceneName === 'office' ? 9 : 7} distance={5} decay={2} />
    {quality.antialias && <pointLight position={[4.5, 2.7, -3.6]} color={sceneName === 'datacenter' ? '#94c5d3' : art.key} intensity={12} distance={7} decay={2} />}
    {sceneName === 'balcony' && <CityBackdrop reduced={quality.dpr === 1} />}
  </>;
}

function CityBackdrop({ reduced }) {
  return <group position={[0, 0, -21]}>
    {Array.from({ length: reduced ? 9 : 17 }, (_, index) => {
      const height = 5 + (index * 7 % 13);
      const x = (index - (reduced ? 4 : 8)) * 3.2;
      return <group key={index} position={[x, height / 2 - 4, -(index % 3) * 2]}>
        <mesh><boxGeometry args={[2.1, height, 2.1]} /><meshStandardMaterial color="#141e32" roughness={.9} /></mesh>
        {[.2, .45, .7].map((fraction, row) => <mesh key={row} position={[0, height * (fraction - .5), 1.06]}><boxGeometry args={[1.3, .045, .012]} /><meshBasicMaterial color={index % 3 ? '#71869f' : '#c3a276'} transparent opacity={.45} /></mesh>)}
      </group>;
    })}
  </group>;
}

function contactTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    data[(y * size + x) * 4 + 3] = Math.round(Math.max(0, 1 - distance) ** 2 * 150);
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter; texture.needsUpdate = true;
  return texture;
}

export function FootShadow({ position, player = null, scale = 1 }) {
  const ref = useRef(null);
  const texture = useMemo(contactTexture, []);
  useEffect(() => {
    cancelDeferredDispose(texture);
    return () => deferDispose(texture, () => texture.dispose());
  }, [texture]);
  useFrame(() => { if (player && ref.current) ref.current.position.set(player.current.position[0], .008, player.current.position[2]); });
  return <mesh ref={ref} position={[position[0], .008, position[2]]} rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale * .72, 1]} raycast={() => null}>
    <planeGeometry args={[.95, .95]} /><meshBasicMaterial map={texture} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
  </mesh>;
}

export function FieldFeedback({ room, progress, focusedId, focusedType = '', sceneName = 'office', caseData = null, zoneId = null }) {
  const evidence = room.hotspots.find(spot => spot.id === 'evidence')?.focusPosition || [3.75, 1.07, -2.85];
  const console = room.hotspots.find(spot => spot.id === 'workstation')?.focusPosition || [-3.65, 1.3, -2.75];
  const evidenceProfile = sceneInteractionProfile(sceneName, 'evidence');
  const visibleEvidence = caseData && zoneId ? sceneEvidenceCount(caseData, zoneId, progress) : Math.min(progress.evidenceCount, evidenceProfile.markerOffsets.length);
  const markerOffsets = evidenceProfile.markerOffsets || [[-.24, .08], [0, 0], [.24, -.06]];
  return <>
    {Array.from({ length: Math.min(visibleEvidence, markerOffsets.length) }, (_, index) => <group key={index} position={[evidence[0] + markerOffsets[index][0], evidence[1] + .10, evidence[2] + .28 + markerOffsets[index][1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.16, .11]} /><meshBasicMaterial color="#d8bd85" side={2} /></mesh>
      <mesh position={[0, .012, .005]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.10, .015]} /><meshBasicMaterial color="#4c3820" side={2} /></mesh>
    </group>)}
    {(progress.terminalActive || focusedType === 'terminal' || focusedId === 'workstation') && <mesh position={[console[0], console[1] + .04, console[2] + .12]}><boxGeometry args={[.32, .017, .018]} /><meshBasicMaterial color={sceneInteractionProfile(sceneName, 'workstation').accent} /></mesh>}
  </>;
}
