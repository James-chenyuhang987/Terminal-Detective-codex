import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import { getConnectedZones } from '@/game/caseRuntime.js';
import { AGENT_STAMINA_RECOVERY_PER_TURN, AGENT_STAMINA_INVESTIGATION_COST } from '@/game/agentStamina';
import ReconstructionWorkbench from './ReconstructionWorkbench.jsx';
import CaseStoryPanel from './CaseStoryPanel.jsx';
import InvestigationSkillsPanel, { InvestigationSkillQuote, InvestigationSourceHint } from './InvestigationSkillsPanel.jsx';
import './investigationField.css';

const ObjectViewer = lazy(() => import('./EvidenceObjectViewer.jsx'));

export function InspectionFeedback({ feedback, lang }) {
  if (!feedback) return null;
  const narration = text(feedback.narration, lang);
  const expertNote = text(feedback.expert_note, lang);
  const detail = text(feedback.detail, lang);
  return <div role="status" className="td-field-notice">
    <p>{narration || (lang === 'zh' ? '云端已确认。' : 'Confirmed by the cloud.')}</p>
    {expertNote && <p><strong>{lang === 'zh' ? '专业观察：' : 'Professional observation: '}</strong>{expertNote}</p>}
    {detail && <p>{detail}</p>}
  </div>;
}

export function InvestigationActionGuidance({ action, completed, hidden = false, costRules, lang,
  executorId = undefined, apCost = 1, staminaCost = AGENT_STAMINA_INVESTIGATION_COST }) {
  const zh = lang === 'zh';
  const confusion = action === 'inspection'
    ? costRules?.unsuccessful_inspection_confusion ?? 3
    : costRules?.unsuccessful_reconstruction_confusion ?? 3;
  return <div className="td-field-notice">
    {hidden && <p>{zh ? '可选旁证：C/B 级结案不要求取得此物件的证据；它可为更高评价提供独立佐证。' : 'Optional corroboration: this object’s evidence is not required for a C/B closure. It can provide independent support for a higher grade.'}</p>}
    {completed ? <p>{zh ? '已完成核验，复查免费，不推进回合。' : 'Already verified. Review is free and does not advance a turn.'}</p>
      : action === 'inspection'
        ? <p>{zh ? `合适的核验方式会稳定取得对应证据。方式不匹配仍消耗所示 AP、体力并推进一回合，混乱 +${confusion}%；可以复查观察材料后重试。` : `An appropriate inspection method reliably secures the evidence. An unsuitable method still spends the displayed AP and stamina, advances one turn, and adds ${confusion}% confusion. Review the observations and retry.`}</p>
        : <>{executorId === null && <p>{zh ? '暂无体力充足的执行探员，请先小队整备；仍可免费查看核验材料。' : 'No investigator has enough stamina. Recover the team first; reviewing the reconstruction materials remains free.'}</p>}
          <p>{zh ? `执行者：${executorId || (executorId === null ? '暂不可执行' : '云端按体力选择可行动探员')}。提交核验消耗 ${apCost} AP、推进一回合；全队先恢复 ${AGENT_STAMINA_RECOVERY_PER_TURN}% 体力（上限 100%），执行者再扣 ${staminaCost}%。` : `Investigator: ${executorId || (executorId === null ? 'currently unavailable' : 'selected by the server from agents with sufficient stamina')}. Submitting costs ${apCost} AP and advances one turn; the team first recovers ${AGENT_STAMINA_RECOVERY_PER_TURN}% stamina (up to 100%), then the investigator spends ${staminaCost}%.`}</p>
          <p>{zh ? `答案不符另加 ${confusion}% 混乱；可以修改后重试。` : `An incorrect answer also adds ${confusion}% confusion; you can revise and retry.`}</p></>}
  </div>;
}

export default function InvestigationFieldPanel({ investigation, gameState, team, caseData, targetId, onTargetChange, onCommand, busy, active = true,
  reconstructionDraft, onReconstructionDraftChange }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [packs, setPacks] = useState(null);
  const [executorId, setExecutorId] = useState(team[0]?.agent_id || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [localReconstructionDraft, setLocalReconstructionDraft] = useState({ answerIds: [], view: {} });
  const puzzle = investigation.puzzle;
  const materialIds = new Set((puzzle?.items || []).map(item => item.id));
  const currentAnswers = values => [...new Set((Array.isArray(values) ? values : []).filter(id => materialIds.has(id)))];
  const currentReconstructionDraft = reconstructionDraft || localReconstructionDraft;
  // The visible selection and the submitted payload must agree, including
  // after restoring a draft whose source materials have changed.
  const answerIds = currentAnswers(currentReconstructionDraft.answerIds);
  const setReconstructionDraft = onReconstructionDraftChange || setLocalReconstructionDraft;
  const setAnswerIds = next => setReconstructionDraft(previous => ({ ...previous,
    answerIds: currentAnswers(typeof next === 'function' ? next(currentAnswers(previous.answerIds)) : next) }));
  const setWorkbenchView = next => setReconstructionDraft(previous => ({ ...previous,
    view: typeof next === 'function' ? next(previous.view) : next }));
  const [showPuzzle, setShowPuzzle] = useState(false);
  const requestRef = useRef(0);
  const actionRef = useRef(null);
  const optionsRef = useRef(null);
  const view = useMemo(() => ({}), [gameState.run_id, gameState.current_zone, targetId, lang, active]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const mountedRef = useRef(false);
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  const target = investigation.targets.find(item => item.target_id === targetId && item.zone_id === gameState.current_zone);
  const targets = investigation.targets.filter(item => item.zone_id === gameState.current_zone);
  const currentPack = packs?.[executorId];
  const locked = busy || pending || !active;
  const currentGoal = text(investigation.current_goal, lang);
  const directionHint = text(investigation.hint?.direction, lang);
  const zoneLabel = id => caseData.scene?.zones?.[id]?.label || caseData.zone_layout?.[id]?.label || id;
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; requestRef.current++; }; }, []);
  useEffect(() => { setLocalReconstructionDraft({ answerIds: [], view: {} }); setShowPuzzle(false); setNotice(null); }, [gameState.run_id]);

  const loadOptions = async id => {
    if (!id || viewRef.current !== view || !active) return;
    if (optionsRef.current?.view === view && optionsRef.current.id === id && optionsRef.current.request === requestRef.current) return;
    const request = ++requestRef.current;
    const token = { id, request, view };
    optionsRef.current = token;
    setPending(true); setError(''); setPacks(null);
    try {
      const response = await commandRef.current({ type: 'inspect_options', target_id: id });
      if (!mountedRef.current || viewRef.current !== view || request !== requestRef.current) return;
      setPacks(response.result.packs);
      const availableIds = Object.keys(response.result.packs || {});
      setExecutorId(value => availableIds.includes(value) ? value : availableIds[0] || '');
    } catch (cause) {
      if (mountedRef.current && viewRef.current === view && request === requestRef.current && cause?.name !== 'AbortError') {
        setError(zh ? '核验方案尚未确认，请恢复云端连接后重新读取。' : 'Inspection options are unconfirmed. Reconnect and reload them.');
      }
    } finally {
      if (optionsRef.current === token) optionsRef.current = null;
      if (mountedRef.current && viewRef.current === view && request === requestRef.current) setPending(false);
    }
  };
  useEffect(() => {
    if (active && targetId) void loadOptions(targetId);
    else { requestRef.current++; setPacks(null); setPending(false); }
    return () => { requestRef.current++; };
  // Offers are fetched for a deliberate selection, not every returned run revision.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, lang, active, gameState.run_id, gameState.current_zone]);

  const perform = async command => {
    if (locked || actionRef.current || viewRef.current !== view) return;
    const token = {};
    const request = ++requestRef.current;
    actionRef.current = token;
    const isCurrent = () => mountedRef.current && viewRef.current === view && actionRef.current === token && request === requestRef.current;
    setPending(true); setError(''); setNotice(null);
    try {
      const response = await commandRef.current(command);
      if (!isCurrent()) return;
      setNotice(response.result);
      setPacks(null);
      if (command.type === 'travel') onTargetChange(null);
      return response;
    } catch (cause) {
      if (isCurrent() && cause?.name !== 'AbortError') {
        // Another confirmed action can invalidate a previously displayed offer.
        // Remove it so that a deliberate reload is possible without recharging
        // or silently retrying an action whose outcome may still be unknown.
        setPacks(null);
        setError(command.type === 'inspect'
          ? (zh ? '行动尚未确认或选项已过期。核对云端状态后重新读取核验方案。' : 'The action is unconfirmed or its offer expired. Check cloud state, then reload the inspection options.')
          : (zh ? '行动尚未确认或选项已过期。核对云端状态后重新选择。' : 'The action is unconfirmed or its offer expired. Check cloud state, then choose again.'));
      }
    } finally {
      const current = isCurrent();
      if (actionRef.current === token) actionRef.current = null;
      if (current) setPending(false);
    }
  };
  const selectAnswer = id => setAnswerIds(values => values.includes(id) ? values.filter(item => item !== id) : [...values, id]);
  const moveAnswer = (index, direction) => setAnswerIds(values => {
    const next = [...values]; const other = index + direction;
    if (other < 0 || other >= next.length) return values;
    [next[index], next[other]] = [next[other], next[index]];
    return next;
  });

  return <section className="td-field-desk" aria-label={zh ? '现场调查台' : 'Field investigation desk'}>
    <header className="td-field-objective" data-onboarding-target="field-objective"><small>NOVA · {zh ? '当前目标' : 'CURRENT OBJECTIVE'}</small><h3>{currentGoal}</h3>
      {directionHint && directionHint !== currentGoal && <p>{directionHint}</p>}
      <button type="button" onClick={() => setHintLevel(value => Math.min(2, value + 1))}>{zh ? '展开核验提示' : 'Show investigation hint'}</button>
      {hintLevel > 0 && <p>{text(investigation.hint?.verification, lang)}</p>}
      {hintLevel > 1 && <p>{text(investigation.hint?.facts, lang)}</p>}
    </header>
    <CaseStoryPanel story={investigation.story} lang={lang}
      knownClues={(caseData.clue_dictionary || []).filter(clue => gameState.unlocked_clues.includes(clue.clue_id))} />
    <div className="td-field-summary"><span>AP {gameState.action_points_left}</span><span>{zh ? '已保全' : 'Secured'} {gameState.unlocked_clues.length}</span><span>{zoneLabel(gameState.current_zone)}</span></div>
    <InvestigationSkillsPanel skills={investigation.skills} lang={lang} />
    {error && <p role="alert" className="td-field-error">{error}</p>}
    <InspectionFeedback feedback={notice} lang={lang} />
    <InvestigationSourceHint hint={notice?.source_hint} lang={lang} />
    <div className="td-field-objects" data-onboarding-target="field-inspect">
      {targets.map(item => <button type="button" key={item.target_id} className={targetId === item.target_id ? 'is-selected' : ''} disabled={locked || !item.available} onClick={() => { setShowPuzzle(false); setNotice(null); onTargetChange(item.target_id); }}>
        <small>{item.completed ? (zh ? '已核验 · 免费复查' : 'INSPECTED · FREE REVIEW') : item.hidden ? (zh ? '可选旁证 · 提升评价' : 'OPTIONAL CORROBORATION') : (zh ? '待核验' : 'AWAITING INSPECTION')}</small><strong>{text(item.label, lang)}</strong>
      </button>)}
    </div>
    {target && !showPuzzle && <article className="td-field-inspection">
      <header><h3>{text(target.label, lang)}</h3><button type="button" disabled={locked} onClick={() => onTargetChange(null)}>{zh ? '收起物件' : 'Close object'}</button></header>
      <Suspense fallback={<p>{zh ? '正在准备物件视图…' : 'Preparing object view…'}</p>}><ObjectViewer kind={target.kind} targetId={target.target_id}
        completed={target.completed} label={text(target.label, lang)} observation={target.observation}
        executorId={executorId} executor={team.find(agent => agent.agent_id === executorId)}
        expertNotes={(investigation.completed_checks || []).filter(check => check.target_id === target.target_id).map(check => check.expert_note).filter(Boolean)} /></Suspense>
      <p>{text(target.observation, lang)}</p>
      <InvestigationActionGuidance action="inspection" completed={target.completed} hidden={target.hidden} costRules={investigation.cost_rules} lang={lang} />
      {!target.completed && <p>{zh ? `每个新核验回合全队先恢复 ${AGENT_STAMINA_RECOVERY_PER_TURN}% 体力（上限 100%），再扣除执行者显示的体力费用。免费复查不触发恢复。` : `Each new inspection turn first restores ${AGENT_STAMINA_RECOVERY_PER_TURN}% stamina to the team (up to 100%), then deducts the investigator’s displayed stamina cost. Free review does not trigger recovery.`}</p>}
      {(investigation.completed_checks || []).filter(check => check.target_id === target.target_id).map(check => <div key={check.method_id} className="td-field-finding"><p>{text(check.result, lang)}</p></div>)}
      <div className="td-field-agents" role="group" aria-label={zh ? '选择执行探员' : 'Choose investigating agent'}>{team.map(agent => <button type="button" key={agent.agent_id} disabled={locked} aria-pressed={executorId === agent.agent_id} onClick={() => setExecutorId(agent.agent_id)}>{agent.agent_id} · {zh ? '体力' : 'Stamina'} {Math.round(agent.stamina)}%</button>)}</div>
      {!packs && !pending && <button type="button" disabled={locked} onClick={() => void loadOptions(target.target_id)}>{zh ? '读取核验方案 / 免费复查' : 'Load inspection options / free review'}</button>}
      {pending && <p role="status">{zh ? '正在核对云端结果…' : 'Checking cloud result…'}</p>}
      <div className="td-field-methods">{(currentPack?.cards || []).filter(card => !target.completed || card.review).map(card => <button type="button" key={card.option_id} disabled={locked || !card.available || gameState.action_points_left < card.ap_cost}
        onClick={() => void perform({ type: 'inspect', option_id: card.option_id })}>
        <strong>{text(card.label, lang)}</strong><span>{card.review ? (zh ? '免费复查 · 不推进回合' : 'Free review · No turn advance') : `${card.ap_cost} AP · ${zh ? '体力' : 'Stamina'} −${card.stamina_cost}% · ${zh ? '推进一回合' : 'Advances one turn'}`}</span><small>{zh ? `执行者 ${executorId} · 风险：${card.risk_level === 'high' ? '高' : card.risk_level === 'medium' ? '中' : '低'}` : `${executorId} · Risk: ${card.risk_level}`}</small><small>{zh ? '确认此核验方式' : 'Confirm this inspection method'}</small>
        <InvestigationSkillQuote quote={card} lang={lang} />
      </button>)}</div>
    </article>}
    <div className="td-field-secondary-actions">
      <button type="button" disabled={locked || gameState.action_points_left <= 0} onClick={() => void perform({ type: 'rest' })}>{zh ? '小队整备 · 1 AP / 推进一回合' : 'Recover team · 1 AP / advances one turn'}</button>
      <button type="button" data-onboarding-target="field-puzzle" disabled={locked || !puzzle?.available} onClick={() => { setShowPuzzle(value => !value); onTargetChange(null); setError(''); setNotice(null); }}>{text(puzzle?.label, lang) || (zh ? '专属核验' : 'Case reconstruction')}{puzzle?.completed ? ' ✓' : ''}</button>
    </div>
    {showPuzzle && puzzle?.available && <article className={`td-field-puzzle is-${puzzle.type}`}>
      <h3>{text(puzzle.label, lang)}</h3><p>{text(puzzle.prompt, lang)}</p>
      <InvestigationActionGuidance action="reconstruction" completed={puzzle.completed} costRules={investigation.cost_rules} lang={lang}
        executorId={puzzle.executor_agent_id} apCost={puzzle.ap_cost} staminaCost={puzzle.stamina_cost} />
      <InvestigationSkillQuote quote={puzzle} lang={lang} />
      {puzzle.workbench ? <ReconstructionWorkbench key={`${gameState.run_id}:${puzzle.id}`} puzzle={puzzle}
        answerIds={puzzle.completed && puzzle.confirmed_answer_ids ? puzzle.confirmed_answer_ids : answerIds}
        viewState={currentReconstructionDraft.view} onViewChange={setWorkbenchView}
        onAnswerChange={setAnswerIds} disabled={locked} lang={lang} /> : <>
      <p>{puzzle.type === 'compare' ? (zh ? '对照记录，按提示选择能验证判断的条目。' : 'Compare the records and select the entries that test your conclusion.') : (zh ? '选择事件或节点，再用上下按钮排出核验顺序。' : 'Select events or nodes, then use the arrows to arrange them.')}</p>
      <div className="td-puzzle-source">{puzzle.items.map(item => <button type="button" key={item.id} disabled={locked || puzzle.completed} aria-pressed={answerIds.includes(item.id)} onClick={() => selectAnswer(item.id)}>{text(item.label, lang)}</button>)}</div>
      {puzzle.type !== 'compare' && <ol>{answerIds.map((id, index) => <li key={id}><span>{text(puzzle.items.find(item => item.id === id)?.label, lang)}</span><button type="button" disabled={locked || index === 0 || puzzle.completed} onClick={() => moveAnswer(index, -1)} aria-label={zh ? '向前移动' : 'Move earlier'}>↑</button><button type="button" disabled={locked || index === answerIds.length - 1 || puzzle.completed} onClick={() => moveAnswer(index, 1)} aria-label={zh ? '向后移动' : 'Move later'}>↓</button></li>)}</ol>}
      </>}
      <button type="button" disabled={locked || !answerIds.length || puzzle.completed || puzzle.executor_agent_id === null || gameState.action_points_left < (puzzle.ap_cost ?? 1)} onClick={() => void perform({ type: 'puzzle', answer_ids: answerIds })}>{puzzle.completed ? (zh ? '已验证' : 'Verified') : (zh ? `提交核验 · ${puzzle.ap_cost ?? 1} AP` : `Submit reconstruction · ${puzzle.ap_cost ?? 1} AP`)}</button>
    </article>}
    <nav className="td-field-routes" aria-label={zh ? '区域通道' : 'Room routes'}>{Object.entries(investigation.zone_access || {}).filter(([id]) => getConnectedZones(caseData, gameState.current_zone).includes(id)).map(([id, access]) => <button type="button" key={id} disabled={locked || !access.available} onClick={() => void perform({ type: 'travel', zone_id: id })}><strong>{zoneLabel(id)}</strong><small>{access.available ? (zh ? '前往 · 不消耗 AP' : 'Travel · no AP cost') : text(access.requirement, lang) || (zh ? '先完成入口核验' : 'Inspect the entry requirement first')}</small></button>)}</nav>
    <div className="td-field-propositions" data-onboarding-target="field-deduction"><h4>{zh ? '已验证的推理命题' : 'Verified deductions'}</h4>{(investigation.propositions || []).length ? investigation.propositions.map(item => <p key={item.id}>{text(item.label, lang)}</p>) : <p>{zh ? '取得证据后，在推理连线中选择支持、矛盾或先后关系。' : 'After securing evidence, choose support, contradiction or sequence in the link board.'}</p>}</div>
  </section>;
}
