import Icon, { IconText } from '@/components/ui/Icon';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { getConnectedZones } from '@/game/caseRuntime';
import { resolveTheaterInteraction } from '@/game/theaterInteraction';
import { TerminalLine } from '@/components/game/investigation/TerminalPanels';
import { localizedInvestigationText } from '@/game/investigationChoices.js';
import { fieldProgress } from '@/game/theaterVisuals.js';
import TheaterStatusHUD, { useFieldTransmission } from './TheaterStatusHUD.jsx';

const LazyTheaterScene = lazy(() => import('./TheaterScene'));

class TheaterErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function LoadingScene({ zh }) {
  return <div className="td-theater-loading" role="status"><span aria-hidden="true">◈</span><strong>{zh ? '正在搭建案发现场…' : 'Preparing the crime scene…'}</strong><p>{zh ? '正在加载 3D 场景与角色。可随时切换文字模式，调查进度不变。' : 'Loading 3D rooms and characters. Switch to text at any time without losing progress.'}</p></div>;
}

function SceneUnavailable({ zh, onTextMode }) {
  return <div className="td-theater-unavailable" role="alert"><small>3D · {zh ? '现场暂不可用' : 'SCENE UNAVAILABLE'}</small><h2>{zh ? '调查仍在继续' : 'Your investigation is safe'}</h2><p>{zh ? '设备可能不支持 WebGL、图形上下文已丢失，或场景资源加载失败。切换文字模式即可继续同一案件，不重复扣费。' : 'WebGL may be unavailable, the graphics context was lost, or scene assets failed to load. Continue the same case in text mode without another charge.'}</p><button type="button" onClick={onTextMode}>{zh ? '继续文字剧情模式' : 'Continue in text mode'}</button></div>;
}

function FieldPanel({ title, children, onClose = null, active = true, kind = '' }) {
  const ref = useRef(null);
  const { lang } = useLang();
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [active, kind]);
  return <section ref={ref} tabIndex={-1} className={`td-theater-panel ${kind ? `is-${kind}` : ''}`} aria-label={title} onKeyDown={event => {
    if (event.key === 'Escape' && onClose) { event.stopPropagation(); onClose(); }
  }}><header className="td-theater-panel-heading"><h2>{title}</h2>{onClose && <button type="button" onClick={onClose} aria-label={lang === 'zh' ? '收起面板' : 'Close panel'}>✕</button>}</header><div className="td-theater-panel-body">{children}</div></section>;
}

export default function TheaterPresentation({ caseData, gameState, team, active, busy, paused, selectedNpcId, speakerNpcId = undefined, npcEmotionLevels, quality, spatialRef, investigation = null, sfxEnabled = true, fieldPanel = null, onInspect = null, onActualMove = null, crisisPending = false, guide = null, dialoguePanel, reportPanel, toolsPanel, brief, lines, streamingText, phase, canAbort, onAbort, onExecute, onTalk, onCloseDialogue, onOpenTools, onCloseTools, onReport, onCommand, onGuide, onEnd, onTextMode }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [failed, setFailed] = useState(false);
  const [readyZone, setReadyZone] = useState(null);
  const [nearby, setNearby] = useState(null);
  const [panel, setPanel] = useState(() => spatialRef.current.arrived || busy || dialoguePanel || reportPanel ? null : 'arrival');
  const [focusTargetId, setFocusTargetId] = useState(null);
  const [focusTargetType, setFocusTargetType] = useState('');
  const [focusTargetLabel, setFocusTargetLabel] = useState('');
  const [focusTargetLabelEn, setFocusTargetLabelEn] = useState('');
  const [interactionNpcId, setInteractionNpcId] = useState(null);
  const { reducedMotion } = usePresentationMotion();
  const moreRef = useRef(null);
  const controlsRef = useRef({ forward: false, backward: false, left: false, right: false, sprint: false, activate: /** @type {(() => boolean) | null} */ (null) });
  const zoneId = gameState.current_zone;
  const ready = readyZone === zoneId;
  const location = caseData.scene?.zones?.[zoneId]?.label || caseData.zone_layout?.[zoneId]?.label || zoneId;
  const movementPaused = paused || busy || !active || Boolean(panel || dialoguePanel || reportPanel);
  const progress = useMemo(() => fieldProgress(gameState), [gameState]);
  const closePanel = () => { spatialRef.current.arrived = true; setPanel(null); setFocusTargetId(null); setFocusTargetType(''); setFocusTargetLabel(''); setFocusTargetLabelEn(''); onCloseTools(); };
  const startMovement = key => {
    if (movementPaused || !ready || !controlsRef.current.activate?.()) return false;
    controlsRef.current[key] = true;
    return true;
  };
  useEffect(() => {
    if (movementPaused) ['forward', 'backward', 'left', 'right', 'sprint'].forEach(key => { controlsRef.current[key] = false; });
  }, [movementPaused]);
  useEffect(() => { setNearby(null); setFocusTargetId(null); setFocusTargetType(''); setFocusTargetLabel(''); setFocusTargetLabelEn(''); setInteractionNpcId(null); }, [zoneId]);
  useEffect(() => {
    if (!interactionNpcId) return undefined;
    // Once the owner opens dialogue, selectedNpcId owns the conversation.
    // Clearing the pending gesture also handles closing from NPCDialogBox's
    // own button, which does not pass through this panel's close handler.
    if (dialoguePanel) { setInteractionNpcId(null); return undefined; }
    const pendingId = interactionNpcId;
    const timeout = window.setTimeout(() => setInteractionNpcId(current => current === pendingId ? null : current), 1200);
    return () => window.clearTimeout(timeout);
  }, [dialoguePanel, interactionNpcId]);
  useEffect(() => {
    const dismiss = event => {
      if (!moreRef.current?.open) return;
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && moreRef.current.contains(event.target)) return;
      moreRef.current.open = false;
      if (event.type === 'keydown') {
        event.preventDefault(); event.stopPropagation();
        moreRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss, true); };
  }, []);
  const handleReady = useCallback(() => setReadyZone(zoneId), [zoneId]);
  const handleFailure = useCallback(() => setFailed(true), []);
  const interact = useCallback(target => {
    const intent = resolveTheaterInteraction(target, caseData.npcs, movementPaused);
    if (intent?.type === 'talk') {
      setInteractionNpcId(intent.npc.npc_id);
      onTalk(intent.npc);
    }
    if (intent?.type === 'panel') {
      if (investigation && target.kind === 'investigate') onInspect?.(target.id);
      setPanel(intent.panel);
      setFocusTargetId(target.kind === 'investigate' ? target.id : null);
      setFocusTargetType(target.kind === 'investigate' ? target.hotspotType || '' : '');
      setFocusTargetLabel(target.kind === 'investigate' ? target.presentationLabel || '' : '');
      setFocusTargetLabelEn(target.kind === 'investigate' ? target.presentationLabelEn || '' : '');
    }
  }, [caseData.npcs, movementPaused, onTalk, investigation, onInspect]);
  const closeDialogue = useCallback(() => {
    setInteractionNpcId(null);
    onCloseDialogue?.();
  }, [onCloseDialogue]);
  const openTool = tab => { onOpenTools(tab); setPanel('tools'); setFocusTargetId(null); setFocusTargetType(''); setFocusTargetLabel(''); setFocusTargetLabelEn(''); };
  const nearbyLabel = nearby?.kind === 'npc'
    ? `${zh ? '交谈' : 'Talk'} · ${caseData.npcs.find(npc => npc.npc_id === nearby.npcId)?.name || ''}`
    : nearby?.kind === 'door' ? (zh ? '查看区域通道' : 'Inspect room routes') : (zh ? (nearby?.presentationLabel || '检查调查点') : (nearby?.presentationLabelEn || 'Inspect investigation point'));
  const unavailable = <SceneUnavailable zh={zh} onTextMode={onTextMode} />;
  const execute = () => {
    closePanel();
    onExecute();
    if (investigation) setPanel('investigate');
  };
  const fieldLine = useFieldTransmission(lines.filter(line => ['narration', 'success', 'trap', 'error'].includes(line.type)).at(-1), active);
  const inspectionTitle = zh ? (focusTargetLabel || (focusTargetType === 'evidence' ? '证物检查' : '调查终端')) : (focusTargetLabelEn || (focusTargetType === 'evidence' ? 'Evidence inspection' : 'Investigation console'));

  if (failed) return <section className="td-story-theater">{unavailable}</section>;

  return <section className={`td-story-theater ${panel || dialoguePanel || reportPanel ? 'has-field-panel' : ''}`} aria-label={zh ? '3D 侦探剧情现场' : '3D detective story theater'}>
    <div hidden={Boolean(panel || dialoguePanel || reportPanel)}>{guide}</div>
    <div className="td-theater-viewport">{failed ? unavailable : <TheaterErrorBoundary fallback={unavailable} onFailure={handleFailure}><Suspense fallback={<LoadingScene zh={zh} />}>
      <LazyTheaterScene speakerNpcId={speakerNpcId} investigation={investigation} sfxEnabled={sfxEnabled} caseData={caseData} zoneId={zoneId} selectedNpcId={dialoguePanel && !panel && !reportPanel ? selectedNpcId : null} interactionNpcId={interactionNpcId} npcEmotionLevels={npcEmotionLevels} progress={progress} focusTargetId={panel === 'investigate' ? focusTargetId : null} focusTargetType={panel === 'investigate' ? focusTargetType : ''} overview={panel === 'arrival'} paused={movementPaused} suspended={!active || paused} quality={quality} reducedMotion={reducedMotion} onInteract={interact} onReady={handleReady} onFailure={handleFailure} controlsRef={controlsRef} spatialRef={spatialRef} onNearbyChange={setNearby} onActualMove={onActualMove} />
    </Suspense></TheaterErrorBoundary>}</div>

    <header className="td-theater-case-heading"><div><small>{caseData.case_id} · {zh ? '现场剧情' : 'FIELD STORY'}</small><h1>{caseData.title}</h1><p>⌖ {location}</p></div>
      <TheaterStatusHUD gameState={gameState} evidenceCount={progress.evidenceCount} crisisPending={crisisPending} />
    </header>
    <div className="td-theater-objective" data-onboarding-target="field-objective"><small>{busy ? phase : (zh ? '当前任务' : 'CURRENT OBJECTIVE')}</small><p>{busy ? (zh ? '探员正在处理调查指令…' : 'Your agents are carrying out the investigation…') : (investigation ? localizedInvestigationText(investigation.current_goal, lang) : (zh ? '检查现场、核对口供，建立证据链。' : 'Inspect the scene, compare statements, and link evidence.'))}</p></div>

    {!panel && !dialoguePanel && !reportPanel && (streamingText || fieldLine) && <aside className="td-theater-transmission" aria-label={zh ? '现场字幕' : 'Field subtitles'}><small>{zh ? '现场通讯 · 完整记录见手记' : 'FIELD COMMS · FULL RECORD IN NOTEBOOK'}</small><p role="status"><IconText text={streamingText || fieldLine.text} /></p></aside>}

    {!panel && !dialoguePanel && !reportPanel && !failed && <div className="td-theater-exploration-hud"><p>{movementPaused ? (zh ? '现场移动已暂停' : 'Movement paused') : (zh ? 'WASD / 方向键移动 · 按住 R 疾跑 · 拖动视角 · E 交互' : 'WASD / arrows move · Hold R to sprint · Drag to orbit · E interact')}</p>
      <button type="button" className="td-theater-interact" disabled={!nearby || movementPaused || !ready} onClick={() => interact(nearby)}>{nearby ? `E · ${nearbyLabel}` : (zh ? '靠近人物或调查物件' : 'Approach a contact or investigation prop')}</button>
      <div className="td-theater-touch-pad" aria-label={zh ? '触屏移动方向' : 'Touch movement controls'}>
        {[['forward', '↑', zh ? '前进' : 'Forward'], ['left', '←', zh ? '左移' : 'Left'], ['backward', '↓', zh ? '后退' : 'Backward'], ['right', '→', zh ? '右移' : 'Right']].map(([key, symbol, label]) => <button type="button" key={key} aria-label={label} disabled={movementPaused || !ready}
          onPointerDown={event => { if (event.button !== 0 || !startMovement(key)) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={() => { controlsRef.current[key] = false; }} onPointerCancel={() => { controlsRef.current[key] = false; }} onLostPointerCapture={() => { controlsRef.current[key] = false; }}
          onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey) startMovement(key); } }} onKeyUp={() => { controlsRef.current[key] = false; }} onBlur={() => { controlsRef.current[key] = false; }}>{symbol}</button>)}
      </div>
    </div>}

    {reportPanel && !panel ? <FieldPanel active={active && !paused} kind="report" title={zh ? '结案 · 事实重建' : 'Report · reconstruction'} onClose={onReport}>{reportPanel}</FieldPanel>
      : dialoguePanel && !panel ? <FieldPanel active={active && !paused} kind="dialogue" title={zh ? '现场对话 · 字幕与提问' : 'Field dialogue · subtitles & questions'} onClose={closeDialogue}>{dialoguePanel}</FieldPanel>
        : panel && <FieldPanel active={active && !paused} kind={panel} title={panel === 'tools' ? (zh ? '调查工具箱' : 'Investigation toolkit') : panel === 'notebook' ? (zh ? '现场手记' : 'Field notebook') : panel === 'routes' ? (zh ? '区域通道' : 'Room routes') : panel === 'contacts' ? (zh ? '案件联络人' : 'Case contacts') : panel === 'investigate' ? inspectionTitle : (zh ? '准备调查' : 'Prepare investigation')} onClose={closePanel}>
          {panel === 'arrival' ? <><small>{zh ? '抵达现场 · 案件简报' : 'Scene arrival · case briefing'}</small><p>{caseData.scene?.description}</p><p>{zh ? '走近人物交谈，检查终端与证物台。已保全的证据会在现场留下标记。' : 'Approach contacts and inspect the console and evidence table. Secured evidence leaves a visible record in the scene.'}</p><p>{zh ? '探索不推进回合；调查与提问使用行动资源。' : 'Exploration does not advance rounds. Investigation and questions use action resources.'}</p><button type="button" onClick={closePanel}>{zh ? '进入现场' : 'Enter the scene'}</button></> : investigation && (panel === 'investigate' || panel === 'routes') ? fieldPanel : panel === 'tools' ? toolsPanel : panel === 'notebook' ? <><p>{caseData.scene?.description}</p><hr />{lines.map(line => <TerminalLine key={line.id} line={line} accentColor="#a5c8c0" />)}{streamingText && <p role="status"><IconText text={streamingText} /></p>}</>
              : panel === 'contacts' ? <><p>{zh ? '联络列表与现场人物使用同一提问规则。初始陈述不是已经证实的事实。' : 'Contacts use the same question rules as scene characters. Initial statements are not verified facts.'}</p>{caseData.npcs.filter(npc => !investigation || investigation.npc_zones[npc.npc_id] === zoneId).map(npc => <button type="button" disabled={busy} key={npc.npc_id} onClick={() => { closePanel(); setInteractionNpcId(npc.npc_id); onTalk(npc); }}><Icon name={npc.avatar} /> {npc.name} · {npc.role}</button>)}</>
              : <>{panel === 'routes' ? <><p>{zh ? '门只显示通道，不会免费开启区域。选择符合入口条件的行动，结算成功后自动进入目标场景。' : 'Doors show routes, not free travel. Choose an action meeting the entry requirement; successful settlement moves you into the next scene.'}</p><ul>{getConnectedZones(caseData, zoneId).map(id => <li key={id}><strong>{caseData.scene?.zones?.[id]?.label || id}</strong><code>{caseData.scene?.zones?.[id]?.entry_requirement || 'search_area'}</code></li>)}</ul><button type="button" onClick={() => openTool('map')}>{zh ? '查看路线与行动优先级' : 'View routes & action priorities'}</button></>
                : <><p>{focusTargetType === 'evidence' ? (zh ? '近距离核对物件表面与保全标记，决定下一步分析方向。' : 'Examine the surfaces and preservation tags, then choose your next analysis.') : (zh ? '核对终端状态与现场观察，选择负责处理的探员。' : 'Review console status and field observations, then choose the agent who will handle them.')}</p><div className="td-theater-inspection-status"><small>{zh ? '案件保全记录' : 'CASE PRESERVATION RECORD'}</small><strong>{progress.evidenceCount ? (zh ? `${progress.evidenceCount} 份证据已保全` : `${progress.evidenceCount} pieces of evidence secured`) : (zh ? '等待首次证据保全' : 'Awaiting the first secured evidence')}</strong></div>{progress.evidenceIds.length > 0 && <ul>{caseData.clue_dictionary.filter(clue => progress.evidenceIds.includes(clue.clue_id) && clue.unlock_turn === undefined).map(clue => <li key={clue.clue_id}>{clue.keyword}</li>)}</ul>}</>}
                <p><IconText text={brief?.message} /></p><div className="td-theater-team">{team.map(agent => <span key={agent.agent_id}>{agent.agent_id}<b>{Math.round(agent.stamina)}% {zh ? '体力' : 'stamina'}</b></span>)}</div>
                <p>{zh ? '每轮先恢复 4% 体力；参与者消耗 10%。整备也推进回合和证据销毁倒计时。' : 'Each turn restores 4% stamina; participants spend 10%. Recovery also advances the round and evidence destruction deadlines.'}</p>
                <button type="button" className="is-primary" data-onboarding-target="field-inspect" disabled={busy || (!investigation && gameState.action_points_left <= 0)} onClick={execute}>{zh ? '开始观察 / 选择探员与行动' : 'Observe / choose agent & action'}</button>
              </>}
        </FieldPanel>}

    <nav className="td-theater-toolbelt" aria-label={zh ? '调查行动与工具' : 'Investigation actions & tools'}>
      <button type="button" className="is-primary" data-onboarding-target="field-inspect" disabled={busy || (!investigation && gameState.action_points_left <= 0)} onClick={execute}>{zh ? '现场调查 / 整备' : 'Inspect / recover'}</button>
      {canAbort && <button type="button" onClick={onAbort}>{zh ? '中止当前行动' : 'Abort current action'}</button>}
      <button type="button" onClick={() => openTool('board')}>{zh ? '调查工具箱' : 'Field toolkit'}</button><button type="button" disabled={busy} onClick={() => { closePanel(); onReport(); }}>{zh ? '结案报告' : 'Report'}</button><button type="button" onClick={() => { setPanel('notebook'); setFocusTargetId(null); }}>{zh ? '手记' : 'Notebook'}</button>
      <details ref={moreRef} className="td-theater-more"><summary>{zh ? '更多' : 'More'}</summary><div><button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details').open = false; setPanel('contacts'); setFocusTargetId(null); }}>{zh ? '联络人' : 'Contacts'}</button><button type="button" onClick={event => { event.currentTarget.closest('details').open = false; openTool('link'); }}>{zh ? '证据连线' : 'Link clues'}</button><button type="button" onClick={event => { event.currentTarget.closest('details').open = false; onCommand(); }}>{zh ? '指挥' : 'Command'} · CP {gameState.command_state?.points || 0}</button><button type="button" onClick={event => { event.currentTarget.closest('details').open = false; onGuide(); }}>{zh ? '指引' : 'Guide'}</button><button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details').open = false; onEnd(); }}>{zh ? '结束调查' : 'End run'}</button></div></details>
    </nav>
  </section>;
}
