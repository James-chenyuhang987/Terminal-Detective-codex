import React, { useRef, useState } from 'react';
import { noirColor } from '@/components/ui/palette';
import Icon, { IconText } from '@/components/ui/Icon';
import { useLang } from '@/lib/lang.jsx';
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

function formatAgentId(value) {
  if (typeof value === 'string' && value) return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function getAgentId(agent) {
  try {
    return formatAgentId(agent?.agent_id);
  } catch {
    return '';
  }
}

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
    <div><small>{zh ? '当前案件 · 优势' : 'CASE READ · STRENGTHS'}</small><ul>{feedback.strengths.length ? feedback.strengths.map(renderItem) : <li className="td-rehearsal-empty">{zh ? '暂无明显优势' : 'NO CLEAR ADVANTAGE'}</li>}</ul></div>
    <div><small>{zh ? '当前案件 · 风险' : 'CASE READ · RISKS'}</small><ul>{feedback.risks.length ? feedback.risks.map(renderItem) : <li className="td-rehearsal-empty">{zh ? '暂无暴露风险' : 'NO EXPOSED RISK'}</li>}</ul></div>
  </section>;
}

function AgentChoices({ agents, agentDefs, lang, onChoose }) {
  const zh = lang === 'zh';
  const definitions = Array.isArray(agentDefs) ? agentDefs : [];
  const choices = (Array.isArray(agents) ? agents : []).flatMap((agent, index) => {
    const agentId = getAgentId(agent);
    if (!agentId || !agent || typeof agent !== 'object' || Array.isArray(agent)) return [];
    return [{ agent, agentId, index, def: definitions.find(def => def?.id === agentId) }];
  });
  if (!choices.length) return <p className="td-rehearsal-empty" role="status">{zh ? '暂无可用探员，请返回编队后再试。' : 'No operatives available. Return to squad setup and try again.'}</p>;

  return <div className="td-rehearsal-agents" role="group" aria-label={zh ? '选择处理探员' : 'Choose an operative'}>{choices.map(({ agent, agentId, index, def }) => {
    const color = noirColor(typeof def?.color === 'string' ? def.color : ['#709f9a', '#c5a66f', '#9b9aae'][index % 3]);
    const icon = typeof def?.icon === 'string' ? def.icon : '🕵️';
    const configuredRole = zh ? def?.roleZh : def?.role;
    const role = typeof configuredRole === 'string' ? configuredRole
      : typeof agent.role === 'string' ? agent.role : (zh ? '待命探员' : 'STANDBY OPERATIVE');
    return <button type="button" key={`agent-${index}-${agentId}`} className="td-rehearsal-agent" onClick={() => onChoose(agent)} style={/** @type {React.CSSProperties & {'--rehearsal-color': string}} */ ({ '--rehearsal-color': color })}>
      <span><Icon name={icon} /></span><strong>{agentId}</strong><small>{role}</small><em>{zh ? '选择先手' : 'SELECT FIRST'}</em>
    </button>;
  })}</div>;
}

function ChoiceResult({ event, result, lang, onNext, onRetry }) {
  const zh = lang === 'zh';
  const clean = result.outcome === 'clean';
  const exposed = result.outcome === 'exposed';
  const agentId = formatAgentId(result.agentId) || (zh ? '未知探员' : 'UNKNOWN OPERATIVE');
  return <div className={`td-rehearsal-result is-${result.outcome}`} aria-live="polite">
    <div className="td-rehearsal-result-heading"><span>{clean ? '✓' : exposed ? '!' : '◇'}</span><div><small>{zh ? '战术反馈' : 'TACTICAL FEEDBACK'}</small><strong>{agentId}</strong></div><em>{zh ? (clean ? '处理顺畅' : exposed ? '准备不足' : '有代价的推进') : (clean ? 'CLEAN READ' : exposed ? 'EXPOSED' : 'TRADEOFF')}</em></div>
    <p>{zh
      ? (clean ? `${agentId} 的${FOCUS_LABELS[event.focus]?.[0] || '专项能力'}压住了事件波动，预计混乱增长降低 ${result.mitigation} 点。` : exposed ? `${agentId} 可以继续推进，但${FOCUS_LABELS[event.focus]?.[0] || '关键能力'}不足，事件会留下更高的混乱风险。` : `${agentId} 找到了突破口，但需要承受一部分混乱；换一名探员可能得到不同取舍。`)
      : (clean ? `${agentId}'s ${FOCUS_LABELS[event.focus]?.[1] || 'specialty'} keeps the event stable. Confusion growth is reduced by ${result.mitigation}.` : exposed ? `${agentId} can proceed, but the ${FOCUS_LABELS[event.focus]?.[1] || 'key skill'} gap leaves more confusion exposed.` : `${agentId} finds a way forward, with a cost. Another operative may produce a different trade-off.`)}</p>
    <div className="td-rehearsal-metrics"><span>{zh ? '专长把握' : 'EXPERTISE'} <b>{result.expertise}%</b></span><span>{zh ? '预计混乱' : 'CONFUSION'} <b>{result.confusion[0]}-{result.confusion[1]}</b></span><span>{zh ? '陷阱概率' : 'TRAP'} <b>{result.forecast.trap}%</b></span></div>
    <div className="td-rehearsal-result-actions"><button type="button" onClick={onRetry}>{zh ? '换人试试' : 'TRY ANOTHER'}</button><button type="button" onClick={onNext}>{zh ? '继续试演' : 'NEXT EVENT'}</button></div>
  </div>;
}

export default function TacticalRehearsalModal({ agents, agentDefs, feedback, synergyCount = 0, onClose, restoreRef }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const dialogRef = useRef(null);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState([]);
  useModalFocusTrap(true, dialogRef, onClose, restoreRef);

  const safeFeedback = {
    strengths: Array.isArray(feedback?.strengths) ? feedback.strengths.filter(item => item && typeof item === 'object') : [],
    risks: Array.isArray(feedback?.risks) ? feedback.risks.filter(item => item && typeof item === 'object') : [],
  };
  const event = getRehearsalEvent(step);
  const currentResult = results[step] || null;
  const summary = summarizeRehearsal(results);
  const chooseAgent = agent => {
    const result = evaluateRehearsalChoice(event, agent);
    setResults(current => [...current.slice(0, step), result]);
  };
  const next = () => {
    setStep(current => current + 1);
  };
  const retry = () => {
    setResults(current => current.slice(0, step));
  };
  const reset = () => {
    setStep(0);
    setResults([]);
  };

  return <div className="td-rehearsal-layer" onClick={onClose}>
    <section ref={dialogRef} className="td-rehearsal-modal td-scroll-region" role="dialog" aria-modal="true" aria-label={zh ? '战术台试演' : 'Tactical desk rehearsal'} tabIndex={-1} onClick={eventClick => eventClick.stopPropagation()}>
      <header className="td-rehearsal-titlebar"><div><small>◇ TACTICAL DESK</small><h2>{zh ? '战术试演' : 'TACTICAL REHEARSAL'}</h2><p>{zh ? '只验证思路，不改变案件、不消耗体力。' : 'Test the approach without changing the case or spending energy.'}</p></div><button type="button" onClick={onClose} aria-label={zh ? '关闭战术台' : 'Close tactical desk'}>×</button></header>
      <FeedbackList feedback={safeFeedback} lang={lang} />
      {step < REHEARSAL_EVENTS.length ? <>
        <EventHeader event={event} index={step} lang={lang} />
        <p className="td-rehearsal-prompt">{zh ? event.prompt : event.promptEn}</p>
        {!currentResult ? <AgentChoices agents={Array.isArray(agents) ? agents : []} agentDefs={Array.isArray(agentDefs) ? agentDefs : []} lang={lang} onChoose={chooseAgent} /> : <ChoiceResult event={event} result={currentResult} lang={lang} onRetry={retry} onNext={next} />}
      </> : <div className="td-rehearsal-summary" aria-live="polite"><div className="td-rehearsal-summary-icon">✓</div><small>{zh ? '试演完成 · 结果不会带入正式案件' : 'REHEARSAL COMPLETE · NO RESULTS CARRY OVER'}</small><strong>{summary.averageExpertise}% <span>{zh ? '平均专长把握' : 'AVERAGE EXPERTISE'}</span></strong><p>{zh ? `你看到了 ${summary.clean} 次顺畅处理、${summary.tradeoffs} 次有代价推进和 ${summary.exposed} 次风险暴露。换人或调整优先级，再试一次就能比较不同路线。` : `${summary.clean} clean reads, ${summary.tradeoffs} trade-offs and ${summary.exposed} exposed risks. Change the team or priorities and run it again to compare routes.`}</p><button type="button" onClick={reset}>{zh ? '重新试演' : 'REHEARSE AGAIN'}</button></div>}
      <footer className="td-rehearsal-footer"><span><IconText text={synergyCount ? `✦ ${synergyCount} ${zh ? '项协同在线' : 'SYNERGIES ONLINE'}` : (zh ? '协同待激活' : 'SYNERGY STANDBY')} /></span><small>{zh ? '模拟结果仅供准备参考，不代表必胜。' : 'A rehearsal is guidance, not a guaranteed outcome.'}</small></footer>
    </section>
  </div>;
}
