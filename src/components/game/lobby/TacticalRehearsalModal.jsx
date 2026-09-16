import React, { useMemo, useRef, useState } from 'react';
import { noirColor } from '@/components/ui/palette';
import Icon, { IconText } from '@/components/ui/Icon';
import { useLang } from '@/lib/lang.jsx';
import { decisionForecast } from '@/game/commandSystem';
import {
  REHEARSAL_EVENTS,
  evaluateRehearsalChoice,
  getRehearsalEvent,
  summarizeRehearsal,
} from '@/game/tacticalRehearsal';
import { useModalFocusTrap } from './useModalFocusTrap';

const FOCUS_LABELS = {
  logic_power: ['逻辑推演', 'LOGIC'],
  observation_focus: ['现场观察', 'OBSERVATION'],
  hack_level: ['黑客渗透', 'HACKING'],
  confusion_resistance: ['抗干扰', 'ANTI-CHAOS'],
};

function EventHeader({ event, index, lang }) {
  const zh = lang === 'zh';
  return <header className="td-rehearsal-event-header">
    <div><small>{zh ? `模拟事件 ${index + 1} / ${REHEARSAL_EVENTS.length}` : `SIM EVENT ${index + 1} / ${REHEARSAL_EVENTS.length}`}</small><strong>{zh ? event.title : event.titleEn}</strong></div>
    <span>{zh ? '不消耗体力' : 'NO ENERGY COST'}</span>
  </header>;
}

function FeedbackList({ feedback, lang }) {
  const zh = lang === 'zh';
  const renderItem = item => <li key={item.key}>
    <span style={{ color: item.kind === 'strength' ? '#8aaa91' : '#dda29a' }}>{item.kind === 'strength' ? '↑' : '↓'}</span>
    <div><strong>{zh ? item.label : item.labelEn}</strong><small>{item.percent}% · {zh ? item.owner : item.ownerEn}</small></div>
  </li>;
  return <section className="td-rehearsal-feedback" aria-label={zh ? '案件优势与风险' : 'Case strengths and risks'}>
    <div><small>{zh ? '当前案件 · 优势' : 'CASE READ · STRENGTHS'}</small><ul>{feedback.strengths.map(renderItem)}</ul></div>
    <div><small>{zh ? '当前案件 · 风险' : 'CASE READ · RISKS'}</small><ul>{feedback.risks.map(renderItem)}</ul></div>
  </section>;
}

function ChoiceResult({ event, result, agent, lang, onNext, onRetry }) {
  const zh = lang === 'zh';
  const clean = result.outcome === 'clean';
  const exposed = result.outcome === 'exposed';
  const forecast = decisionForecast(event.actionTag, event.riskLevel);
  return <div className={`td-rehearsal-result is-${result.outcome}`} aria-live="polite">
    <div className="td-rehearsal-result-heading"><span>{clean ? '✓' : exposed ? '!' : '◇'}</span><div><small>{zh ? '战术反馈' : 'TACTICAL FEEDBACK'}</small><strong>{agent?.agent_id}</strong></div><em>{zh ? (clean ? '处理顺畅' : exposed ? '准备不足' : '有代价的推进') : (clean ? 'CLEAN READ' : exposed ? 'EXPOSED' : 'TRADEOFF')}</em></div>
    <p>{zh
      ? (clean ? `${agent.agent_id} 的${FOCUS_LABELS[event.focus]?.[0] || '专项能力'}压住了事件波动，预计混乱增长降低 ${result.mitigation} 点。` : exposed ? `${agent.agent_id} 可以继续推进，但${FOCUS_LABELS[event.focus]?.[0] || '关键能力'}不足，事件会留下更高的混乱风险。` : `${agent.agent_id} 找到了突破口，但需要承受一部分混乱；换一名探员可能得到不同取舍。`)
      : (clean ? `${agent.agent_id}'s ${FOCUS_LABELS[event.focus]?.[1] || 'specialty'} keeps the event stable. Confusion growth is reduced by ${result.mitigation}.` : exposed ? `${agent.agent_id} can proceed, but the ${FOCUS_LABELS[event.focus]?.[1] || 'key skill'} gap leaves more confusion exposed.` : `${agent.agent_id} finds a way forward, with a cost. Another operative may produce a different trade-off.`)}</p>
    <div className="td-rehearsal-metrics"><span>{zh ? '专长把握' : 'EXPERTISE'} <b>{result.expertise}%</b></span><span>{zh ? '预计混乱' : 'CONFUSION'} <b>{result.confusion[0]}-{result.confusion[1]}</b></span><span>{zh ? '陷阱概率' : 'TRAP'} <b>{forecast.trap}%</b></span></div>
    <div className="td-rehearsal-result-actions"><button type="button" onClick={onRetry}>{zh ? '换人试试' : 'TRY ANOTHER'}</button><button type="button" onClick={onNext}>{zh ? '继续试演' : 'NEXT EVENT'}</button></div>
  </div>;
}

export default function TacticalRehearsalModal({ agents, agentDefs = [], feedback, synergyCount = 0, onClose, restoreRef }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const dialogRef = useRef(null);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  useModalFocusTrap(true, dialogRef, onClose, restoreRef);

  const event = getRehearsalEvent(step);
  const currentResult = results[step] || null;
  const selectedAgent = useMemo(() => agents.find(agent => agent.agent_id === selectedId) || null, [agents, selectedId]);
  const summary = summarizeRehearsal(results);
  const chooseAgent = agent => {
    setSelectedId(agent.agent_id);
    const result = evaluateRehearsalChoice(event, agent);
    setResults(current => [...current.slice(0, step), result]);
  };
  const next = () => {
    setStep(current => current + 1);
    setSelectedId(null);
  };
  const retry = () => {
    setResults(current => current.slice(0, step));
    setSelectedId(null);
  };
  const reset = () => {
    setStep(0);
    setResults([]);
    setSelectedId(null);
  };

  return <div className="td-rehearsal-layer" onClick={onClose}>
    <section ref={dialogRef} className="td-rehearsal-modal td-scroll-region" role="dialog" aria-modal="true" aria-label={zh ? '战术台试演' : 'Tactical desk rehearsal'} tabIndex={-1} onClick={eventClick => eventClick.stopPropagation()}>
      <header className="td-rehearsal-titlebar"><div><small>◇ TACTICAL DESK</small><h2>{zh ? '战术试演' : 'TACTICAL REHEARSAL'}</h2><p>{zh ? '只验证思路，不改变案件、不消耗体力。' : 'Test the approach without changing the case or spending energy.'}</p></div><button type="button" onClick={onClose} aria-label={zh ? '关闭战术台' : 'Close tactical desk'}>×</button></header>
      <FeedbackList feedback={feedback} lang={lang} />
      {step < REHEARSAL_EVENTS.length ? <>
        <EventHeader event={event} index={step} lang={lang} />
        <p className="td-rehearsal-prompt">{zh ? event.prompt : event.promptEn}</p>
        {!currentResult ? <div className="td-rehearsal-agents" role="group" aria-label={zh ? '选择处理探员' : 'Choose an operative'}>{agents.map((agent, index) => {
          const def = agentDefs[index];
          const color = noirColor(def?.color || ['#709f9a', '#c5a66f', '#9b9aae'][index]);
          return <button type="button" key={agent.agent_id} className="td-rehearsal-agent" onClick={() => chooseAgent(agent)} style={/** @type {React.CSSProperties & {'--rehearsal-color': string}} */ ({ '--rehearsal-color': color })}><span><Icon name={def?.icon || '🕵️'} /></span><strong>{agent.agent_id}</strong><small>{zh ? (def?.roleZh || agent.role) : (def?.role || agent.role)}</small><em>{zh ? '选择先手' : 'SELECT FIRST'}</em></button>;
        })}</div> : <ChoiceResult event={event} result={currentResult} agent={selectedAgent || agents.find(agent => agent.agent_id === currentResult.agentId)} lang={lang} onRetry={retry} onNext={next} />}
      </> : <div className="td-rehearsal-summary" aria-live="polite"><div className="td-rehearsal-summary-icon">✓</div><small>{zh ? '试演完成 · 结果不会带入正式案件' : 'REHEARSAL COMPLETE · NO RESULTS CARRY OVER'}</small><strong>{summary.averageExpertise}% <span>{zh ? '平均专长把握' : 'AVERAGE EXPERTISE'}</span></strong><p>{zh ? `你看到了 ${summary.clean} 次顺畅处理、${summary.tradeoffs} 次有代价推进和 ${summary.exposed} 次风险暴露。换人或调整优先级，再试一次就能比较不同路线。` : `${summary.clean} clean reads, ${summary.tradeoffs} trade-offs and ${summary.exposed} exposed risks. Change the team or priorities and run it again to compare routes.`}</p><button type="button" onClick={reset}>{zh ? '重新试演' : 'REHEARSE AGAIN'}</button></div>}
      <footer className="td-rehearsal-footer"><span><IconText text={synergyCount ? `✦ ${synergyCount} ${zh ? '项协同在线' : 'SYNERGIES ONLINE'}` : (zh ? '协同待激活' : 'SYNERGY STANDBY')} /></span><small>{zh ? '模拟结果仅供准备参考，不代表必胜。' : 'A rehearsal is guidance, not a guaranteed outcome.'}</small></footer>
    </section>
  </div>;
}
