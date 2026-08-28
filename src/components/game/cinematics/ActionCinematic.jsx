/* eslint-disable react/no-unknown-property -- React Three Fiber uses Three.js JSX attributes. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useLang } from '@/lib/lang.jsx';
import { getCinematicActionLabel } from '@/game/actionCinematic';

const AGENT_COLORS = {
  'NEXUS-01': '#00e5ff',
  'AURORA-09': '#a78bfa',
  'CIPHER-47': '#ff6b35',
};

const MODEL_BY_TEMPLATE = {
  investigation: 'evidence-scanner.glb',
  digital: 'terminal-console.glb',
  interview: 'security-camera.glb',
  confrontation: 'evidence-scanner.glb',
  pursuit: 'security-camera.glb',
  covert: 'terminal-console.glb',
};

const OUTCOME_COPY = {
  trap: { zh: '敌对反制触发', en: 'HOSTILE COUNTERMEASURE' },
  clue: { zh: '关键证据已保全', en: 'EVIDENCE SECURED' },
  progress: { zh: '调查路径已推进', en: 'INVESTIGATION ADVANCED' },
  no_yield: { zh: '本轮未获得新证据', en: 'NO NEW EVIDENCE' },
};

/** @param {{ color: string, position?: [number, number, number], scale?: number, active?: boolean }} props */
function HoloAgent({ color, position = [0, 0, 0], scale = 1, active = false }) {
  const ref = useRef(/** @type {THREE.Group | null} */ (null));
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 2.4) * 0.045;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.65) * 0.12;
  });
  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh position={[0, 1.62, 0]}>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.2 : 1.25} transparent opacity={0.88} wireframe />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.32, 0.48, 1.25, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.8 : 1} transparent opacity={0.5} wireframe />
      </mesh>
      <mesh position={[-0.42, 0.86, 0]} rotation={[0, 0, -0.2]}>
        <cylinderGeometry args={[0.07, 0.09, 0.92, 5]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} wireframe />
      </mesh>
      <mesh position={[0.42, 0.86, 0]} rotation={[0, 0, 0.2]}>
        <cylinderGeometry args={[0.07, 0.09, 0.92, 5]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} wireframe />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <ringGeometry args={[0.46, 0.52, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.42} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** @param {{ template: string, accent: string }} props */
function LocalProp({ template, accent }) {
  const filename = MODEL_BY_TEMPLATE[template] || MODEL_BY_TEMPLATE.investigation;
  const path = `${import.meta.env.BASE_URL}assets/cinematics/${filename}`;
  const { scene } = useGLTF(path);
  const clone = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      if (!(sourceMaterial instanceof THREE.MeshStandardMaterial)) return;
      const material = sourceMaterial.clone();
      material.color.set('#15364a');
      material.emissive.set(accent);
      material.emissiveIntensity = 0.58;
      material.metalness = 0.68;
      material.roughness = 0.28;
      child.material = material;
    });
    return copy;
  }, [accent, scene]);

  useEffect(() => () => {
    clone.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => material.dispose());
    });
  }, [clone]);

  return <primitive object={clone} scale={template === 'pursuit' ? 1.25 : 1.5} position={[0, 0.18, -0.15]} />;
}

/** @param {{ accent: string, count: number }} props */
function DataColumns({ accent, count }) {
  return Array.from({ length: count }, (_, index) => {
    const x = ((index * 1.87) % 9) - 4.5;
    const z = -2.4 - ((index * 1.31) % 4);
    const height = 0.8 + (index % 5) * 0.42;
    return (
      <mesh key={index} position={[x, height / 2 - 0.05, z]}>
        <boxGeometry args={[0.055, height, 0.055]} />
        <meshBasicMaterial color={accent} transparent opacity={0.2 + (index % 3) * 0.08} />
      </mesh>
    );
  });
}

/** @param {{ event: Record<string, any>, phase: string }} props */
function ActionSetPiece({ event, phase }) {
  const accent = event.accentColor;
  const template = event.template;
  const propRef = useRef(/** @type {THREE.Group | null} */ (null));
  useFrame(({ clock }) => {
    if (!propRef.current) return;
    propRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.14;
    propRef.current.position.y = Math.sin(clock.elapsedTime * 1.7) * 0.04;
  });

  return (
    <group>
      <group ref={propRef} position={[0, 0, -0.25]}>
        <Float speed={1.3} rotationIntensity={0.08} floatIntensity={0.15}>
          <LocalProp template={template} accent={accent} />
        </Float>
      </group>

      {template === 'digital' && Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[-2.2 + index * 0.72, 1.15 + (index % 2) * 0.4, -1.15]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.28, 0.28, 0.035]} />
          <meshBasicMaterial color={index % 2 ? '#7b61ff' : accent} transparent opacity={phase === 'action' ? 0.72 : 0.25} wireframe />
        </mesh>
      ))}

      {(template === 'interview' || template === 'confrontation' || template === 'covert') && (
        <HoloAgent color={template === 'confrontation' ? '#ff5f7f' : '#64748b'} position={[2.2, 0, -0.75]} scale={0.82} />
      )}

      {template === 'pursuit' && Array.from({ length: 6 }, (_, index) => (
        <mesh key={index} position={[-3.8 + index * 1.5, 0.15, -1.2 - (index % 2) * 0.8]}>
          <boxGeometry args={[0.95, 0.08, 2.8]} />
          <meshBasicMaterial color={accent} transparent opacity={0.07 + index * 0.012} />
        </mesh>
      ))}

      {template === 'investigation' && Array.from({ length: 3 }, (_, index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35 + index * 0.34, 0]}>
          <ringGeometry args={[0.7 + index * 0.55, 0.72 + index * 0.55, 64]} />
          <meshBasicMaterial color={accent} transparent opacity={phase === 'action' ? 0.55 - index * 0.1 : 0.18} side={THREE.DoubleSide} />
        </mesh>
      ))}

      <mesh position={[0, 1.05, -0.2]} visible={phase === 'result'}>
        <octahedronGeometry args={[0.48, 1]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.4} transparent opacity={0.86} wireframe />
      </mesh>
    </group>
  );
}

/** @param {{ event: Record<string, any>, phase: string, quality: string }} props */
function Scene({ event, phase, quality }) {
  const root = useRef(/** @type {THREE.Group | null} */ (null));
  const accent = event.accentColor;
  const executorColor = AGENT_COLORS[event.executorAgentId] || '#00e5ff';
  useFrame(({ camera, clock }) => {
    const elapsed = clock.elapsedTime;
    const targetZ = phase === 'establish' ? 8.7 : phase === 'action' ? 7.2 : 6.4;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.035);
    camera.position.x = Math.sin(elapsed * 0.28) * (phase === 'result' ? 0.3 : 0.65);
    camera.position.y = 2.25 + Math.sin(elapsed * 0.4) * 0.12;
    camera.lookAt(0, 0.75, -0.25);
    if (root.current) root.current.rotation.y = Math.sin(elapsed * 0.22) * 0.045;
  });

  return (
    <group ref={root}>
      <color attach="background" args={['#01050b']} />
      <fog attach="fog" args={['#020914', 7, 19]} />
      <ambientLight intensity={0.34} />
      <pointLight position={[0, 4, 2]} color={accent} intensity={phase === 'result' ? 34 : 18} distance={13} />
      <pointLight position={[-4, 2, 1]} color={executorColor} intensity={12} distance={9} />

      <gridHelper args={[18, 24, accent, '#123043']} position={[0, 0, -1]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -1]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#02070e" metalness={0.42} roughness={0.62} />
      </mesh>

      <HoloAgent color={executorColor} position={[-2.35, 0, 0.3]} active scale={0.94} />
      {event.assistAgentId && (
        <HoloAgent color={AGENT_COLORS[event.assistAgentId] || '#9de9ff'} position={[-3.55, 0, -1.25]} scale={0.68} />
      )}
      <ActionSetPiece event={event} phase={phase} />
      <DataColumns accent={accent} count={quality === 'high' ? 24 : 11} />
      <Sparkles
        count={quality === 'high' ? 88 : 30}
        scale={[11, 5, 8]}
        size={quality === 'high' ? 2.2 : 1.4}
        speed={0.38}
        color={accent}
        opacity={0.5}
      />
    </group>
  );
}

/** @param {{ event: Record<string, any>, quality?: string, onComplete?: (reason: string) => void }} props */
export default function ActionCinematic({ event, quality = 'high', onComplete }) {
  const { lang } = useLang();
  const [phase, setPhase] = useState('establish');
  const completeRef = useRef(/** @type {((reason: string) => void) | undefined} */ (onComplete));
  const skipRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  completeRef.current = onComplete;
  const zh = lang === 'zh';

  useEffect(() => {
    skipRef.current?.focus();
    const actionTimer = window.setTimeout(() => setPhase('action'), 1200);
    const resultTimer = window.setTimeout(() => setPhase('result'), 4500);
    const doneTimer = window.setTimeout(() => completeRef.current?.('completed'), 6000);
    return () => {
      window.clearTimeout(actionTimer);
      window.clearTimeout(resultTimer);
      window.clearTimeout(doneTimer);
    };
  }, [event.eventId]);

  useEffect(() => {
    const onKey = keyEvent => {
      if (keyEvent.key === 'Escape') completeRef.current?.('skipped');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const outcome = OUTCOME_COPY[event.outcome] || OUTCOME_COPY.progress;
  const latestClue = event.revealedClues?.at(-1);

  return (
    <div
      className={`td-action-cinematic is-${phase} is-${event.outcome}`}
      style={/** @type {React.CSSProperties & {'--cine-accent': string}} */ ({ '--cine-accent': event.accentColor })}
      role="dialog"
      aria-modal="true"
      aria-label={zh ? '行动三维演示' : '3D ACTION REENACTMENT'}
    >
      <Canvas
        className="td-action-cinematic-canvas"
        camera={{ position: [0, 2.25, 9.5], fov: 47, near: 0.1, far: 50 }}
        dpr={quality === 'high' ? [1, 1.5] : 1}
        shadows={quality === 'high'}
        gl={{ antialias: quality === 'high', alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener('webglcontextlost', browserEvent => {
            browserEvent.preventDefault();
            completeRef.current?.('fallback');
          }, { once: true });
        }}
      >
        <Scene event={event} phase={phase} quality={quality} />
      </Canvas>

      <div className="td-action-cinematic-grid" aria-hidden="true" />
      <header className="td-cinematic-header">
        <small>{zh ? '战术现场重演' : 'TACTICAL FIELD REENACTMENT'} · TURN {String(event.turn).padStart(2, '0')}</small>
        <strong>{getCinematicActionLabel(event.actionTag, lang)}</strong>
        <span>{event.executorAgentId || 'AGENT'}{event.assistAgentId ? ` + ${event.assistAgentId}` : ''}</span>
      </header>

      <section className="td-cinematic-result" aria-live="polite">
        <small>{zh ? '行动结果' : 'ACTION RESULT'}</small>
        <h2>{latestClue ? `${latestClue.icon} ${latestClue.keyword}` : outcome[lang]}</h2>
        <p>{event.narration || (zh ? '现场数据已经写入调查终端。' : 'Field data has been committed to the investigation terminal.')}</p>
      </section>

      <footer className="td-cinematic-progress" aria-hidden="true"><i /></footer>
      <button ref={skipRef} type="button" className="td-cinematic-skip" onClick={() => completeRef.current?.('skipped')}>
        {zh ? '跳过演示' : 'SKIP REPLAY'} ▶▶
      </button>
    </div>
  );
}

Object.values(MODEL_BY_TEMPLATE).forEach(filename => {
  useGLTF.preload(`${import.meta.env.BASE_URL}assets/cinematics/${filename}`);
});
