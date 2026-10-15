/* eslint-disable react/no-unknown-property -- React Three Fiber scene primitives. */
import { useMemo } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { Mesh } from 'three';
import { investigationPropKind, targetKey } from '@/game/theaterWorld.js';

export const INVESTIGATION_PROP_FILE = 'investigation-props.glb';
const ASSET_URL = `${import.meta.env.BASE_URL}assets/theater/${INVESTIGATION_PROP_FILE}`;
const NODES = { document: 'DocumentProp', terminal: 'TerminalProp', sample: 'SampleProp', device: 'DeviceProp' };

/** Public observation viewer and room dressing share the same cached asset. */
export function InvestigationPropModel({ kind, completed = false, shadows = true }) {
  const gltf = useGLTF(ASSET_URL, false, false);
  const propKind = investigationPropKind(kind);
  const model = useMemo(() => {
    const original = gltf.scene.getObjectByName(NODES[propKind]);
    if (!original) throw new Error('The investigation prop library is incomplete.');
    const clone = original.clone(true);
    clone.traverse(node => { if (node instanceof Mesh) { node.castShadow = shadows; node.receiveShadow = true; } });
    return clone;
  }, [gltf.scene, propKind, shadows]);
  return <group>
    <primitive object={model} dispose={null} />
    {completed && <mesh position={[.13, .017, .105]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><circleGeometry args={[.028, 12]} /><meshBasicMaterial color="#9bd1ad" /></mesh>}
  </group>;
}

export default function InvestigationProps({ targets, nearbyKey = '', focusedId = null, lang = 'zh', shadows = true }) {
  return <>{targets.map(target => {
    const highlighted = targetKey(target) === nearbyKey || target.id === focusedId;
    return <group key={target.id} position={target.position}>
      <mesh position={[0, .45, 0]} castShadow={shadows} receiveShadow><boxGeometry args={[.40, .90, .40]} /><meshStandardMaterial color="#27363e" roughness={.78} metalness={.18} /></mesh>
      <mesh position={[0, .905, 0]} receiveShadow><boxGeometry args={[.48, .035, .40]} /><meshStandardMaterial color={target.completed ? '#435c4e' : '#554b3b'} roughness={.7} /></mesh>
      <group position={[0, .928, 0]}><InvestigationPropModel kind={target.propKind} completed={target.completed} shadows={shadows} /></group>
      <Html position={[0, 1.33, 0]} center distanceFactor={7} zIndexRange={[1, 0]} style={{ pointerEvents: 'none', whiteSpace: 'nowrap', opacity: highlighted ? 1 : .76 }}>
        <span aria-hidden="true" style={{ display: 'block', padding: '5px 8px', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', borderRadius: 3, background: '#07131ce8', border: `1px solid ${target.accent}`, color: '#e0e8e5', fontSize: 11 }}>{target.completed ? '✓ ' : '◇ '}{lang === 'zh' ? target.label : target.labelEn}</span>
      </Html>
    </group>;
  })}</>;
}
