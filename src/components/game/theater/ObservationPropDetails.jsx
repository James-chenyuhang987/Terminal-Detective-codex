/* eslint-disable react/no-unknown-property -- React Three Fiber scene primitives. */
import React from 'react';
import { Html, Line } from '@react-three/drei';

function Box({ size, position = [0, 0, 0], rotation = [0, 0, 0], color = '#6e7b7c', opacity = 1, metalness = .15 }) {
  return <mesh position={[position[0], position[1], position[2]]} rotation={[rotation[0], rotation[1], rotation[2]]}><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={.65} metalness={metalness} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} /></mesh>;
}
function Cylinder({ radius, height, position = [0, 0, 0], rotation = [0, 0, 0], color = '#687d80', opacity = 1 }) {
  return <mesh position={[position[0], position[1], position[2]]} rotation={[rotation[0], rotation[1], rotation[2]]}><cylinderGeometry args={[radius, radius, height, 16]} /><meshStandardMaterial color={color} metalness={opacity < 1 ? 0 : .35} roughness={opacity < 1 ? .18 : .55} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} /></mesh>;
}
function Ring({ radius, tube = .009, position = [0, 0, 0], rotation = [Math.PI / 2, 0, 0], color = '#a2adb0' }) {
  return <mesh position={[position[0], position[1], position[2]]} rotation={[rotation[0], rotation[1], rotation[2]]}><torusGeometry args={[radius, tube, 6, 20]} /><meshStandardMaterial color={color} roughness={.5} metalness={.3} /></mesh>;
}

export function ObservationMarkers({ presentation, assist, visible }) {
  if (!visible || !presentation) return null;
  const color = assist?.color || '#d8bd85';
  return <group>
    {assist?.key === 'compare' && <Line points={presentation.features.map(feature => feature.position)} color={color} lineWidth={1.3} dashed dashSize={.025} gapSize={.02} raycast={() => null} />}
    {assist?.key === 'carrier' && <mesh position={[0, .16, 0]} raycast={() => null}><boxGeometry args={[.47, .36, .54]} /><meshBasicMaterial color={color} wireframe transparent opacity={.26} depthWrite={false} /></mesh>}
    {presentation.features.map((feature, index) => <group key={feature.id} position={feature.position}>
      <mesh raycast={() => null}><sphereGeometry args={[.023, 8, 6]} /><meshBasicMaterial color={color} transparent opacity={.42} depthWrite={false} /></mesh>
      <Html center zIndexRange={[2, 1]} style={{ pointerEvents: 'none' }}><span className="td-observation-number" aria-hidden="true">{index + 1}</span></Html>
    </group>)}
  </group>;
}

/** Only public surface features; detailed readings remain server inspections. */
export default function ObservationPropDetails({ variant }) {
  if (variant === 'folded-receipt') return <group>
    <Box size={[.4, .012, .52]} position={[0, .015, 0]} color="#c5c0a7" />
    {Array.from({ length: 7 }, (_, index) => <Box key={index} size={[index % 2 ? .24 : .30, .002, .006]} position={[0, .023, -.16 + index * .049]} color="#6b716b" />)}
    <group position={[0, .025, -.055]} rotation={[.52, 0, 0]}><Box size={[.40, .009, .21]} position={[0, .004, -.105]} color="#ded7ba" /><Box size={[.40, .003, .007]} color="#8d8a79" /></group>
    <mesh position={[-.14, .025, .18]} scale={[.034, .003, .046]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#653d3b" roughness={1} /></mesh>
  </group>;
  if (variant === 'connector-can') return <group>
    <Cylinder radius={.10} height={.30} position={[0, .17, 0]} color="#879c9d" />
    <Ring radius={.098} position={[0, .321, 0]} /><Ring radius={.098} position={[0, .019, 0]} />
    <Box size={[.13, .15, .012]} position={[0, .17, .097]} color="#485d60" />
    <Box size={[.12, .014, .055]} position={[0, .014, .015]} color="#17252b" />
    {[0, 1, 2, 3].map(index => <Box key={index} size={[.012, .005, .036]} position={[-.036 + index * .024, .004, .015]} color="#c7ad73" />)}
  </group>;
  if (variant === 'power-gauge') return <group>
    <Box size={[.40, .07, .30]} position={[0, .04, 0]} color="#36494f" />
    <Box size={[.34, .19, .028]} position={[0, .15, -.065]} color="#536265" />
    <Cylinder radius={.079} height={.014} position={[0, .16, -.043]} rotation={[Math.PI / 2, 0, 0]} color="#c6c9b7" />
    <Ring radius={.079} position={[0, .16, -.032]} rotation={[0, 0, 0]} color="#273c43" />
    {Array.from({ length: 7 }, (_, index) => {
      const angle = (-140 + index * 30) * Math.PI / 180;
      return <Box key={index} size={[.004, .012, .003]} position={[Math.sin(angle) * .063, .16 + Math.cos(angle) * .063, -.031]} rotation={[0, 0, -angle]} color="#455753" />;
    })}
    <Line points={[[0, .16, -.024], [.066, .195, -.024]]} color="#9e5147" lineWidth={2} />
    <Box size={[.054, .018, .07]} position={[.12, .085, .08]} color="#90ac8b" />
    <Box size={[.08, .006, .095]} position={[.12, .075, .08]} color="#1a3037" />
  </group>;
  if (variant === 'marked-valve') return <group>
    <Cylinder radius={.055} height={.43} position={[0, .07, 0]} rotation={[0, 0, Math.PI / 2]} />
    <Cylinder radius={.035} height={.12} position={[0, .14, 0]} />
    <Ring radius={.12} position={[0, .21, 0]} tube={.015} color="#9c6157" />
    <Box size={[.23, .014, .017]} position={[0, .21, 0]} color="#9c6157" /><Box size={[.017, .014, .23]} position={[0, .21, 0]} color="#9c6157" />
    {[0, 1, 2].map(index => <Box key={index} size={[.006, .003, .042]} position={[.105 + index * .021, .125, .01]} color="#34484d" />)}
    {[[-.13, .024, .09], [-.16, .019, .12], [-.11, .017, .14], [-.18, .014, .08]].map((position, index) => <mesh key={index} position={[position[0], position[1], position[2]]}><icosahedronGeometry args={[.016 + index * .002, 0]} /><meshStandardMaterial color="#bdd3ce" roughness={.25} /></mesh>)}
  </group>;
  if (variant === 'particle-pallet') return <group>
    {[-.16, 0, .16].map(x => <Box key={x} size={[.07, .04, .36]} position={[x, .025, 0]} color="#707568" />)}
    {[-.13, 0, .13].map(z => <Box key={z} size={[.44, .018, .08]} position={[0, .052, z]} color="#a6a18a" />)}
    <Box size={[.13, .004, .10]} position={[-.13, .066, -.08]} color="#c8c7af" />
    {[0, 1, 2].map(index => <Box key={index} size={[.087, .002, .004]} position={[-.13, .069, -.10 + index * .023]} color="#737f75" />)}
    {Array.from({ length: 9 }, (_, index) => <mesh key={index} position={[.07 + (index % 3) * .04, .069, .065 + Math.floor(index / 3) * .045]}><icosahedronGeometry args={[.007 + (index % 2) * .003, 0]} /><meshStandardMaterial color="#aacbc1" emissive="#709e94" emissiveIntensity={.7} /></mesh>)}
  </group>;
  if (variant === 'resin-reference') return <group>
    <Box size={[.43, .035, .34]} position={[0, .025, 0]} color="#3a4b50" />
    <Box size={[.15, .07, .20]} position={[-.105, .074, .025]} color="#c8d4bb" opacity={.66} metalness={0} />
    <Box size={[.13, .06, .18]} position={[.12, .08, .015]} color="#7c8f89" />
    <Box size={[.15, .022, .20]} position={[.12, .121, .015]} color="#c8d4bb" opacity={.66} metalness={0} />
    <Box size={[.012, .038, .21]} position={[.196, .109, .015]} color="#d3ddc7" opacity={.60} metalness={0} />
  </group>;
  if (variant === 'audio-fragments') {
    const waveform = [-.006, .008, .015, -.018, .042, -.024, .009, -.006, .025, -.012, .003, -.004, .008];
    return <group>
      <Box size={[.43, .10, .30]} position={[0, .055, 0]} color="#3c525a" />
      <Box size={[.37, .005, .23]} position={[0, .108, -.015]} color="#132c37" />
      {[-.07, .06].map(z => <Line key={z} points={waveform.map((value, index) => [-.17 + index * .028, .113, z + value])} color="#a4c4b7" lineWidth={1.8} />)}
      <Cylinder radius={.018} height={.014} position={[.16, .115, .115]} color="#9d665a" />
    </group>;
  }
  if (variant === 'sealed-air-tube') return <group>
    <Box size={[.38, .024, .24]} position={[0, .018, 0]} color="#3e535a" />
    <Cylinder radius={.055} height={.27} position={[-.09, .18, 0]} color="#b9d8d1" opacity={.24} />
    <Cylinder radius={.058} height={.035} position={[-.09, .33, 0]} color="#b19a6d" />
    <Cylinder radius={.058} height={.025} position={[-.09, .046, 0]} color="#b19a6d" />
    <Box size={[.017, .065, .011]} position={[-.09, .31, .058]} color="#ba8c81" />
    <Box size={[.13, .13, .11]} position={[.125, .10, .02]} color="#687e7e" />
    <Box size={[.08, .035, .004]} position={[.125, .13, .077]} color="#8db29a" />
  </group>;
  return null;
}
