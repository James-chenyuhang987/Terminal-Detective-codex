import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { getConnectedZones } from '@/game/caseRuntime';
import { resolveTheaterInteraction } from '@/game/theaterInteraction';
import { TerminalLine } from '@/components/game/investigation/TerminalPanels';

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

function FieldPanel({ title, children, onClose = null, active = true }) {
  const ref = useRef(null);
  const { lang } = useLang();
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [active]);
  return <section ref={ref} tabIndex={-1} className="td-theater-panel" aria-label={title} onKeyDown={event => {
    if (event.key === 'Escape' && onClose) { event.stopPropagation(); onClose(); }
  }}><header className="td-theater-panel-heading"><h2>{title}</h2>{onClose && <button type="button" onClick={onClose} aria-label={lang === 'zh' ? '收起面板' : 'Close panel'}>✕</button>}</header><div className="td-theater-panel-body">{children}</div></section>;
}

export default function TheaterPresentation({ caseData, gameState, team, active, busy, paused, selectedNpcId, quality, spatialRef, dialoguePanel, reportPanel, toolsPanel, brief, lines, streamingText, phase, canAbort, onAbort, onExecute, onTalk, onOpenTools, onCloseTools, onReport, onCommand, onGuide, onEnd, onTextMode }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [failed, setFailed] = useState(false);
  const [readyZone, setReadyZone] = useState(null);
  const [nearby, setNearby] = useState(null);
  const [panel, setPanel] = useState(() => spatialRef.current.arrived || busy || dialoguePanel || reportPanel ? null : 'arrival');
  const [reducedMotion, setReducedMotion] = useState(false);
  const controlsRef = useRef({ forward: false, backward: false, left: false, right: false });
  const zoneId = gameState.current_zone;
  const ready = readyZone === zoneId;
  const location = caseData.scene?.zones?.[zoneId]?.label || caseData.zone_layout?.[zoneId]?.label || zoneId;
  const movementPaused = paused || busy || !active || Boolean(panel || dialoguePanel || reportPanel);
  const closePanel = () => { spatialRef.current.arrived = true; setPanel(null); onCloseTools(); };
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (movementPaused) Object.keys(controlsRef.current).forEach(key => { controlsRef.current[key] = false; });
  }, [movementPaused]);
  useEffect(() => { setNearby(null); }, [zoneId]);
  const handleReady = useCallback(() => setReadyZone(zoneId), [zoneId]);
  const handleFailure = useCallback(() => setFailed(true), []);
  const interact = useCallback(target => {
    const intent = resolveTheaterInteraction(target, caseData.npcs, movementPaused);
    if (intent?.type === 'talk') onTalk(intent.npc);
    if (intent?.type === 'panel') setPanel(intent.panel);
  }, [caseData.npcs, movementPaused, onTalk]);
  const openTool = tab => { onOpenTools(tab); setPanel('tools'); };
  const nearbyLabel = nearby?.kind === 'npc'
    ? `${zh ? '交谈' : 'Talk'} · ${caseData.npcs.find(npc => npc.npc_id === nearby.npcId)?.name || ''}`
    : nearby?.kind === 'door' ? (zh ? '查看区域通道' : 'Inspect room routes') : (zh ? '调查现场' : 'Investigate scene');
  const unavailable = <SceneUnavailable zh={zh} onTextMode={onTextMode} />;
  const execute = () => { closePanel(); onExecute(); };
  const fieldLine = lines.filter(line => ['narration', 'success', 'trap', 'error'].includes(line.type)).at(-1);

  if (failed) return <section className="td-story-theater">{unavailable}</section>;

  return <section className="td-story-theater" aria-label={zh ? '3D 侦探剧情现场' : '3D detective story theater'}>
    <div className="td-theater-viewport">{failed ? unavailable : <TheaterErrorBoundary fallback={unavailable} onFailure={handleFailure}><Suspense fallback={<LoadingScene zh={zh} />}>
      <LazyTheaterScene caseData={caseData} zoneId={zoneId} selectedNpcId={selectedNpcId} paused={movementPaused} suspended={!active || paused} quality={quality} reducedMotion={reducedMotion} onInteract={interact} onReady={handleReady} onFailure={handleFailure} controlsRef={controlsRef} spatialRef={spatialRef} onNearbyChange={setNearby} />
    </Suspense></TheaterErrorBoundary>}</div>

    <header className="td-theater-case-heading"><div><small>{caseData.case_id} · {zh ? '现场剧情' : 'FIELD STORY'}</small><h1>{caseData.title}</h1><p>⌖ {location}</p></div>
      <div className="td-theater-resources" aria-label={zh ? '案件状态' : 'Case status'}>
        <span>{zh ? '回合' : 'Turn'} <b>{gameState.turn_count}</b></span><span>AP <b>{gameState.action_points_left}</b></span><span>{zh ? '线索' : 'Clues'} <b>{gameState.unlocked_clues.length}</b></span><span>{zh ? '混乱' : 'Confusion'} <b>{gameState.confusion_score}%</b></span><span>HP <b>{gameState.current_hp}%</b></span><span>◆ <b>{gameState.command_state?.points || 0}</b></span>
      </div>
    </header>
    <div className="td-theater-objective"><small>{busy ? phase : (zh ? '当前任务' : 'CURRENT OBJECTIVE')}</small><p>{busy ? (zh ? '正在处理调查指令。可安全切换呈现模式，决策和结算不会取消。' : 'Processing your order. Switching presentation does not cancel decisions or settlement.') : (zh ? '走近人物交谈，或调查工作台开启行动选择。建立证据链后提交报告。' : 'Approach contacts to talk, or inspect a workstation to choose an action. Link evidence, then file your report.')}</p></div>

    {!panel && !dialoguePanel && !reportPanel && (streamingText || fieldLine) && <aside className="td-theater-transmission" aria-label={zh ? '现场字幕' : 'Field subtitles'}><small>{zh ? '现场通讯 · 完整记录见手记' : 'FIELD COMMS · FULL RECORD IN NOTEBOOK'}</small><p role="status">{streamingText || fieldLine.text}</p></aside>}

    {!panel && !dialoguePanel && !reportPanel && !failed && <div className="td-theater-exploration-hud"><p>{movementPaused ? (zh ? '现场移动已暂停' : 'Movement paused') : (zh ? 'WASD / 方向键移动 · 拖动视角 · E 交互' : 'WASD / arrows move · Drag to orbit · E interact')}</p>
      <button type="button" className="td-theater-interact" disabled={!nearby || movementPaused || !ready} onClick={() => interact(nearby)}>{nearby ? `E · ${nearbyLabel}` : (zh ? '靠近光圈标记以交互' : 'Approach a marked contact or prop')}</button>
      <div className="td-theater-touch-pad" aria-label={zh ? '触屏移动方向' : 'Touch movement controls'}>
        {[['forward', '↑', zh ? '前进' : 'Forward'], ['left', '←', zh ? '左移' : 'Left'], ['backward', '↓', zh ? '后退' : 'Backward'], ['right', '→', zh ? '右移' : 'Right']].map(([key, symbol, label]) => <button type="button" key={key} aria-label={label} disabled={movementPaused || !ready}
          onPointerDown={event => { if (movementPaused) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controlsRef.current[key] = true; }}
          onPointerUp={() => { controlsRef.current[key] = false; }} onPointerCancel={() => { controlsRef.current[key] = false; }} onLostPointerCapture={() => { controlsRef.current[key] = false; }}
          onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); controlsRef.current[key] = !movementPaused; } }} onKeyUp={() => { controlsRef.current[key] = false; }} onBlur={() => { controlsRef.current[key] = false; }}>{symbol}</button>)}
      </div>
    </div>}

    {reportPanel && !panel ? <FieldPanel active={active && !paused} title={zh ? '结案 · 事实重建' : 'Report · reconstruction'}>{reportPanel}</FieldPanel>
      : dialoguePanel && !panel ? <FieldPanel active={active && !paused} title={zh ? '现场对话 · 字幕与提问' : 'Field dialogue · subtitles & questions'}>{dialoguePanel}</FieldPanel>
        : panel && <FieldPanel active={active && !paused} title={panel === 'tools' ? (zh ? '调查工具箱' : 'Investigation toolkit') : panel === 'notebook' ? (zh ? '现场手记' : 'Field notebook') : panel === 'routes' ? (zh ? '区域通道' : 'Room routes') : panel === 'contacts' ? (zh ? '案件联络人' : 'Case contacts') : (zh ? '准备调查' : 'Prepare investigation')} onClose={closePanel}>
          {panel === 'arrival' ? <><small>{zh ? '抵达现场 · 案件简报' : 'Scene arrival · case briefing'}</small><p>{caseData.scene?.description}</p><p>{caseData.case_id === 'Lvl_01' ? (zh ? '霓虹血迹：数据中心、大堂、实验室与阳台的紧凑剧情场景。' : 'Neon Blood: compact data center, lobby, lab and balcony scenes.') : (zh ? '本案件使用通用场景布置；案件人物、证据与规则仍来自原案。' : 'This case uses generic scene staging; its characters, evidence and rules remain case-specific.')}</p><p>{zh ? '本模式以字幕与角色动作叙事。移动不推进回合；调查和提问仍会消耗原有资源。' : 'Subtitles and character gestures tell the story. Movement does not advance rounds; investigations and questions still spend their normal resources.'}</p><button type="button" onClick={closePanel}>{zh ? '进入现场' : 'Enter the scene'}</button></> : panel === 'tools' ? toolsPanel : panel === 'notebook' ? <><p>{caseData.scene?.description}</p><hr />{lines.map(line => <TerminalLine key={line.id} line={line} accentColor="#7ce9ed" />)}{streamingText && <p role="status">{streamingText}</p>}</>
            : panel === 'contacts' ? <><p>{zh ? '联络列表与现场人物使用同一提问规则。初始陈述不是已经证实的事实。' : 'Contacts use the same question rules as scene characters. Initial statements are not verified facts.'}</p>{caseData.npcs.map(npc => <button type="button" disabled={busy} key={npc.npc_id} onClick={() => { closePanel(); onTalk(npc); }}>{npc.avatar} {npc.name} · {npc.role}</button>)}</>
              : <>{panel === 'routes' ? <><p>{zh ? '门只显示通道，不会免费开启区域。选择符合入口条件的行动，结算成功后自动进入目标场景。' : 'Doors show routes, not free travel. Choose an action meeting the entry requirement; successful settlement moves you into the next scene.'}</p><ul>{getConnectedZones(caseData, zoneId).map(id => <li key={id}><strong>{caseData.scene?.zones?.[id]?.label || id}</strong><code>{caseData.scene?.zones?.[id]?.entry_requirement || 'search_area'}</code></li>)}</ul><button type="button" onClick={() => openTool('map')}>{zh ? '查看路线与行动优先级' : 'View routes & action priorities'}</button></>
                : <p>{zh ? '现场勘查会读取当前区域的公开观察，随后由你选择探员与分支行动。靠近物件不会赠送证据，也不会绕过体力或入口限制。' : 'Investigation reads public observations from the current zone, then lets you choose an agent and branching action. Walking near props grants no evidence and bypasses no stamina or entry requirements.'}</p>}
                <p>{brief?.message}</p><div className="td-theater-team">{team.map(agent => <span key={agent.agent_id}>{agent.agent_id}<b>{Math.round(agent.stamina)}% {zh ? '体力' : 'stamina'}</b></span>)}</div>
                <p>{zh ? '每轮先恢复 4% 体力；参与者消耗 10%。整备也推进回合和证据销毁倒计时。' : 'Each turn restores 4% stamina; participants spend 10%. Recovery also advances the round and evidence destruction deadlines.'}</p>
                <button type="button" className="is-primary" disabled={busy || gameState.action_points_left <= 0} onClick={execute}>{zh ? '开始观察 / 选择探员与行动' : 'Observe / choose agent & action'}</button>
              </>}
        </FieldPanel>}

    <nav className="td-theater-toolbelt" aria-label={zh ? '调查行动与工具' : 'Investigation actions & tools'}>
      <button type="button" className="is-primary" disabled={busy || gameState.action_points_left <= 0} onClick={execute}>{zh ? '调查 / 整备' : 'Investigate / recover'}</button>
      {canAbort && <button type="button" onClick={onAbort}>{zh ? '中止当前行动' : 'Abort current action'}</button>}
      <button type="button" disabled={busy} onClick={() => setPanel('contacts')}>{zh ? '联络' : 'Contacts'}</button><button type="button" onClick={() => openTool('link')}>{zh ? '证据连线' : 'Link clues'}</button><button type="button" onClick={() => openTool('board')}>{zh ? '线索板 / 工具' : 'Board / tools'}</button><button type="button" disabled={busy} onClick={() => { closePanel(); onReport(); }}>{zh ? '结案报告' : 'Report'}</button><button type="button" onClick={() => setPanel('notebook')}>{zh ? '手记' : 'Notebook'}</button><button type="button" onClick={onCommand}>{zh ? '指挥' : 'Command'}</button><button type="button" onClick={onGuide}>{zh ? '指引' : 'Guide'}</button><button type="button" disabled={busy} onClick={onEnd}>{zh ? '结束调查' : 'End run'}</button>
    </nav>
  </section>;
}
