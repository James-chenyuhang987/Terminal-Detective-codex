import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import { getAccessibleZonePath, getConnectedZones } from '@/game/caseRuntime.js';
import { buildContactLeads } from '@/game/investigationLeads.js';
import { AGENT_STAMINA_RECOVERY_PER_TURN, AGENT_STAMINA_INVESTIGATION_COST } from '@/game/agentStamina';
import ReconstructionWorkbench from './ReconstructionWorkbench.jsx';
import CaseStoryPanel from './CaseStoryPanel.jsx';
import InvestigationContacts from './InvestigationContacts.jsx';
import InvestigationSkillsPanel, { InvestigationSkillQuote, InvestigationSourceHint } from './InvestigationSkillsPanel.jsx';
import './investigationField.css';

const ObjectViewer = lazy(() => import('./EvidenceObjectViewer.jsx'));

export function InspectionFeedback({ feedback, lang }) {
  if (!feedback) return null;
  const narration = text(feedback.narration, lang);
  const expertNote = text(feedback.expert_note, lang);
  const detail = text(feedback.detail, lang);
  const limitation = text(feedback.limitation, lang);
  return <div role="status" className="td-field-notice">
    {feedback.finding && <strong>{lang === 'zh' ? '已保存初步发现 · 不代替报告证据' : 'Preliminary finding saved · Not report evidence'}</strong>}
    <p>{narration || (lang === 'zh' ? '云端已确认。' : 'Confirmed by the cloud.')}</p>
    {limitation && <p><strong>{lang === 'zh' ? '证明局限：' : 'What this cannot establish: '}</strong>{limitation}</p>}
    {expertNote && <p><strong>{lang === 'zh' ? '专业观察：' : 'Professional observation: '}</strong>{expertNote}</p>}
    {detail && <p>{detail}</p>}
  </div>;
}

export function InvestigationActionGuidance({ action, completed, hidden = false, costRules, lang,
  executorId = undefined, apCost = 1, staminaCost = AGENT_STAMINA_INVESTIGATION_COST, preliminaryChecks = false }) {
  const zh = lang === 'zh';
  const confusion = action === 'inspection'
    ? costRules?.unsuccessful_inspection_confusion ?? 3
    : costRules?.unsuccessful_reconstruction_confusion ?? 3;
  return <div className="td-field-notice">
    {hidden && <p>{zh ? '可选旁证：C/B 级结案不要求取得此物件的证据；它可为更高评价提供独立佐证。' : 'Optional corroboration: this object’s evidence is not required for a C/B closure. It can provide independent support for a higher grade.'}</p>}
    {completed ? <p>{zh ? '已完成核验，复查免费，不推进回合。' : 'Already verified. Review is free and does not advance a turn.'}</p>
      : action === 'inspection'
        ? preliminaryChecks
          ? <><p>{zh ? '选择要核实的疑点，比较各方法能证明什么。有效初查会保存发现及其局限；关键核验取得的证据才能用于报告。' : 'Choose which question to investigate and compare what each method can establish. Valid preliminary checks save findings and their limits; the key verification secures evidence for your report.'}</p>
            <p>{zh ? '有效初查与该物件后续完整核验共享最多 1 AP 基础费用，按已付 AP 抵扣；每次新检查仍消耗体力并推进一回合。已做过的检查可免费复查。' : 'Valid preliminary checks and the same object’s later full verification share at most 1 AP in base costs, credited from AP already paid. Each new check still spends stamina and advances one turn. Completed checks can be reviewed free.'}</p>
            <p>{zh ? `不适用的方法仍按报价收费，并增加 ${confusion}% 混乱；有效初查不会因尚未取得关键证据而受罚。` : `An unsuitable method still spends its quoted costs and adds ${confusion}% confusion. A valid preliminary finding is not penalized for leaving the key evidence unverified.`}</p></>
          : <p>{zh ? `合适的核验方式会稳定取得对应证据。方式不匹配仍消耗所示 AP、体力并推进一回合，混乱 +${confusion}%；可以复查观察材料后重试。` : `An appropriate inspection method reliably secures the evidence. An unsuitable method still spends the displayed AP and stamina, advances one turn, and adds ${confusion}% confusion. Review the observations and retry.`}</p>
        : <>{executorId === null && <p>{zh ? '暂无体力充足的执行探员，请先小队整备；仍可免费查看核验材料。' : 'No investigator has enough stamina. Recover the team first; reviewing the reconstruction materials remains free.'}</p>}
          <p>{zh ? `执行者：${executorId || (executorId === null ? '暂不可执行' : '云端按体力选择可行动探员')}。提交核验消耗 ${apCost} AP、推进一回合；全队先恢复 ${AGENT_STAMINA_RECOVERY_PER_TURN}% 体力（上限 100%），执行者再扣 ${staminaCost}%。` : `Investigator: ${executorId || (executorId === null ? 'currently unavailable' : 'selected by the server from agents with sufficient stamina')}. Submitting costs ${apCost} AP and advances one turn; the team first recovers ${AGENT_STAMINA_RECOVERY_PER_TURN}% stamina (up to 100%), then the investigator spends ${staminaCost}%.`}</p>
          <p>{zh ? `答案不符另加 ${confusion}% 混乱；可以修改后重试。` : `An incorrect answer also adds ${confusion}% confusion; you can revise and retry.`}</p></>}
  </div>;
}

export function InspectionFindings({ findings = [], lang }) {
  if (!findings.length) return null;
  const zh = lang === 'zh';
  return <section className="td-field-preliminary" aria-label={zh ? '保存的初步发现' : 'Saved preliminary findings'}>
    <h4>{zh ? '保存的初步发现' : 'Saved preliminary findings'}</h4>
    <p>{zh ? '这些观察保留了调查方向，不代替结案报告所需的关键证据。' : 'These observations preserve investigative leads; they do not replace the key evidence required by the report.'}</p>
    {findings.map(finding => <article key={finding.method_id}>
      <strong>{text(finding.label, lang)}</strong>
      <p>{text(finding.result, lang)}</p>
      {text(finding.limitation, lang) && <p><strong>{zh ? '证明局限：' : 'What this cannot establish: '}</strong>{text(finding.limitation, lang)}</p>}
      {finding.executor_agent_id && <small>{zh ? '执行者：' : 'Investigator: '}{finding.executor_agent_id}</small>}
    </article>)}
  </section>;
}

/** Render server-published facts as text nodes, never as raw objects. */
export function InvestigationFacts({ facts = [], lang }) {
  const values = (Array.isArray(facts) ? facts : [facts])
    .map(fact => text(fact, lang))
    .filter(value => typeof value === 'string' && value.trim());
  if (!values.length) return <p className="td-field-facts-empty">{lang === 'zh' ? '还没有已确认事实。' : 'No confirmed facts yet.'}</p>;
  return <ul className="td-field-facts">{values.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}</ul>;
}

export default function InvestigationFieldPanel({ investigation, gameState, team, caseData, targetId, onTargetChange, onCommand, busy, active = true,
  reconstructionDraft, onReconstructionDraftChange, followedNpcId = null, onFollowNpc, onTalk }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [offer, setOffer] = useState(null);
  const [executorId, setExecutorId] = useState(team[0]?.agent_id || '');
  const [pendingView, setPendingView] = useState(null);
  const [failure, setFailure] = useState(null);
  const [feedback, setFeedback] = useState(null);
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
  const target = investigation.targets.find(item => item.target_id === targetId && item.zone_id === gameState.current_zone);
  const canInspect = target?.available === true;
  const view = useMemo(() => ({}), [gameState.run_id, gameState.current_zone, targetId, canInspect, lang, active]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const mountedRef = useRef(false);
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  const targets = investigation.targets.filter(item => item.zone_id === gameState.current_zone);
  const inspectionFindings = Array.isArray(investigation.inspection_findings) ? investigation.inspection_findings : [];
  const findingTargetIds = new Set(inspectionFindings.map(finding => finding.target_id));
  // A previous object's offer must disappear during render, before effects
  // fetch the replacement. Otherwise its payable method can appear on this object.
  const packs = offer?.view === view ? offer.packs : null;
  const pending = pendingView === view;
  const error = failure?.view === view ? failure.message : '';
  const notice = feedback?.view === view ? feedback.result : null;
  const currentPack = packs?.[executorId];
  const locked = busy || pending || !active;
  const currentGoal = text(investigation.current_goal, lang);
  const directionHint = text(investigation.hint?.direction, lang);
  const goalTarget = investigation.current_goal_target;
  const contacts = buildContactLeads({ investigation, caseData, currentZone: gameState.current_zone, lang });
  const followedContact = contacts.find(contact => contact.id === followedNpcId);
  const goalRoute = followedContact ? followedContact.route
    : getAccessibleZonePath(caseData, gameState.current_zone, goalTarget?.zone_id, investigation.zone_access);
  const goalNextZone = goalRoute?.[0];
  const routeLabel = followedContact ? (zh ? '通往我的追查方向' : 'TOWARD MY LEAD') : (zh ? '通往当前目标' : 'TOWARD CURRENT LEAD');
  const coreTargets = investigation.targets.filter(item => !item.hidden);
  const sceneComplete = coreTargets.length > 0 && coreTargets.every(item => item.completed);
  const publicNpcs = Array.isArray(caseData.npcs) ? caseData.npcs : [];
  const testimonyComplete = publicNpcs.length > 0 && publicNpcs.every(npc => (Number(investigation.testimony_stages?.[npc.npc_id]) || 0) >= 2);
  const reconstructionComplete = investigation.puzzle?.completed === true;
  const deductionComplete = (investigation.propositions || []).length >= 2;
  const progressSteps = [
    { id: 'scene', zh: '现场取证', en: 'Scene evidence', done: sceneComplete },
    { id: 'testimony', zh: '证词核验', en: 'Testimony', done: testimonyComplete },
    { id: 'reconstruction', zh: '专属核验', en: 'Reconstruction', done: reconstructionComplete },
    { id: 'deduction', zh: '关系推理', en: 'Deductions', done: deductionComplete },
    { id: 'report', zh: '结案报告', en: 'Case report', done: false },
  ];
  const activeProgressIndex = progressSteps.findIndex(step => !step.done);
  const zoneLabel = id => caseData.scene?.zones?.[id]?.label || caseData.zone_layout?.[id]?.label || id;
  const followContact = id => {
    if (locked || actionRef.current || optionsRef.current?.view === view || viewRef.current !== view) return;
    if (id === null || contacts.some(contact => contact.id === id)) onFollowNpc?.(id);
  };
  const talkToFollowedContact = () => {
    if (locked || actionRef.current || optionsRef.current?.view === view || viewRef.current !== view
      || !followedContact || followedContact.zoneId !== gameState.current_zone) return;
    onTalk?.(followedContact.id);
  };
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; requestRef.current++; }; }, []);
  useEffect(() => { setLocalReconstructionDraft({ answerIds: [], view: {} }); setShowPuzzle(false); setFeedback(null); setHintLevel(0); }, [gameState.run_id]);

  const loadOptions = async id => {
    if (!canInspect || id !== target?.target_id || viewRef.current !== view || !active || actionRef.current) return;
    if (optionsRef.current?.view === view && optionsRef.current.id === id && optionsRef.current.request === requestRef.current) return;
    const request = ++requestRef.current;
    const token = { id, request, view };
    optionsRef.current = token;
    setPendingView(view); setFailure(null); setOffer(null);
    try {
      const response = await commandRef.current({ type: 'inspect_options', target_id: id });
      if (!mountedRef.current || viewRef.current !== view || request !== requestRef.current) return;
      setOffer({ view, packs: response.result.packs });
      const availableIds = Object.keys(response.result.packs || {});
      setExecutorId(value => availableIds.includes(value) ? value : availableIds[0] || '');
    } catch (cause) {
      if (mountedRef.current && viewRef.current === view && request === requestRef.current && cause?.name !== 'AbortError') {
        setFailure({ view, message: zh ? '核验方案尚未确认，请恢复云端连接后重新读取。' : 'Inspection options are unconfirmed. Reconnect and reload them.' });
      }
    } finally {
      if (optionsRef.current === token) optionsRef.current = null;
      if (mountedRef.current && viewRef.current === view && request === requestRef.current) setPendingView(null);
    }
  };
  useEffect(() => {
    if (active && canInspect) void loadOptions(targetId);
    else { requestRef.current++; setOffer(null); setPendingView(null); }
    return () => { requestRef.current++; };
  // Offers are fetched for a deliberate selection, not every returned run revision.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, canInspect, lang, active, gameState.run_id, gameState.current_zone]);

  const perform = async command => {
    if (locked || actionRef.current || optionsRef.current?.view === view || viewRef.current !== view) return;
    const token = {};
    const request = ++requestRef.current;
    actionRef.current = token;
    const isCurrent = () => mountedRef.current && viewRef.current === view && actionRef.current === token && request === requestRef.current;
    setPendingView(view); setFailure(null); setFeedback(null);
    try {
      const response = await commandRef.current(command);
      if (!isCurrent()) return;
      setFeedback({ view, result: response.result });
      setOffer(null);
      if (command.type === 'travel') onTargetChange(null);
      return response;
    } catch (cause) {
      if (isCurrent() && cause?.name !== 'AbortError') {
        // Another confirmed action can invalidate a previously displayed offer.
        // Remove it so that a deliberate reload is possible without recharging
        // or silently retrying an action whose outcome may still be unknown.
        setOffer(null);
        setFailure({ view, message: command.type === 'inspect'
          ? (zh ? '行动尚未确认或选项已过期。核对云端状态后重新读取核验方案。' : 'The action is unconfirmed or its offer expired. Check cloud state, then reload the inspection options.')
          : (zh ? '行动尚未确认或选项已过期。核对云端状态后重新选择。' : 'The action is unconfirmed or its offer expired. Check cloud state, then choose again.') });
      }
    } finally {
      const current = isCurrent();
      if (actionRef.current === token) actionRef.current = null;
      if (current) setPendingView(null);
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
      <ol className="td-field-progress" aria-label={zh ? '调查阶段' : 'Investigation stages'}>
        {progressSteps.map((step, index) => <li key={step.id} className={`${step.done ? 'is-done' : ''}${index === activeProgressIndex ? ' is-current' : ''}`} aria-current={index === activeProgressIndex ? 'step' : undefined}>
          <span aria-hidden="true">{step.done ? '✓' : index + 1}</span>{zh ? step.zh : step.en}
        </li>)}
      </ol>
      {directionHint && directionHint !== currentGoal && <p>{directionHint}</p>}
      <button type="button" aria-expanded={hintLevel > 0} onClick={() => setHintLevel(value => (value + 1) % 3)}>{hintLevel === 0
        ? (zh ? '展开核验提示' : 'Show investigation hint')
        : hintLevel === 1 ? (zh ? '查看已确认事实' : 'Show confirmed facts')
          : (zh ? '收起提示' : 'Hide hints')}</button>
      {hintLevel > 0 && <p>{text(investigation.hint?.verification, lang)}</p>}
      {hintLevel > 1 && <div className="td-field-facts-panel"><strong>{zh ? '已确认事实' : 'Confirmed facts'}</strong><InvestigationFacts facts={investigation.hint?.facts} lang={lang} /></div>}
    </header>
    <CaseStoryPanel story={investigation.story} lang={lang}
      knownClues={(caseData.clue_dictionary || []).filter(clue => gameState.unlocked_clues.includes(clue.clue_id))} />
    <div className="td-field-summary"><span>AP {gameState.action_points_left}</span><span>{zh ? '已保全' : 'Secured'} {gameState.unlocked_clues.length}</span><span>{zoneLabel(gameState.current_zone)}</span></div>
    <InvestigationSkillsPanel skills={investigation.skills} lang={lang} />
    {error && <p role="alert" className="td-field-error">{error}</p>}
    <InspectionFeedback feedback={notice} lang={lang} />
    <InvestigationSourceHint hint={notice?.source_hint} lang={lang} />
    {followedContact && <aside className="td-field-followed" aria-label={zh ? '我的追查方向' : 'My chosen lead'}>
      <strong>{zh ? '我的追查方向：' : 'My chosen lead: '}{followedContact.name} · {followedContact.zoneLabel}</strong>
      <p>{followedContact.zoneId === gameState.current_zone
        ? (zh ? '已到达人物所在区域。先查看提问与费用，再决定是否进行核验。' : 'You are in this person’s area. Review questions and costs before deciding whether to verify an account.')
        : goalRoute === null ? text(investigation.zone_access?.[followedContact.zoneId]?.requirement, lang) || (zh ? '先核验可达区域的入口条件。' : 'Check entry requirements in accessible areas first.')
          : (zh ? '按下方高亮通道前往；路上仍可自由搜证。' : 'Follow the highlighted route below; you can still investigate along the way.')}</p>
      <div>{followedContact.zoneId === gameState.current_zone && onTalk && <button type="button" disabled={locked} onClick={talkToFollowedContact}>{zh ? `查看 ${followedContact.name} 的提问` : `View questions for ${followedContact.name}`}</button>}
        <button type="button" disabled={locked || !onFollowNpc} onClick={() => followContact(null)}>{zh ? '取消追查方向' : 'Clear chosen lead'}</button></div>
    </aside>}
    <InvestigationContacts leads={contacts} followedId={followedContact?.id} onFollow={followContact} disabled={locked} lang={lang} />
    <div className="td-field-objects" data-onboarding-target="field-inspect">
      {targets.map(item => <button type="button" key={item.target_id} className={`${targetId === item.target_id ? 'is-selected ' : ''}${goalTarget?.target_id === item.target_id ? 'is-goal' : ''}`} aria-current={goalTarget?.target_id === item.target_id ? 'location' : undefined} disabled={locked} onClick={() => { setShowPuzzle(false); setFeedback(null); onTargetChange(item.target_id); }}>
        <small>{goalTarget?.target_id === item.target_id && (zh ? 'NOVA 当前目标 · ' : 'NOVA CURRENT LEAD · ')}{item.completed ? (zh ? '已核验 · 免费复查' : 'INSPECTED · FREE REVIEW') : findingTargetIds.has(item.target_id) ? (zh ? '已有初步发现 · 关键核验待完成' : 'PRELIMINARY FINDING · KEY VERIFICATION PENDING') : !item.available ? (zh ? '可免费观察 · 核验待解锁' : 'FREE OBSERVATION · VERIFICATION LOCKED') : item.hidden ? (zh ? '可选旁证 · 提升评价' : 'OPTIONAL CORROBORATION') : (zh ? '待核验' : 'AWAITING INSPECTION')}</small><strong>{text(item.label, lang)}</strong>
      </button>)}
    </div>
    {target && !showPuzzle && <article className="td-field-inspection">
      <header><h3>{text(target.label, lang)}</h3><button type="button" disabled={locked} onClick={() => onTargetChange(null)}>{zh ? '收起物件' : 'Close object'}</button></header>
      <Suspense fallback={<p>{zh ? '正在准备物件视图…' : 'Preparing object view…'}</p>}><ObjectViewer kind={target.kind} targetId={target.target_id}
        completed={target.completed} label={text(target.label, lang)} observation={target.observation}
        executorId={executorId} executor={team.find(agent => agent.agent_id === executorId)}
        expertNotes={(investigation.completed_checks || []).filter(check => check.target_id === target.target_id).map(check => check.expert_note).filter(Boolean)} /></Suspense>
      <p>{text(target.observation, lang)}</p>
      {text(target.inquiry, lang) && <div className="td-field-inquiry"><strong>{zh ? '当前疑点' : 'Question to investigate'}</strong><p>{text(target.inquiry, lang)}</p></div>}
      {canInspect ? <InvestigationActionGuidance action="inspection" completed={target.completed} hidden={target.hidden} costRules={investigation.cost_rules} lang={lang}
        preliminaryChecks={investigation.inspection_revision === 1 && Boolean(target.inquiry)} />
        : <p className="td-field-notice">{zh ? '核验条件尚未满足。你仍可免费观察外观；先完成其他可用核验，再回来检查。' : 'Verification prerequisites are not yet met. You can still observe the object for free; complete other available checks and return.'}</p>}
      {canInspect && !target.completed && <p>{zh ? `每个新核验回合全队先恢复 ${AGENT_STAMINA_RECOVERY_PER_TURN}% 体力（上限 100%），再扣除执行者显示的体力费用。免费复查不触发恢复。` : `Each new inspection turn first restores ${AGENT_STAMINA_RECOVERY_PER_TURN}% stamina to the team (up to 100%), then deducts the investigator’s displayed stamina cost. Free review does not trigger recovery.`}</p>}
      {(investigation.completed_checks || []).filter(check => check.target_id === target.target_id).map(check => <div key={check.method_id} className="td-field-finding"><p>{text(check.result, lang)}</p></div>)}
      <InspectionFindings findings={inspectionFindings.filter(finding => finding.target_id === target.target_id)} lang={lang} />
      <div className="td-field-agents" role="group" aria-label={zh ? '选择执行探员' : 'Choose investigating agent'}>{team.map(agent => <button type="button" key={agent.agent_id} disabled={locked} aria-pressed={executorId === agent.agent_id} onClick={() => setExecutorId(agent.agent_id)}>{agent.agent_id} · {zh ? '体力' : 'Stamina'} {Math.round(agent.stamina)}%</button>)}</div>
      {canInspect && !packs && !pending && <button type="button" disabled={locked} onClick={() => void loadOptions(target.target_id)}>{zh ? '读取核验方案 / 免费复查' : 'Load inspection options / free review'}</button>}
      {pending && <p role="status">{zh ? '正在核对云端结果…' : 'Checking cloud result…'}</p>}
      <div className="td-field-methods">{(currentPack?.cards || []).filter(card => !target.completed || card.review).map(card => <button type="button" key={card.option_id} disabled={locked || !card.available || gameState.action_points_left < card.ap_cost}
        onClick={() => void perform({ type: 'inspect', option_id: card.option_id })}>
        <strong>{text(card.label, lang)}</strong>
        {text(card.scope, lang) && <span className="td-field-method-scope">{text(card.scope, lang)}</span>}
        <span>{card.review ? (zh ? '免费复查 · 不耗体力 · 不推进回合' : 'Free review · No stamina cost or turn advance') : `${card.ap_cost} AP · ${zh ? '体力' : 'Stamina'} −${card.stamina_cost}% · ${zh ? '推进一回合' : 'Advances one turn'}`}</span>
        {!card.review && card.inspection_ap_credit_used > 0 && <small className="td-field-method-credit">{zh ? `已付初查费用抵扣 ${card.inspection_ap_credit_used} AP；体力与回合照常消耗。` : `${card.inspection_ap_credit_used} AP credited from a paid preliminary check; stamina and turn costs still apply.`}</small>}
        <small>{zh ? `执行者 ${executorId} · 风险：${card.risk_level === 'high' ? '高' : card.risk_level === 'medium' ? '中' : '低'}` : `${executorId} · Risk: ${card.risk_level}`}</small><small>{card.review ? (zh ? '复查已保存结果' : 'Review saved result') : (zh ? '确认此核验方式' : 'Confirm this inspection method')}</small>
        <InvestigationSkillQuote quote={card} lang={lang} />
      </button>)}</div>
    </article>}
    <div className="td-field-secondary-actions">
      <button type="button" disabled={locked || gameState.action_points_left <= 0} onClick={() => void perform({ type: 'rest' })}>{zh ? '小队整备 · 1 AP / 推进一回合' : 'Recover team · 1 AP / advances one turn'}</button>
      <button type="button" data-onboarding-target="field-puzzle" disabled={locked || !puzzle?.available} onClick={() => { setShowPuzzle(value => !value); onTargetChange(null); setFailure(null); setFeedback(null); }}>{text(puzzle?.label, lang) || (zh ? '专属核验' : 'Case reconstruction')}{puzzle?.completed ? ' ✓' : ''}</button>
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
    {goalRoute?.length > 0 && <p className="td-field-route-hint">{followedContact ? (zh ? '我的追查路线：' : 'Route to my chosen lead: ') : (zh ? '前往当前目标的路线：' : 'Route to the current lead: ')}{[gameState.current_zone, ...goalRoute].map(zoneLabel).join(' → ')}</p>}
    <nav className="td-field-routes" aria-label={zh ? '区域通道' : 'Room routes'}>{Object.entries(investigation.zone_access || {}).filter(([id]) => getConnectedZones(caseData, gameState.current_zone).includes(id)).map(([id, access]) => <button type="button" key={id} className={goalNextZone === id ? 'is-goal' : ''} aria-current={goalNextZone === id ? 'location' : undefined} disabled={locked || !access.available} onClick={() => void perform({ type: 'travel', zone_id: id })}><strong>{goalNextZone === id && `${routeLabel} · `}{zoneLabel(id)}</strong><small>{access.available ? (zh ? '前往 · 不消耗 AP' : 'Travel · no AP cost') : text(access.requirement, lang) || (zh ? '先完成入口核验' : 'Inspect the entry requirement first')}</small></button>)}</nav>
    <div className="td-field-propositions" data-onboarding-target="field-deduction"><h4>{zh ? '已验证的推理命题' : 'Verified deductions'}</h4>{(investigation.propositions || []).length ? investigation.propositions.map(item => <p key={item.id}>{text(item.label, lang)}</p>) : <p>{zh ? '取得证据后，在推理连线中选择支持、矛盾或先后关系。' : 'After securing evidence, choose support, contradiction or sequence in the link board.'}</p>}</div>
  </section>;
}
