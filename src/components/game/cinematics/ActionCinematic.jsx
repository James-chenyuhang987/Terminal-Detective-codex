/* eslint-disable react/no-unknown-property -- React Three Fiber uses Three.js JSX attributes. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
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

function seededCoordinates(seed, count) {
  let value = (Number(seed) || 1) >>> 0;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < positions.length; index += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    positions[index] = ((value / 4294967296) - 0.5) * (index % 3 === 1 ? 5 : 11);
  }
  return positions;
}

/** @param {{ event: Record<string, any>, quality: string }} props */
function SeededParticles({ event, quality }) {
  const ref = useRef(/** @type {THREE.Points | null} */ (null));
  const count = quality === 'high' ? 72 : 24;
  const positions = useMemo(
    () => seededCoordinates(event.animationSeed, count),
    [count, event.animationSeed],
  );
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.025;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.55) * 0.08;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={event.accentColor} size={quality === 'high' ? 0.05 : 0.065} transparent opacity={0.56} sizeAttenuation />
    </points>
  );
}

/** @param {{ event: Record<string, any>, phase: string, quality: string }} props */
function ActionGlyph({ event, phase, quality }) {
  const ref = useRef(/** @type {THREE.Group | null} */ (null));
  const accent = event.accentColor;
  const animationId = event.animationId;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const elapsed = clock.elapsedTime;
    const offset = ((Number(event.animationSeed) || 0) % 360) * (Math.PI / 180);
    const speed = {
      sweep: 0.42, orbit: 0.72, assemble: 0.24, stream: 0.16,
      impact: 0.12, scan: 0.3, pulse: 0.2, pressure: -0.14,
      split: 0.1, reveal: 0.24, chase: 0.08, exchange: -0.22,
      ripple: 0.34, focus: -0.38, bond: 0.48, cascade: 0.18,
      shatter: -0.32, rewind: -0.46, wave: 0.26, compress: -0.2,
      parallax: 0.14, thread: 0.3, evade: -0.1, handshake: 0.4,
    }[event.motionProfile] || 0.2;
    ref.current.rotation.y = offset + elapsed * speed;
    ref.current.rotation.z = Math.sin(elapsed * (animationId === 'pressure-focus' ? 1.8 : 0.75) + offset) * 0.045;
    const phaseLift = phase === 'establish' ? -0.18 : phase === 'result' ? 0.12 : 0;
    ref.current.position.y = 0.55 + phaseLift + Math.sin(elapsed * (animationId === 'lane-chase' ? 1.4 : 0.65) + offset) * 0.12;
    const pulse = 1 + Math.sin(elapsed * (animationId === 'dialogue-pulse' ? 2.2 : 1.1) + offset) * (phase === 'action' ? 0.045 : 0.02);
    const phaseScale = phase === 'establish' ? 0.82 : phase === 'result' ? 1.08 : 1;
    ref.current.scale.setScalar(pulse * phaseScale);
  });

  let glyph;
  switch (animationId) {
    case 'scan-sweep':
      glyph = (
        <>
          {[0.72, 1.25, 1.8].map((radius, index) => (
            <mesh key={radius} rotation={[Math.PI / 2 + index * 0.18, 0, index * 0.55]}>
              <torusGeometry args={[radius, 0.025 + index * 0.008, 8, 48]} />
              <meshBasicMaterial color={accent} transparent opacity={0.85 - index * 0.18} />
            </mesh>
          ))}
          <mesh rotation={[0, 0, -0.38]} position={[0.55, 0, 0]}><boxGeometry args={[2.8, 0.025, 0.035]} /><meshBasicMaterial color={accent} /></mesh>
        </>
      );
      break;
    case 'trace-grid':
      glyph = (
        <>
          {[-1.2, -0.6, 0, 0.6, 1.2].map((offsetValue, index) => (
            <React.Fragment key={offsetValue}>
              <mesh position={[offsetValue, 0, 0]}><boxGeometry args={[0.025, 2.7, 0.035]} /><meshBasicMaterial color={accent} transparent opacity={0.32 + index * 0.08} /></mesh>
              <mesh position={[0, offsetValue * 0.7, 0]}><boxGeometry args={[3.1, 0.025, 0.035]} /><meshBasicMaterial color={accent} transparent opacity={0.32 + index * 0.08} /></mesh>
            </React.Fragment>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0.33, 0.43, 6]} /><meshBasicMaterial color="#f2b84b" side={THREE.DoubleSide} /></mesh>
          <mesh position={[0.95, -0.52, 0.12]}><sphereGeometry args={[0.12, 10, 10]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} /></mesh>
        </>
      );
      break;
    case 'evidence-orbit':
      glyph = (
        <>
          <mesh><octahedronGeometry args={[0.76, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.38} wireframe /></mesh>
          {[0, 1, 2].map(index => (
            <mesh key={index} position={[Math.cos(index * 2.094) * 1.45, Math.sin(index * 2.094) * 0.72, Math.sin(index * 2.094) * 1.05]}>
              <sphereGeometry args={[0.13, 10, 10]} /><meshBasicMaterial color={accent} />
            </mesh>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.48, 0.018, 6, 64]} /><meshBasicMaterial color={accent} transparent opacity={0.55} /></mesh>
        </>
      );
      break;
    case 'microscope-lattice':
      glyph = (
        <>
          <mesh><dodecahedronGeometry args={[0.55, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.48} wireframe /></mesh>
          {Array.from({ length: quality === 'high' ? 10 : 6 }, (_, index) => {
            const angle = (index / (quality === 'high' ? 10 : 6)) * Math.PI * 2;
            return (
              <mesh key={index} position={[Math.cos(angle) * 1.35, Math.sin(angle * 2) * 0.48, Math.sin(angle) * 1.35]}>
                <sphereGeometry args={[index % 3 === 0 ? 0.13 : 0.08, 8, 8]} />
                <meshBasicMaterial color={index % 3 === 0 ? '#f2b84b' : accent} />
              </mesh>
            );
          })}
          <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.42, 0.022, 6, 64]} /><meshBasicMaterial color={accent} transparent opacity={0.52} /></mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[1.08, 0.018, 6, 48]} /><meshBasicMaterial color={accent} transparent opacity={0.42} /></mesh>
        </>
      );
      break;
    case 'spectral-rebuild':
      glyph = (
        <>
          {Array.from({ length: quality === 'high' ? 9 : 5 }, (_, index) => {
            const middle = quality === 'high' ? 4 : 2;
            return (
              <mesh key={index} position={[(index - middle) * 0.34, Math.sin(index * 1.4) * 0.24, 0]} rotation={[0, index * 0.16, 0]}>
                <boxGeometry args={[0.22, 1.25 + (index % 3) * 0.3, 0.08]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} transparent opacity={0.62} />
              </mesh>
            );
          })}
          <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[1.55, 1.62, 48]} /><meshBasicMaterial color={accent} side={THREE.DoubleSide} /></mesh>
        </>
      );
      break;
    case 'molecular-match':
      glyph = (
        <>
          {[-1.05, -0.52, 0, 0.52, 1.05].map((x, index) => (
            <group key={x} position={[x, Math.sin(index * 1.8) * 0.5, 0]}>
              <mesh><icosahedronGeometry args={[index === 2 ? 0.24 : 0.17, 1]} /><meshStandardMaterial color={index % 2 ? '#a78bfa' : accent} emissive={accent} emissiveIntensity={0.45} /></mesh>
              {index < 4 && <mesh position={[0.26, -Math.sin(index * 1.8) * 0.16, 0]} rotation={[0, 0, Math.sin(index * 1.8) * 0.35]}><boxGeometry args={[0.56, 0.045, 0.045]} /><meshBasicMaterial color={accent} /></mesh>}
            </group>
          ))}
          <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[1.62, 1.68, 6]} /><meshBasicMaterial color={accent} transparent opacity={0.5} side={THREE.DoubleSide} /></mesh>
        </>
      );
      break;
    case 'data-tunnel':
      glyph = Array.from({ length: quality === 'high' ? 10 : 6 }, (_, index) => (
        <mesh key={index} position={[Math.sin(index * 1.7) * 0.65, Math.cos(index * 1.3) * 0.45, -index * 0.52]} rotation={[0.5, index * 0.45, 0]}>
          <octahedronGeometry args={[0.3 + (index % 3) * 0.04, 0]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} wireframe />
        </mesh>
      ));
      break;
    case 'archive-cascade':
      glyph = (
        <>
          {Array.from({ length: quality === 'high' ? 12 : 7 }, (_, index) => (
            <mesh
              key={index}
              position={[(index % 3 - 1) * 0.78, 1.15 - Math.floor(index / 3) * 0.55, -index * 0.13]}
              rotation={[0.08, (index % 3 - 1) * 0.16, 0]}
            >
              <boxGeometry args={[0.62, 0.34, 0.06]} />
              <meshStandardMaterial color={index % 4 === 0 ? '#f2b84b' : accent} emissive={accent} emissiveIntensity={0.24} transparent opacity={0.72} wireframe />
            </mesh>
          ))}
          <mesh position={[0, -1.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.25, 0.035, 8, 48]} /><meshBasicMaterial color={accent} transparent opacity={0.62} /></mesh>
        </>
      );
      break;
    case 'firewall-breach':
      glyph = (
        <>
          {[-0.95, 0.95].map((x, side) => (
            <group key={x} position={[x, 0, 0]} rotation={[0, 0, side ? -0.16 : 0.16]}>
              {[-0.7, 0, 0.7].map(y => (
                <mesh key={y} position={[0, y, 0]}><boxGeometry args={[0.75, 0.48, 0.16]} /><meshStandardMaterial color="#ff3860" emissive="#ff3860" emissiveIntensity={0.28} wireframe /></mesh>
              ))}
            </group>
          ))}
          <mesh rotation={[0.2, 0.5, 0.1]}><icosahedronGeometry args={[0.55, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} /></mesh>
        </>
      );
      break;
    case 'cipher-shatter':
      glyph = (
        <>
          {Array.from({ length: quality === 'high' ? 11 : 7 }, (_, index) => {
            const angle = (index / (quality === 'high' ? 11 : 7)) * Math.PI * 2;
            const radius = 0.5 + (index % 3) * 0.42;
            return (
              <mesh key={index} position={[Math.cos(angle) * radius, Math.sin(angle) * radius, (index % 2) * 0.35]} rotation={[angle, angle * 0.6, angle * 0.3]}>
                <tetrahedronGeometry args={[0.24 + (index % 2) * 0.08, 0]} />
                <meshStandardMaterial color={index % 4 === 0 ? '#ff3860' : accent} emissive={accent} emissiveIntensity={0.55} wireframe />
              </mesh>
            );
          })}
          <mesh><octahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} /></mesh>
        </>
      );
      break;
    case 'camera-matrix':
      glyph = Array.from({ length: 6 }, (_, index) => (
        <mesh key={index} position={[(index % 3 - 1) * 1.05, (Math.floor(index / 3) - 0.5) * 0.85, 0]} rotation={[0, (index % 3 - 1) * -0.16, 0]}>
          <boxGeometry args={[0.82, 0.56, 0.08]} />
          <meshStandardMaterial color={index === 4 ? '#ff3860' : accent} emissive={accent} emissiveIntensity={0.22} wireframe />
        </mesh>
      ));
      break;
    case 'frame-rewind':
      glyph = (
        <>
          {[0, 1, 2, 3].map(index => (
            <mesh key={index} position={[(index - 1.5) * 0.46, (index - 1.5) * 0.18, -index * 0.42]} rotation={[0, (index - 1.5) * -0.12, 0]}>
              <boxGeometry args={[1.42, 0.9, 0.055]} />
              <meshStandardMaterial color={index === 2 ? '#f2b84b' : accent} emissive={accent} emissiveIntensity={0.25} transparent opacity={0.7} wireframe />
            </mesh>
          ))}
          {[-0.26, 0.26].map(x => <mesh key={x} position={[x, -0.82, 0.4]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.18, 0.42, 3]} /><meshBasicMaterial color={accent} /></mesh>)}
        </>
      );
      break;
    case 'dialogue-pulse':
      glyph = [-0.82, 0.82].map((x, index) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh><sphereGeometry args={[0.42, 16, 12]} /><meshStandardMaterial color={accent} wireframe emissive={accent} emissiveIntensity={0.32} /></mesh>
          {[0.62, 0.88].map(radius => <mesh key={radius} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[radius, 0.02, 6, 36]} /><meshBasicMaterial color={accent} transparent opacity={index ? 0.42 : 0.7} /></mesh>)}
        </group>
      ));
      break;
    case 'testimony-wave':
      glyph = (
        <>
          {Array.from({ length: quality === 'high' ? 13 : 7 }, (_, index) => {
            const middle = quality === 'high' ? 6 : 3;
            const height = 0.28 + Math.abs(Math.sin(index * 1.17)) * 1.25;
            return (
              <mesh key={index} position={[(index - middle) * 0.23, 0, 0]}>
                <boxGeometry args={[0.075, height, 0.075]} />
                <meshStandardMaterial color={index === middle ? '#f2b84b' : accent} emissive={accent} emissiveIntensity={0.38} transparent opacity={0.76} />
              </mesh>
            );
          })}
          {[-1, 1].map(side => <mesh key={side} position={[side * 1.75, 0, 0]}><sphereGeometry args={[0.3, 12, 10]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} wireframe /></mesh>)}
        </>
      );
      break;
    case 'pressure-focus':
      glyph = (
        <>
          {[-1.35, -0.78, 0.78, 1.35].map(x => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.08, 2.4, 0.08]} /><meshBasicMaterial color="#ff3860" transparent opacity={0.7} /></mesh>)}
          <mesh rotation={[0, 0, Math.PI]}><coneGeometry args={[0.62, 1.5, 4]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.42} wireframe /></mesh>
        </>
      );
      break;
    case 'contradiction-box':
      glyph = (
        <>
          {[0.62, 1.05, 1.48].map((size, index) => (
            <mesh key={size} rotation={[index * 0.18, index * -0.23, index * 0.12]}>
              <boxGeometry args={[size * 1.5, size, size * 0.72]} />
              <meshStandardMaterial color={index === 1 ? '#ff3860' : accent} emissive={accent} emissiveIntensity={0.25 + index * 0.12} transparent opacity={0.72} wireframe />
            </mesh>
          ))}
          <mesh><sphereGeometry args={[0.18, 10, 10]} /><meshBasicMaterial color="#f2b84b" /></mesh>
        </>
      );
      break;
    case 'timeline-split':
      glyph = [-0.72, 0, 0.72].map((y, index) => (
        <group key={y} position={[0, y, 0]} rotation={[0, 0, (index - 1) * 0.08]}>
          <mesh><boxGeometry args={[3.2, 0.045, 0.045]} /><meshBasicMaterial color={index === 1 ? '#ff3860' : accent} /></mesh>
          {[-1.25, -0.3, 0.65, 1.35].map(x => <mesh key={x} position={[x, 0, 0]}><sphereGeometry args={[0.1, 8, 8]} /><meshBasicMaterial color={accent} /></mesh>)}
        </group>
      ));
      break;
    case 'clock-parallax':
      glyph = (
        <>
          {[-0.8, 0, 0.8].map((x, index) => (
            <group key={x} position={[x, (index - 1) * 0.2, -index * 0.18]} rotation={[0, (index - 1) * 0.22, 0]}>
              <mesh><torusGeometry args={[0.62, 0.035, 8, 48]} /><meshBasicMaterial color={index === 1 ? '#ff3860' : accent} transparent opacity={0.82} /></mesh>
              <mesh rotation={[0, 0, index * 0.65]}><boxGeometry args={[0.045, 0.88, 0.035]} /><meshBasicMaterial color={accent} /></mesh>
              <mesh rotation={[0, 0, -0.9 + index * 0.28]}><boxGeometry args={[0.035, 0.58, 0.04]} /><meshBasicMaterial color="#f2b84b" /></mesh>
            </group>
          ))}
        </>
      );
      break;
    case 'evidence-impact':
      glyph = (
        <>
          <mesh rotation={[0.2, 0.45, 0]}><octahedronGeometry args={[0.9, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.45} wireframe /></mesh>
          <mesh position={[0, 1.15, 0]}><cylinderGeometry args={[0.035, 0.11, 2.3, 8]} /><meshBasicMaterial color={accent} transparent opacity={0.8} /></mesh>
          {[1.05, 1.6].map(radius => <mesh key={radius} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.56, 0]}><torusGeometry args={[radius, 0.025, 6, 48]} /><meshBasicMaterial color={accent} transparent opacity={0.62} /></mesh>)}
        </>
      );
      break;
    case 'case-thread':
      glyph = (
        <>
          {[
            [-1.2, 0.72], [-0.52, -0.58], [0.22, 0.48], [1.15, -0.34], [1.42, 0.78],
          ].map(([x, y], index) => (
            <group key={index}>
              <mesh position={[x, y, 0]}><sphereGeometry args={[index === 2 ? 0.18 : 0.12, 10, 10]} /><meshStandardMaterial color={index === 2 ? '#f2b84b' : accent} emissive={accent} emissiveIntensity={0.72} /></mesh>
              {index < 4 && <mesh position={[(x + [-0.52, 0.22, 1.15, 1.42][index]) / 2, (y + [-0.58, 0.48, -0.34, 0.78][index]) / 2, -0.02]} rotation={[0, 0, Math.atan2([-0.58, 0.48, -0.34, 0.78][index] - y, [-0.52, 0.22, 1.15, 1.42][index] - x)]}><boxGeometry args={[Math.hypot([-0.52, 0.22, 1.15, 1.42][index] - x, [-0.58, 0.48, -0.34, 0.78][index] - y), 0.025, 0.025]} /><meshBasicMaterial color={accent} transparent opacity={0.7} /></mesh>}
            </group>
          ))}
        </>
      );
      break;
    case 'lane-chase':
      glyph = (
        <group rotation={[-0.18, 0, 0]}>
          {[-0.9, 0, 0.9].map(x => <mesh key={x} position={[x, -0.45, 0]}><boxGeometry args={[0.035, 0.02, 6]} /><meshBasicMaterial color={accent} transparent opacity={0.5} /></mesh>)}
          <mesh position={[-0.45, -0.2, 0.4]}><boxGeometry args={[0.52, 0.28, 1.05]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.35} /></mesh>
          <mesh position={[0.45, 0.1, -1.1]}><boxGeometry args={[0.52, 0.28, 1.05]} /><meshStandardMaterial color="#ff3860" emissive="#ff3860" emissiveIntensity={0.28} /></mesh>
        </group>
      );
      break;
    case 'shadow-crossing':
      glyph = (
        <>
          {[-1, 1].map((side, index) => (
            <group key={side} position={[side * 0.72, index ? 0.38 : -0.38, index ? -0.8 : 0.45]} rotation={[0, side * 0.22, 0]}>
              <mesh><boxGeometry args={[0.38, 0.2, 0.72]} /><meshStandardMaterial color={index ? '#ff3860' : accent} emissive={index ? '#ff3860' : accent} emissiveIntensity={0.45} /></mesh>
              {[0.55, 1.05, 1.55].map(distance => <mesh key={distance} position={[0, 0, distance * side]}><boxGeometry args={[0.06, 0.035, 0.38]} /><meshBasicMaterial color={index ? '#ff3860' : accent} transparent opacity={0.62 - distance * 0.18} /></mesh>)}
            </group>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.52, 1.57, 4]} /><meshBasicMaterial color={accent} transparent opacity={0.48} side={THREE.DoubleSide} /></mesh>
        </>
      );
      break;
    case 'dead-drop':
      glyph = (
        <>
          {[0.95, 1.45].map(radius => <mesh key={radius} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[radius, 0.03, 8, 48]} /><meshBasicMaterial color={accent} transparent opacity={0.65} /></mesh>)}
          <mesh rotation={[0.25, 0.3, -0.18]}><boxGeometry args={[1.3, 0.72, 0.8]} /><meshStandardMaterial color="#f2b84b" emissive="#f2b84b" emissiveIntensity={0.3} wireframe /></mesh>
        </>
      );
      break;
    case 'signal-handshake':
      glyph = (
        <>
          {[-1.2, 1.2].map((x, index) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh><dodecahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color={index ? '#f2b84b' : accent} emissive={accent} emissiveIntensity={0.42} wireframe /></mesh>
              {[0.68, 0.92].map(radius => <mesh key={radius} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[radius, 0.018, 6, 36]} /><meshBasicMaterial color={index ? '#f2b84b' : accent} transparent opacity={0.52} /></mesh>)}
            </group>
          ))}
          {[-0.65, 0, 0.65].map(x => <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}><octahedronGeometry args={[0.16, 0]} /><meshBasicMaterial color={accent} /></mesh>)}
          <mesh><boxGeometry args={[1.45, 0.035, 0.035]} /><meshBasicMaterial color={accent} transparent opacity={0.72} /></mesh>
        </>
      );
      break;
    default:
      glyph = <mesh><icosahedronGeometry args={[0.8, 1]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.45} wireframe /></mesh>;
  }
  return <group ref={ref}>{glyph}</group>;
}

/** @param {{ event: Record<string, any> }} props */
function OutcomeEffect({ event }) {
  const ref = useRef(/** @type {THREE.Group | null} */ (null));
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * (event.outcome === 'trap' ? -1.2 : 0.65);
    ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.4) * 0.055);
  });
  if (event.outcomeEffect === 'hazard-collapse') {
    return (
      <group ref={ref} position={[0, 1.05, 0]}>
        {[0.7, 1.2, 1.7].map((radius, index) => <mesh key={radius} rotation={[index * 0.65, index * 0.5, 0]}><torusGeometry args={[radius, 0.055, 8, 40]} /><meshBasicMaterial color="#ff3860" transparent opacity={0.82} /></mesh>)}
      </group>
    );
  }
  if (event.outcomeEffect === 'evidence-lock') {
    return (
      <group ref={ref} position={[0, 1.05, 0]}>
        <mesh><icosahedronGeometry args={[0.72, 1]} /><meshStandardMaterial color={event.accentColor} emissive={event.accentColor} emissiveIntensity={0.65} wireframe /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.25, 0.045, 8, 48]} /><meshBasicMaterial color={event.accentColor} /></mesh>
      </group>
    );
  }
  if (event.outcomeEffect === 'signal-advance') {
    return (
      <group ref={ref} position={[0, 1.05, 0]}>
        {[-0.75, 0, 0.75].map(x => <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, -Math.PI / 4]}><boxGeometry args={[0.65, 0.08, 0.08]} /><meshBasicMaterial color={event.accentColor} /></mesh>)}
      </group>
    );
  }
  return (
    <group ref={ref} position={[0, 1.05, 0]}>
      {[0.75, 1.2, 1.65].map(radius => <mesh key={radius} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[radius, radius + 0.025, 40]} /><meshBasicMaterial color={event.accentColor} transparent opacity={0.72} side={THREE.DoubleSide} /></mesh>)}
    </group>
  );
}

/** @param {{ event: Record<string, any>, phase: string, quality: string }} props */
function ActionSetPiece({ event, phase, quality }) {
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
        <LocalProp template={template} accent={accent} />
      </group>

      {(template === 'interview' || template === 'confrontation' || template === 'covert') && (
        <HoloAgent color={template === 'confrontation' ? '#ff5f7f' : '#64748b'} position={[2.2, 0, -0.75]} scale={0.82} />
      )}
      <ActionGlyph event={event} phase={phase} quality={quality} />
      {phase === 'result' && <OutcomeEffect event={event} />}
    </group>
  );
}

const CAMERA_POSITIONS = Object.freeze({
  survey: [0, 2.25, 8.1],
  grid: [-0.35, 2.55, 7.6],
  macro: [0.2, 1.8, 6.5],
  microscope: [0.65, 2.05, 6.25],
  laboratory: [0, 2.7, 7.4],
  molecular: [-0.45, 2.35, 6.8],
  tunnel: [0, 1.7, 7.1],
  archive: [0.6, 2.2, 7.35],
  breach: [0.6, 2, 6.9],
  cipher: [-0.55, 1.85, 6.45],
  wall: [0, 2.05, 7.6],
  rewind: [0.75, 2.4, 7.25],
  portrait: [0, 2.2, 7],
  witness: [-0.4, 2.05, 6.75],
  close: [0, 1.9, 6.3],
  box: [0.45, 1.75, 6.05],
  timeline: [0, 2.6, 7.7],
  parallax: [-0.75, 2.45, 7.25],
  table: [0, 2.8, 7],
  thread: [0.55, 2.65, 6.85],
  pursuit: [1, 2.4, 7.8],
  shadow: [-1, 2.15, 7.5],
  covert: [-0.7, 2, 6.9],
  handshake: [0.7, 2.15, 6.65],
});

const CAMERA_MOTION = Object.freeze({
  sweep: { frequency: 0.28, x: 0.5, y: 0.1, z: 0.03 },
  ripple: { frequency: 0.48, x: 0.36, y: 0.18, z: 0.08 },
  orbit: { frequency: 0.46, x: 0.52, y: 0.13, z: 0.06 },
  focus: { frequency: 0.3, x: 0.22, y: 0.08, z: 0.16 },
  assemble: { frequency: 0.25, x: 0.3, y: 0.14, z: 0.05 },
  bond: { frequency: 0.55, x: 0.42, y: 0.2, z: 0.08 },
  stream: { frequency: 0.34, x: 0.28, y: 0.1, z: 0.18 },
  cascade: { frequency: 0.4, x: 0.4, y: 0.22, z: 0.1 },
  impact: { frequency: 0.2, x: 0.34, y: 0.08, z: 0.14 },
  shatter: { frequency: 0.62, x: 0.58, y: 0.16, z: 0.12 },
  scan: { frequency: 0.3, x: 0.46, y: 0.08, z: 0.04 },
  rewind: { frequency: -0.38, x: 0.56, y: 0.14, z: 0.08 },
  pulse: { frequency: 0.24, x: 0.3, y: 0.12, z: 0.05 },
  wave: { frequency: 0.52, x: 0.42, y: 0.18, z: 0.05 },
  pressure: { frequency: 0.18, x: 0.2, y: 0.06, z: 0.15 },
  compress: { frequency: 0.36, x: 0.24, y: 0.09, z: 0.2 },
  split: { frequency: 0.26, x: 0.38, y: 0.16, z: 0.04 },
  parallax: { frequency: 0.44, x: 0.7, y: 0.13, z: 0.07 },
  reveal: { frequency: 0.28, x: 0.32, y: 0.12, z: 0.1 },
  thread: { frequency: 0.4, x: 0.5, y: 0.18, z: 0.06 },
  chase: { frequency: 0.72, x: 0.78, y: 0.12, z: 0.1 },
  evade: { frequency: 0.6, x: 0.9, y: 0.16, z: 0.13 },
  exchange: { frequency: 0.22, x: 0.36, y: 0.09, z: 0.06 },
  handshake: { frequency: 0.5, x: 0.44, y: 0.14, z: 0.1 },
});

/** @param {{ event: Record<string, any>, phase: string, quality: string }} props */
function Scene({ event, phase, quality }) {
  const root = useRef(/** @type {THREE.Group | null} */ (null));
  const accent = event.accentColor;
  const executorColor = AGENT_COLORS[event.executorAgentId] || '#00e5ff';
  useFrame(({ camera, clock }) => {
    const elapsed = clock.elapsedTime;
    const base = CAMERA_POSITIONS[event.cameraProfile] || CAMERA_POSITIONS.survey;
    const motion = CAMERA_MOTION[event.motionProfile] || CAMERA_MOTION.sweep;
    const phaseDistance = phase === 'establish' ? 1 : phase === 'result' ? -0.35 : 0;
    const phaseMotion = phase === 'result' ? 0.48 : phase === 'establish' ? 0.72 : 1;
    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      base[2] + phaseDistance + Math.cos(elapsed * Math.abs(motion.frequency || 0.2)) * motion.z,
      0.035,
    );
    camera.position.x = THREE.MathUtils.lerp(
      camera.position.x,
      base[0] + Math.sin(elapsed * motion.frequency) * motion.x * phaseMotion,
      0.04,
    );
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      base[1] + Math.cos(elapsed * Math.abs(motion.frequency + 0.17)) * motion.y,
      0.04,
    );
    camera.lookAt(0, 0.75, -0.25);
    if (root.current) root.current.rotation.y = Math.sin(elapsed * motion.frequency * 0.75) * 0.055;
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
      <ActionSetPiece event={event} phase={phase} quality={quality} />
      {['data-tunnel', 'archive-cascade', 'firewall-breach', 'cipher-shatter', 'camera-matrix', 'frame-rewind'].includes(event.animationId) && (
        <DataColumns accent={accent} count={quality === 'high' ? 20 : 8} />
      )}
      <SeededParticles event={event} quality={quality} />
    </group>
  );
}

/** @param {{ event: Record<string, any>, quality?: string, onComplete?: (reason: string) => void }} props */
export default function ActionCinematic({ event, quality = 'high', onComplete }) {
  const { lang } = useLang();
  const [phase, setPhase] = useState('establish');
  const completeRef = useRef(/** @type {((reason: string) => void) | undefined} */ (onComplete));
  const skipRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const previousFocusRef = useRef(/** @type {HTMLElement | null} */ (null));
  completeRef.current = onComplete;
  const zh = lang === 'zh';

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    skipRef.current?.focus();
    const actionTimer = window.setTimeout(() => setPhase('action'), 1200);
    const resultTimer = window.setTimeout(() => setPhase('result'), 4500);
    const doneTimer = window.setTimeout(() => completeRef.current?.('completed'), 6000);
    return () => {
      window.clearTimeout(actionTimer);
      window.clearTimeout(resultTimer);
      window.clearTimeout(doneTimer);
      previousFocusRef.current?.focus();
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
        aria-hidden="true"
        camera={{ position: [0, 2.25, 9.5], fov: 47, near: 0.1, far: 50 }}
        dpr={quality === 'high' ? [1, 1.5] : 1}
        shadows={quality === 'high'}
        gl={{ antialias: quality === 'high', alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener('webglcontextlost', browserEvent => {
            browserEvent.preventDefault();
            completeRef.current?.('renderer_lost');
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
