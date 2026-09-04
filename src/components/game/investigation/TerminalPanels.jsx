import { useEffect, useMemo, useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { EmotionBadge } from '@/components/game/InterrogationHints';
import AgentStaminaMeter from '@/components/game/AgentStaminaMeter';
import { AGENT_STAMINA_INVESTIGATION_COST, canAgentInvestigate } from '@/game/agentStamina';

export function TerminalLine({ line, accentColor }) {
  const colors = {
    default: '#c0c0d0', phase: accentColor, observe: '#00e5ff', thought: '#bf5fff',
    action: '#00ff88', narration: '#e0e0f0', clue_desc: '#8888aa', success: '#00ff88',
    error: '#ff3860', warning: '#ffaa00', trap: '#ff6600', system: '#8888aa', divider: '#ffffff15',
  };
  return (
    <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: colors[line.type] || colors.default, fontFamily: 'monospace' }}>
      {line.text}
    </div>
  );
}

export function NPCDialogBox({ npc, dialogue, packs, executorId, onExecutorChange, onQuestion, onClose, isProcessing, accentColor, emotion, team = [], error = null }) {
  const { t, lang } = useLang();
  const zh = lang === 'zh';
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dialogue]);

  const activePack = packs?.[executorId];
  const activeAgent = team.find(agent => agent.agent_id === executorId);
  const canQuestion = Boolean(activeAgent) && canAgentInvestigate(activeAgent.stamina, false);

  return (
    <div className="border-t p-3" style={{ borderColor: `${accentColor}30`, backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold flex items-center gap-2" style={{ color: accentColor }}>
          <span>{npc.avatar} {t.interrogating}: {npc.name} · {npc.role}</span>
          <EmotionBadge level={emotion?.level} />
        </div>
        <button type="button" onClick={onClose} className="text-xs opacity-40 hover:opacity-80" style={{ color: accentColor }} aria-label={t.close || 'Close'}>✕</button>
      </div>
      <div ref={ref} className="max-h-32 overflow-y-auto space-y-1 mb-2">
        {dialogue.map((entry, index) => (
          <div key={`${entry.role}-${index}`} className="text-xs" style={{
            color: entry.role === 'agent' ? '#00ff88' : entry.role === 'npc' ? '#ffaa00' : '#8888aa',
            fontStyle: entry.role === 'system' ? 'italic' : 'normal',
          }}>
            {entry.role === 'agent' ? '> AGENT: ' : entry.role === 'npc' ? `${npc.avatar} ${entry.name}: ` : ''}{entry.text}
          </div>
        ))}
      </div>
      <div className="td-interrogation-agent-tabs">
        {team.slice(0, 3).map(agent => {
          const pack = packs?.[agent.agent_id];
          const ready = canAgentInvestigate(agent.stamina, false);
          return <button type="button" key={agent.agent_id} disabled={isProcessing || !pack || !ready}
            className={executorId === agent.agent_id ? 'is-active' : ''}
            onClick={() => onExecutorChange(agent.agent_id)}>
            <strong>{agent.agent_id}</strong>
            <small>{pack ? `${pack.expertise}% · ${pack.confidence === 'high' ? (zh ? '高置信' : 'HIGH') : pack.confidence === 'medium' ? (zh ? '中置信' : 'MED') : (zh ? '低置信' : 'LOW')}` : (zh ? '加载中' : 'LOADING')}</small>
            <AgentStaminaMeter stamina={agent.stamina} language={lang} compact />
          </button>;
        })}
      </div>
      <div className={`td-npc-stamina-note ${canQuestion ? '' : 'is-depleted'}`} role={canQuestion ? 'note' : 'alert'}>
        {canQuestion
          ? (zh ? `本次提问消耗 ${AGENT_STAMINA_INVESTIGATION_COST}% 体力，不触发回合恢复。` : `THIS QUESTION COSTS ${AGENT_STAMINA_INVESTIGATION_COST}% STAMINA WITHOUT TURN RECOVERY.`)
          : (zh ? '该探员体力不足 10%，请更换探员或返回行动界面整备。' : 'THIS AGENT HAS LESS THAN 10% STAMINA. SWITCH AGENTS OR RECOVER FROM THE ACTION SCREEN.')}
      </div>
      {error && <div className="td-interrogation-error">{error}</div>}
      <div className="td-interrogation-questions" data-onboarding-target="interrogation-questions">
        {(activePack?.questions || []).map(question => (
          <button type="button" key={question.questionId} disabled={isProcessing || !canQuestion}
            onClick={() => onQuestion(question)} className={question.repeated ? 'is-repeated' : ''}>
            <header><span>{question.repeated ? '↻' : question.tone === 'evidence' ? '📎' : '◇'} {question.text}</span><strong>{question.estimatedAlignment}%</strong></header>
            <div><i><b style={{ width: `${question.estimatedAlignment}%` }} /></i></div>
            <footer><span>{zh ? '探员预估 · ' : 'AGENT ESTIMATE · '}{question.confidence === 'high' ? (zh ? '高置信' : 'HIGH') : question.confidence === 'medium' ? (zh ? '中置信' : 'MEDIUM') : (zh ? '低置信' : 'LOW')}</span><code>{question.focusAttribute} · STA -{AGENT_STAMINA_INVESTIGATION_COST}%</code></footer>
          </button>
        ))}
        {!activePack && <div className="td-interrogation-loading">{zh ? '正在校验可用问题…' : 'VALIDATING AVAILABLE QUESTIONS…'}</div>}
      </div>
    </div>
  );
}

export function StructuredReportPanel({ options, value, onChange, onSubmit, onCancel, isProcessing, judgeResult, error = null }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
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
  const complete = fields.every(([key]) => value[key]) && (value.evidenceIds?.length || 0) >= 1;
  return (
    <section className="td-structured-report" data-onboarding-target="structured-report">
      <header><div><small>{zh ? '结构化结案报告' : 'STRUCTURED CASE REPORT'}</small><h3>{zh ? '用已经发现的证据重建案件' : 'RECONSTRUCT THE CASE FROM DISCOVERED EVIDENCE'}</h3></div><button type="button" onClick={onCancel} aria-label={zh ? '关闭结案报告' : 'Close case report'} title={zh ? '关闭' : 'Close'}>✕</button></header>
      {error && <div className="td-report-error" role="alert">⚠ {error}</div>}
      {!options ? <div className="td-report-loading">{zh ? '正在读取合法报告选项…' : 'LOADING LEGAL REPORT OPTIONS…'}</div> : <>
        <div className="td-report-fields">
          {fields.map(([key, label, choices]) => <label key={key}><span>{label}</span><select value={value[key] || ''} onChange={event => onChange({ ...value, [key]: event.target.value })} disabled={isProcessing}><option value="">{zh ? '请选择…' : 'SELECT…'}</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>)}
        </div>
        <div className="td-report-evidence"><header><span>{zh ? '支持证据（选择 2–4 条可获得更高评价）' : 'SUPPORTING EVIDENCE (SELECT 2–4 FOR A STRONGER GRADE)'}</span><b>{value.evidenceIds?.length || 0}/4</b></header><div>{(options.availableEvidence || []).map(item => <button type="button" key={item.id} className={value.evidenceIds?.includes(item.id) ? 'is-selected' : ''} onClick={() => toggleEvidence(item.id)} disabled={isProcessing || (!value.evidenceIds?.includes(item.id) && value.evidenceIds?.length >= 4)}>🔎 {item.label}</button>)}</div></div>
        <p>{zh ? '事实贴近度只用于战术选择；最终评价由受保护的案件规则和你提交的证据共同决定。' : 'Alignment guides tactics; the final grade is determined by protected case rules and your submitted evidence.'}</p>
        <footer><button type="button" onClick={onCancel} disabled={isProcessing}>{zh ? '取消' : 'CANCEL'}</button><button type="button" onClick={onSubmit} disabled={isProcessing || !complete}>{isProcessing ? (zh ? '校验中…' : 'VALIDATING…') : (zh ? '提交结案报告' : 'SUBMIT CASE REPORT')}</button></footer>
      </>}
      {judgeResult && <JudgeResult result={judgeResult} />}
    </section>
  );
}

export function JudgeResult({ result }) {
  const { t } = useLang();
  const scoreColors = { S: '#00ff88', A: '#00ffff', B: '#ffaa00', C: '#ff6600', D: '#ff3860' };
  const color = scoreColors[result.score] || '#ffffff';
  return (
    <div className="mt-3 p-3 rounded border" style={{ borderColor: `${color}50`, backgroundColor: `${color}10` }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="text-3xl font-bold" style={{ color, textShadow: `0 0 20px ${color}` }}>{result.score}</div>
        <div className="text-xs" style={{ color }}>{result.is_passed ? t.caseClosedTag : t.reportRejectedTag}</div>
      </div>
      <div className="text-xs" style={{ color: `${color}cc` }}>{result.critique}</div>
    </div>
  );
}
