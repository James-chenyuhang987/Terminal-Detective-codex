import { useEffect, useId, useMemo, useRef, useState } from 'react';
import NPCStatement from '@/components/game/theater/NPCStatement';
import { useLang } from '@/lib/lang.jsx';
import { EmotionBadge } from '@/components/game/InterrogationHints';
import AgentStaminaMeter from '@/components/game/AgentStaminaMeter';
import { AGENT_STAMINA_INVESTIGATION_COST, AGENT_STAMINA_RECOVERY_PER_TURN, canAgentInvestigate } from '@/game/agentStamina';
import { getRejectedReportPenalty } from '@/game/caseEvaluation';
import Icon, { IconText } from '@/components/ui/Icon';
import { noirColor } from '@/components/ui/palette';
import { REPORT_DIMENSIONS, reportEvidenceIds } from '@/game/investigationChoices.js';
import EvidenceReference from './EvidenceReference';
import InterviewHistory from './InterviewHistory.jsx';
import EvidenceReportReview, { EvidenceRoleDisclosure } from './EvidenceReportExplanation.jsx';

export function TerminalLine({ line, accentColor }) {
  const colors = {
    default: '#c0c0d0', phase: accentColor, observe: '#709f9a', thought: '#9b9aae',
    action: '#8aaa91', narration: '#e0e0f0', clue_desc: '#9b9aae', success: '#8aaa91',
    error: '#c77c78', warning: '#c19a63', trap: '#c19a63', system: '#9b9aae', divider: '#ffffff15',
  };
  return (
    <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: noirColor(colors[line.type] || colors.default), fontFamily: 'monospace' }}>
      <IconText text={line.text} />
    </div>
  );
}

export function NPCDialogBox({ npc, dialogue, packs, executorId, onExecutorChange, onQuestion, onClose, isProcessing, accentColor: legacyAccentColor, emotion, team = [], error = null, storyMotion = false, presentationActive = true, investigationVersion = 1, actionPoints = 0, investigation = null, knownClues = [] }) {
  const { t, lang } = useLang();
  const accentColor = noirColor(legacyAccentColor);
  const zh = lang === 'zh';
  const strategies = investigationVersion === 2 && investigation?.interview_revision === 1;
  const questionEffectId = useId();
  const ref = useRef(null);
  const initialDialogueLength = useRef(dialogue.length);
  const [revealedThrough, setRevealedThrough] = useState({ npcId: '', index: -1 });
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dialogue]);

  const activePack = packs?.[executorId];
  const activeAgent = team.find(agent => agent.agent_id === executorId);
  // Manual investigations use the authority's per-question quote, including skill discounts.
  const canQuestion = Boolean(activeAgent) && (investigationVersion === 2
    ? activePack?.questions?.some(question => question.available && actionPoints >= question.ap_cost)
    : canAgentInvestigate(activeAgent.stamina));

  return (
    <div className={`border-t p-3${storyMotion ? ' td-npc-story' : ''}${investigationVersion === 2 ? ' td-npc-v2' : ''}`} style={{ borderColor: `${accentColor}30`, backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold flex items-center gap-2" style={{ color: accentColor }}>
          <span><Icon name={npc.avatar} /> <IconText text={t.interrogating} />: {npc.name} · {npc.role}</span>
          <EmotionBadge level={emotion?.level} />
        </div>
        <button type="button" onClick={onClose} className="text-xs opacity-40 hover:opacity-80" style={{ color: accentColor }} aria-label={t.close || 'Close'}><Icon name="close" size={16} /></button>
      </div>
      <div ref={ref} className="max-h-32 overflow-y-auto space-y-1 mb-2">
        {dialogue.map((entry, index) => (
          <div key={`${npc.npc_id}-${entry.role}-${index}`} className="text-xs" style={{
            color: entry.role === 'agent' ? '#8aaa91' : entry.role === 'npc' ? '#c19a63' : '#9b9aae',
            fontStyle: entry.role === 'system' ? 'italic' : 'normal',
          }}>
            {entry.role === 'agent' ? '> AGENT: ' : entry.role === 'npc' ? <><Icon name={npc.avatar} /> {entry.name}: </> : ''}
            {storyMotion && entry.role !== 'agent'
              ? <NPCStatement text={entry.text} lang={lang} animate={entry.role === 'npc' && index >= initialDialogueLength.current} active={presentationActive}
                showAll={revealedThrough.npcId === npc.npc_id && index <= revealedThrough.index} />
              : entry.role === 'agent' ? entry.text : <IconText text={entry.text} />}
          </div>
        ))}
      </div>
      {storyMotion && <button type="button" className="td-npc-reveal"
        onClick={() => setRevealedThrough({ npcId: npc.npc_id, index: dialogue.length - 1 })}>
        {zh ? '显示全文' : 'Show all'}
      </button>}
      {strategies && <InterviewHistory records={investigation.interview_records?.[npc.npc_id]}
        testimonies={investigation.testimony_records?.[npc.npc_id]} stage={investigation.testimony_stages?.[npc.npc_id] || 0}
        lang={lang} clueLabels={Object.fromEntries(knownClues.map(clue => [clue.clue_id, clue.keyword]))} />}
      <div className="td-interrogation-agent-tabs">
        {team.slice(0, 3).map(agent => {
          const pack = packs?.[agent.agent_id];
          const ready = investigationVersion === 2
            ? pack?.questions?.some(question => question.available && actionPoints >= question.ap_cost)
            : canAgentInvestigate(agent.stamina);
          return <button type="button" key={agent.agent_id} disabled={isProcessing || !pack || !ready}
            className={executorId === agent.agent_id ? 'is-active' : ''}
            aria-pressed={executorId === agent.agent_id}
            onClick={() => onExecutorChange(agent.agent_id)}>
            <strong>{agent.agent_id}</strong>
            <small>{pack ? investigationVersion === 2 ? (zh ? '核对证据 · 选择策略' : 'CHECK EVIDENCE · CHOOSE STRATEGY') : `${pack.expertise}% · ${pack.confidence === 'high' ? (zh ? '高置信' : 'HIGH') : pack.confidence === 'medium' ? (zh ? '中置信' : 'MED') : (zh ? '低置信' : 'LOW')}` : (zh ? '加载中' : 'LOADING')}</small>
            <AgentStaminaMeter stamina={agent.stamina} language={lang} compact />
          </button>;
        })}
      </div>
      <div className={`td-npc-stamina-note ${canQuestion ? '' : 'is-depleted'}`} role={canQuestion ? 'note' : 'alert'}>
        {strategies ? (zh ? '了解背景免费，不推进回合或恢复体力。明确追问固定一段说法，所付 1 AP 抵扣同阶段证据对峙；体力、回合与混乱按选项报价。对峙由系统匹配已发现的证据，保存原话与补充；复查不重复收费。'
          : 'Background is free and neither advances time nor restores stamina. A direct question records an account; its 1 AP covers the confrontation at that stage. Stamina, turns and confusion follow each quote. The system matches acquired evidence and preserves the account and follow-up; reviews are free.')
          : investigationVersion === 2 ? (zh ? `温和询问和明确追问可获得解释，但不保证推进关键证词；匹配证据可稳定推进证词。新提问基础费用为 1 AP，以选项报价为准；紧急节流可抵扣费用，仍推进一回合。每回合全队先恢复 ${AGENT_STAMINA_RECOVERY_PER_TURN}% 体力（上限 100%），执行者再按报价扣除体力（基础 ${AGENT_STAMINA_INVESTIGATION_COST}%，专长可减免）。已完成证词免费复查，不消耗或恢复体力。` : `Gentle and direct questions provide explanations but do not guarantee progress on key testimony; matching evidence reliably advances testimony. New questions have a base cost of 1 AP; use the quoted price, which Emergency Throttle can reduce, and still advance a turn; the team first recovers ${AGENT_STAMINA_RECOVERY_PER_TURN}% stamina (up to 100%), then the investigator pays the quoted stamina cost (base ${AGENT_STAMINA_INVESTIGATION_COST}%, reduced by applicable skills). Completed testimony is free to review, without stamina cost or recovery.`) : canQuestion
          ? (zh ? `本次提问消耗 ${AGENT_STAMINA_INVESTIGATION_COST}% 体力，不触发回合恢复。` : `THIS QUESTION COSTS ${AGENT_STAMINA_INVESTIGATION_COST}% STAMINA WITHOUT TURN RECOVERY.`)
          : (zh ? '该探员体力不足 10%，请更换探员或返回行动界面整备。' : 'THIS AGENT HAS LESS THAN 10% STAMINA. SWITCH AGENTS OR RECOVER FROM THE ACTION SCREEN.')}
      </div>
      {error && <div className="td-interrogation-error">{error}</div>}
      <div className="td-interrogation-questions" data-onboarding-target="interrogation-questions">
        {(activePack?.questions || []).map((question, index) => (
          <button type="button" key={question.questionId} disabled={isProcessing || (investigationVersion === 2 ? !activeAgent || !question.available || actionPoints < question.ap_cost : !canQuestion)}
            onClick={() => onQuestion(question)} className={question.repeated ? 'is-repeated' : ''}
            aria-describedby={strategies && question.effect ? `${questionEffectId}-${index}` : undefined}
            aria-label={`${question.text} · ${investigationVersion === 2 ? `${question.ap_cost} AP · ` : ''}${zh ? '体力' : 'Stamina'} −${investigationVersion === 2 ? question.stamina_cost : AGENT_STAMINA_INVESTIGATION_COST}%`}>
            <header><span><Icon name={question.repeated ? 'refresh' : question.tone === 'evidence' ? 'paperclip' : 'chat'} /> <IconText text={question.text} /></span>{investigationVersion === 1 && <strong>{question.estimatedAlignment}%</strong>}</header>
            {investigationVersion === 1 && <div><i><b style={{ width: `${question.estimatedAlignment}%` }} /></i></div>}
            {strategies && question.effect && <small id={`${questionEffectId}-${index}`} className="td-interview-option-effect">{question.effect}
              {question.turn_cost > 0 && (zh ? ` 推进 ${question.turn_cost} 回合。` : ` Advances ${question.turn_cost} turn.`)}
              {question.confusion_cost > 0 && (zh ? ` 混乱 +${question.confusion_cost}。` : ` Confusion +${question.confusion_cost}.`)}
            </small>}
            {investigationVersion === 2 && question.skill_stamina_discount > 0 && <small>{zh
              ? `专长减免 ${question.skill_stamina_discount}% 体力，已计入报价。`
              : `Skill saves ${question.skill_stamina_discount}% stamina, already included in the quote.`}</small>}
            <footer><span>{investigationVersion === 2 ? (zh ? '对照已发现证据选择询问策略' : 'Choose a strategy using discovered evidence') : <>{zh ? '探员预估 · ' : 'AGENT ESTIMATE · '}{question.confidence === 'high' ? (zh ? '高置信' : 'HIGH') : question.confidence === 'medium' ? (zh ? '中置信' : 'MEDIUM') : (zh ? '低置信' : 'LOW')}</>}</span><code>{investigationVersion === 2 ? `${question.ap_cost} AP · STA -${question.stamina_cost}%` : `${question.focusAttribute} · STA -${AGENT_STAMINA_INVESTIGATION_COST}%`}</code></footer>
          </button>
        ))}
        {!activePack && <div className="td-interrogation-loading">{zh ? '正在校验可用问题…' : 'VALIDATING AVAILABLE QUESTIONS…'}</div>}
      </div>
    </div>
  );
}

export function StructuredReportPanel({ options, value, onChange, onSubmit, onCancel, isProcessing, judgeResult, error = null, investigationVersion = 1, actionPoints = 0,
  knownClues = [], evidenceSources = {}, expertNotes = {}, draftStatus }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const rejectionPenalty = getRejectedReportPenalty({ action_points_left: actionPoints });
  const reportPolicy = investigationVersion === 2 && options?.report_policy?.balance_revision === 2 ? options.report_policy : null;
  const evidencePenalty = reportPolicy?.evidence_rejection_penalty || rejectionPenalty;
  const subsequentEvidencePenalty = reportPolicy?.evidence_rejection_penalty_after_correction
    || (reportPolicy?.evidence_correction_available ? null : evidencePenalty);
  const conclusionPenalty = reportPolicy?.conclusion_rejection_penalty || rejectionPenalty;
  const penaltyText = penalty => zh
    ? `${penalty.apLoss} AP、信誉 −${penalty.reputationLoss}、混乱 +${penalty.confusionIncrease}%`
    : `${penalty.apLoss} AP, reputation −${penalty.reputationLoss}, confusion +${penalty.confusionIncrease}%`;
  const correctionCostText = subsequentEvidencePenalty ? (zh
    ? `额度用完后，仅附件不足的驳回代价：${penaltyText(subsequentEvidencePenalty)}。`
    : `After this allowance is used, an attachment-only rejection costs ${penaltyText(subsequentEvidencePenalty)}. `) : (zh
      ? '额度用完后，附件不足的代价会在再次提交前显示。'
      : 'After the allowance is used, the attachment-only cost will be shown before another submission. ');
  const evidenceEditorId = useId();
  const [expandedDimension, setExpandedDimension] = useState(() =>
    REPORT_DIMENSIONS.find(key => !value.evidenceByDimension?.[key]?.length) || null);
  const [evidenceQuery, setEvidenceQuery] = useState('');
  const evidenceById = new Map(knownClues.map(clue => [clue.clue_id, clue]));
  const evidenceRoles = investigationVersion === 2 && Array.isArray(options?.evidence_roles)
    ? new Map(options.evidence_roles.map(entry => [entry.clue_id, entry])) : null;
  const normalizedQuery = evidenceQuery.normalize('NFKC').trim().toLocaleLowerCase();
  const visibleEvidence = (options?.availableEvidence || []).filter(item =>
    [item.label, evidenceById.get(item.id)?.description, evidenceSources[item.id], expertNotes[item.id]]
      .filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase().includes(normalizedQuery));
  const fields = useMemo(() => [
    ['conclusionId', zh ? '核心结论' : 'CORE CONCLUSION', options?.conclusions || []],
    ['methodId', zh ? '作案方式 / 事件性质' : 'METHOD / EVENT NATURE', options?.methods || []],
    ['motiveId', zh ? '动机' : 'MOTIVE', options?.motives || []],
    ['timelineId', zh ? '关键时间线' : 'KEY TIMELINE', options?.timelines || []],
  ], [options, zh]);
  const toggleEvidence = (id) => {
    const current = value.evidenceIds || [];
    if (current.includes(id)) onChange({ ...value, evidenceIds: current.filter(item => item !== id) });
    else if (current.length < 4) onChange({ ...value, evidenceIds: [...current, id] });
  };
  const toggleDimension = (dimension, id) => {
    const current = value.evidenceByDimension?.[dimension] || [];
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    const evidenceByDimension = { ...value.evidenceByDimension, [dimension]: next };
    onChange({ ...value, evidenceByDimension, evidenceIds: reportEvidenceIds(evidenceByDimension) });
  };
  const dimensionLabels = zh ? { opportunity: '机会', method: '手段', motive: '动机', timeline: '时间线' }
    : { opportunity: 'Opportunity', method: 'Method', motive: 'Motive', timeline: 'Timeline' };
  const complete = fields.every(([key]) => value[key]) && (investigationVersion === 2
    ? REPORT_DIMENSIONS.every(key => value.evidenceByDimension?.[key]?.length) : (value.evidenceIds?.length || 0) >= 1);
  return (
    <section className={`td-structured-report${investigationVersion === 2 ? ' td-structured-report-v2' : ''}`} data-onboarding-target="structured-report">
      <header><div><small>{zh ? '结构化结案报告' : 'STRUCTURED CASE REPORT'}</small><h3>{zh ? '用已经发现的证据重建案件' : 'RECONSTRUCT THE CASE FROM DISCOVERED EVIDENCE'}</h3></div><button type="button" onClick={onCancel} aria-label={zh ? '关闭结案报告' : 'Close case report'} title={zh ? '关闭' : 'Close'}><Icon name="close" size={18} /></button></header>
      {error && <div className="td-report-error" role="alert"><Icon name="warning" /> {error}</div>}
      {draftStatus && <p className="td-report-draft-note" role="status">{draftStatus === 'memory'
        ? (zh ? '草稿暂存在当前页面，浏览器未允许保存；刷新后可能丢失。尚未提交。' : 'Draft kept on this page; browser storage is unavailable, so a refresh may lose it. Not submitted.')
        : (zh ? '草稿按调查自动保存在本机浏览器，关闭后可恢复，不跨设备同步。尚未提交，不代表结论已经核实。' : 'Draft autosaves for this investigation in this browser and survives closing. It does not sync between devices. Not submitted; conclusions are not yet verified.')}</p>}
      {!options ? <div className="td-report-loading">{zh ? '正在读取合法报告选项…' : 'LOADING LEGAL REPORT OPTIONS…'}</div> : <>
        {investigationVersion === 2 && <p role="note">{reportPolicy ? (zh
          ? `通过：不消耗 AP。免费补正剩余 ${reportPolicy.evidence_correction_available ? 1 : 0} 次：四项结论均正确、仅附件不足时，本案首次可免费修正，不扣 AP、信誉或混乱。${correctionCostText}结论错误的驳回代价：${penaltyText(conclusionPenalty)}。首次错误指控还可能额外损失 4 信誉或增加 3% 混乱。驳回后仍可修正报告。`
          : `Accepted: no AP cost. Free correction remaining: ${reportPolicy.evidence_correction_available ? 1 : 0}. When all four conclusions are correct and only attachments are insufficient, the first such revision in this case is free, with no AP, reputation or confusion penalty. ${correctionCostText}Incorrect conclusions cost ${penaltyText(conclusionPenalty)}. First unsupported accusations can additionally cost 4 reputation or add 3% confusion. Rejected reports remain revisable.`) : (zh
            ? `通过：不消耗 AP。驳回：${penaltyText(rejectionPenalty)}。首次错误指控还可能额外损失 4 信誉或增加 3% 混乱。驳回后仍可修正报告。`
            : `Accepted: no AP cost. Rejected: ${penaltyText(rejectionPenalty)}. First unsupported accusations can additionally cost 4 reputation or add 3% confusion. Rejected reports remain revisable.`)}</p>}
        <div className="td-report-fields">
          {fields.map(([key, label, choices]) => <label key={key}><span>{label}</span><select aria-label={label} value={value[key] || ''} onChange={event => onChange({ ...value, [key]: event.target.value })} disabled={isProcessing}><option value="">{zh ? '请选择…' : 'SELECT…'}</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>)}
        </div>
        {investigationVersion === 2 && <label className="td-report-evidence-search">{zh ? '查找已发现证据' : 'Find discovered evidence'}<input type="search" value={evidenceQuery} onChange={event => setEvidenceQuery(event.target.value)} placeholder={zh ? '搜索名称、原文或来源' : 'Search names, records or sources'} /></label>}
        {evidenceRoles?.size > 0 && <p className="td-report-role-note">{zh ? '展开“材料作用”可核对已发现材料在本组的用途；具体用途不等于证据链已完整，结论仍由系统在提交时校验。' : 'Expand “Material role” to review how a discovered record relates to this group. A role does not mean the support chain is complete; the system checks the conclusions on submission.'}</p>}
        {investigationVersion === 2 ? <div className="td-dimension-evidence">{REPORT_DIMENSIONS.map(key => {
          const selected = value.evidenceByDimension?.[key] || [];
          const selectedNames = (options.availableEvidence || []).filter(item => selected.includes(item.id)).map(item => item.label);
          const expanded = expandedDimension === key;
          const editorId = `${evidenceEditorId}-${key}`;
          return <fieldset key={key}>
            <legend>{dimensionLabels[key]}</legend>
            {options.dimension_guidance?.[key] && <p className="td-evidence-guidance">{options.dimension_guidance[key]}</p>}
            <p className="td-evidence-selection"><strong>{zh ? `已选 ${selected.length} 条` : `Selected: ${selected.length}`}</strong><span>{selectedNames.length ? selectedNames.join(zh ? '、' : '; ') : (zh ? '尚未附上证据' : 'No evidence attached')}</span></p>
            {evidenceRoles && <div className="td-report-attached-roles">{(options.availableEvidence || []).filter(item => selected.includes(item.id)).map(item => <EvidenceRoleDisclosure key={item.id} entry={evidenceRoles.get(item.id)} dimension={key} label={item.label} lang={lang} />)}</div>}
            <button type="button" className="td-evidence-edit-toggle" aria-expanded={expanded} aria-controls={editorId} disabled={isProcessing} onClick={() => setExpandedDimension(current => current === key ? null : key)}>{expanded ? (zh ? '收起选择' : 'Collapse choices') : (zh ? '编辑证据' : 'Edit evidence')} · {dimensionLabels[key]}</button>
            <div id={editorId} className="td-evidence-options" hidden={!expanded}>{visibleEvidence.map(item => <div key={item.id} className="td-report-evidence-record"><button type="button" aria-pressed={selected.includes(item.id)} aria-label={`${selected.includes(item.id) ? (zh ? '移除' : 'Remove') : (zh ? '附上' : 'Attach')} · ${dimensionLabels[key]} · ${item.label}`} className={selected.includes(item.id) ? 'is-selected' : ''} onClick={() => toggleDimension(key, item.id)} disabled={isProcessing}><Icon name="search" /> {item.label}</button><EvidenceReference clue={evidenceById.get(item.id)} sourceLabel={evidenceSources[item.id]} expertNote={expertNotes[item.id]} />{evidenceRoles && !selected.includes(item.id) && <EvidenceRoleDisclosure entry={evidenceRoles.get(item.id)} dimension={key} label={item.label} lang={lang} />}</div>)}{visibleEvidence.length === 0 && <p>{zh ? '没有匹配记录，可换一个词或清空搜索。' : 'No matching records. Try another term or clear the search.'}</p>}</div>
          </fieldset>;
        })}</div> : <div className="td-report-evidence"><header><span>{zh ? '支持证据（选择 2–4 条可获得更高评价）' : 'SUPPORTING EVIDENCE (SELECT 2–4 FOR A STRONGER GRADE)'}</span><b>{value.evidenceIds?.length || 0}/4</b></header><div>{(options.availableEvidence || []).map(item => <button type="button" key={item.id} className={value.evidenceIds?.includes(item.id) ? 'is-selected' : ''} onClick={() => toggleEvidence(item.id)} disabled={isProcessing || (!value.evidenceIds?.includes(item.id) && value.evidenceIds?.length >= 4)}><Icon name="search" /> {item.label}</button>)}</div></div>}
        <p>{investigationVersion === 2 ? (zh ? '四项结论和各环节证据成立可结案；完成专属核验、排除两种替代解释和取得独立旁证依次提升评价。证据不足可补充后再提交。' : 'Support all four conclusions to close the case. Reconstruction, excluding two alternatives and independent corroboration improve the grade. An incomplete report can be revised.') : (zh ? '事实贴近度只用于战术选择；最终评价由受保护的案件规则和你提交的证据共同决定。' : 'Alignment guides tactics; the final grade is determined by protected case rules and your submitted evidence.')}</p>
        <footer><button type="button" onClick={onCancel} disabled={isProcessing}>{zh ? '取消' : 'CANCEL'}</button><button type="button" onClick={onSubmit} disabled={isProcessing || !complete}>{isProcessing ? (zh ? '校验中…' : 'VALIDATING…') : (zh ? '提交结案报告' : 'SUBMIT CASE REPORT')}</button></footer>
      </>}
      {judgeResult && <JudgeResult result={judgeResult} />}
      {investigationVersion === 2 && <EvidenceReportReview review={judgeResult?.evidence_review}
        knownClues={knownClues} lang={lang} isPassed={judgeResult?.is_passed === true}
        sources={evidenceSources} expertNotes={expertNotes} />}
    </section>
  );
}

export function JudgeResult({ result }) {
  const { t } = useLang();
  const scoreColors = { S: '#8aaa91', A: '#709f9a', B: '#c19a63', C: '#c19a63', D: '#c77c78' };
  const color = noirColor(scoreColors[result.score] || '#ffffff');
  return (
    <div className="mt-3 p-3 rounded border" style={{ borderColor: `${color}50`, backgroundColor: `${color}10` }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="text-3xl font-bold" style={{ color }}>{result.score}</div>
        <div className="text-xs" style={{ color }}><IconText text={result.is_passed ? t.caseClosedTag : t.reportRejectedTag} /></div>
      </div>
      <div className="text-xs" style={{ color: `${color}cc` }}>{result.critique}</div>
      {result.wrong_outcome && <p className="text-xs mt-2">{result.wrong_outcome}</p>}
    </div>
  );
}
