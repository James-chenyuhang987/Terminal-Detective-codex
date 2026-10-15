/* eslint-disable react/no-unknown-property -- React Three Fiber scene properties */
import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { InvestigationPropModel } from '../theater/InvestigationProps.jsx';
import { useLang } from '@/lib/lang.jsx';

class ViewerBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function EvidenceObjectViewer({ kind, completed = false, label }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(1);
  const fallback = <p>{zh ? '物件观察资料如下，可继续核验。' : 'Read the observation below to continue inspecting.'}</p>;
  return <div className="td-object-viewer">
    <div className="td-object-canvas" aria-label={`${zh ? '物件观察' : 'Object view'} · ${label}`}>
      <ViewerBoundary fallback={fallback}><Canvas frameloop="demand" dpr={1} camera={{ position: [1.4, 1.15, 2], fov: 42 }} fallback={fallback}>
        <ambientLight intensity={1.4} /><directionalLight position={[3, 4, 2]} intensity={2.2} />
        <Suspense fallback={null}><group rotation={[0, angle, 0]} scale={zoom}><InvestigationPropModel kind={kind} completed={completed} /></group></Suspense>
        <OrbitControls enablePan={false} minDistance={1} maxDistance={5} target={[0, .15, 0]} />
      </Canvas></ViewerBoundary>
    </div>
    <div className="td-object-view-controls">
      <button type="button" onClick={() => setAngle(value => value - Math.PI / 6)} aria-label={zh ? '向左旋转物件' : 'Rotate object left'}>↶</button>
      <button type="button" onClick={() => setAngle(value => value + Math.PI / 6)} aria-label={zh ? '向右旋转物件' : 'Rotate object right'}>↷</button>
      <button type="button" onClick={() => setZoom(value => Math.min(1.6, value + .15))} aria-label={zh ? '放大物件' : 'Enlarge object'}>＋</button>
      <button type="button" onClick={() => setZoom(value => Math.max(.65, value - .15))} aria-label={zh ? '缩小物件' : 'Shrink object'}>−</button>
      <span>{zh ? '观察与旋转不消耗资源' : 'Viewing and rotation cost no resources'}</span>
    </div>
  </div>;
}
