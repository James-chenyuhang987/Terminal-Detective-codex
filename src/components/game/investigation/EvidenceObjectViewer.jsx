/* eslint-disable react/no-unknown-property -- React Three Fiber scene properties */
import React, { Suspense, useEffect, useId, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { InvestigationPropModel } from '../theater/InvestigationProps.jsx';
import { ObservationMarkers } from '../theater/ObservationPropDetails.jsx';
import { observationAssist, observationPresentation } from '@/game/observationPresentation.js';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import { useLang } from '@/lib/lang.jsx';
import './observationViewer.css';

export class ObservationViewerBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function ObjectObservation({ kind, targetId = '', completed = false, label, observation = '', executorId = '', executor = null, expertNotes = [] }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [annotated, setAnnotated] = useState(true);
  const [textOnly, setTextOnly] = useState(false);
  const [gpuFailed, setGpuFailed] = useState(false);
  const canvasRef = useRef(null);
  const viewerId = useId();
  const presentation = observationPresentation(targetId);
  const assist = observationAssist(executor);
  const observationText = text(observation, lang);
  const earnedNotes = [...new Set((Array.isArray(expertNotes) ? expertNotes : [expertNotes]).map(note => text(note, lang)).filter(Boolean))];
  const showText = textOnly || gpuFailed;
  const failureMessage = zh ? '3D 视图暂不可用。下方观察与标注仍可免费阅读，核验不受影响。' : 'The 3D view is unavailable. Read the free observation and annotations below; verification remains available.';
  const fallback = <div className="td-observation-fallback" role="status"><p>{failureMessage}</p>{observationText && <p>{observationText}</p>}</div>;
  const loseContext = event => { event.preventDefault(); setGpuFailed(true); };
  const attachCanvas = ({ gl }) => {
    canvasRef.current?.canvas.removeEventListener('webglcontextlost', canvasRef.current.listener);
    gl.domElement.addEventListener('webglcontextlost', loseContext);
    canvasRef.current = { canvas: gl.domElement, listener: loseContext };
  };
  useEffect(() => () => {
    canvasRef.current?.canvas.removeEventListener('webglcontextlost', canvasRef.current.listener);
    canvasRef.current = null;
  }, [showText]);

  return <div className="td-object-viewer td-observation-viewer">
    <div className="td-observation-toolbar" role="group" aria-label={zh ? '观察显示方式' : 'Observation display'}>
      <button type="button" aria-pressed={!showText} aria-controls={viewerId} onClick={() => { setGpuFailed(false); setTextOnly(false); }}>{gpuFailed ? (zh ? '重试 3D' : 'Retry 3D') : (zh ? '3D 外观' : '3D appearance')}</button>
      <button type="button" aria-pressed={showText} aria-controls={viewerId} onClick={() => setTextOnly(true)}>{zh ? '文字观察' : 'Text observation'}</button>
      {presentation && <button type="button" aria-pressed={annotated} aria-controls={`${viewerId}-features`} onClick={() => setAnnotated(value => !value)}>{annotated ? (zh ? '隐藏标注' : 'Hide annotations') : (zh ? '显示观察标注' : 'Show annotations')}</button>}
    </div>
    <div id={viewerId} className={`td-object-canvas${showText ? ' is-text-observation' : ''}`} aria-label={`${zh ? '物件观察' : 'Object view'} · ${label}`}>
      {showText ? <div className="td-observation-text-view">{gpuFailed ? <p role="status">{failureMessage}</p> : <strong>{zh ? '文字观察 · 免费' : 'Text observation · free'}</strong>}
        <p>{observationText || (zh ? '请阅读现场已公开的物件观察。' : 'Read the object observation published in the field desk.')}</p></div>
        : <ObservationViewerBoundary fallback={fallback} onFailure={() => setGpuFailed(true)}><Canvas frameloop="demand" dpr={1} camera={{ position: [.85, .65, 1.05], fov: 40 }} fallback={fallback} onCreated={attachCanvas}>
          <ambientLight intensity={1.4} /><directionalLight position={[3, 4, 2]} intensity={2.2} />
          <Suspense fallback={null}><group rotation={[0, angle, 0]} scale={zoom}>
            <InvestigationPropModel kind={kind} targetId={targetId} completed={completed} closeup />
            <ObservationMarkers presentation={presentation} assist={assist} visible={annotated} />
          </group></Suspense>
          <OrbitControls enablePan={false} enableDamping={false} minDistance={.65} maxDistance={3} target={[0, .14, 0]} />
        </Canvas></ObservationViewerBoundary>}
    </div>
    {!showText && <div className="td-object-view-controls" role="group" aria-label={zh ? '旋转与缩放物件' : 'Rotate and scale object'}>
      <button type="button" onClick={() => setAngle(value => value - Math.PI / 6)} aria-label={zh ? '向左旋转物件' : 'Rotate object left'}>↶</button>
      <button type="button" onClick={() => setAngle(value => value + Math.PI / 6)} aria-label={zh ? '向右旋转物件' : 'Rotate object right'}>↷</button>
      <button type="button" disabled={zoom >= 1.6} onClick={() => setZoom(value => Math.min(1.6, value + .15))} aria-label={zh ? '放大物件' : 'Enlarge object'}>＋</button>
      <button type="button" disabled={zoom <= .65} onClick={() => setZoom(value => Math.max(.65, value - .15))} aria-label={zh ? '缩小物件' : 'Shrink object'}>−</button>
      <button type="button" onClick={() => { setAngle(0); setZoom(1); }}>{zh ? '重置角度' : 'Reset view'}</button>
    </div>}
    <p className="td-observation-free">{zh ? '观察、标注与旋转免费；不会新增证据或改变核验费用。' : 'Viewing, annotations and rotation are free. They do not grant evidence or alter inspection costs.'}</p>
    {presentation && <section id={`${viewerId}-features`} className="td-observation-features" aria-label={zh ? '已公开的外观细节' : 'Published appearance details'}>
      <p>{text(presentation.viewHint, lang)}</p>
      {annotated && <ol>{presentation.features.map(feature => <li key={feature.id}>{text(feature.label, lang)}</li>)}</ol>}
      <small>{zh ? '物件示意依据现场观察绘制，精确读数与内容需正式核验。' : 'The object sketch follows the field observation. Exact readings and contents require verification.'}</small>
    </section>}
    {assist && <aside className="td-observation-assist" role="note"><strong>{executorId || executor?.agent_id} · {text(assist.label, lang)}</strong><p>{text(assist.instruction, lang)}</p><small>{zh ? '仅切换查看辅助；核验结果由所选方法决定。' : 'This changes the viewing aid only. The selected method determines the verification result.'}</small></aside>}
    {earnedNotes.length > 0 && <details className="td-observation-earned"><summary>{zh ? '回看已取得的专业观察' : 'Review earned professional observations'}</summary>{earnedNotes.map(note => <p key={note}>{note}</p>)}</details>}
  </div>;
}

// A different object starts with its own angle, WebGL boundary and reader mode.
export default function EvidenceObjectViewer(props) {
  return <ObjectObservation key={props.targetId || props.kind || 'scene-object'} {...props} />;
}
