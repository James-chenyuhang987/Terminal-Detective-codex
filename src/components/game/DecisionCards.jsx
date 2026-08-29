import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/lib/lang.jsx';
import StoryBriefing from '@/components/game/StoryBriefing';
import { decisionForecast, recommendExecutor } from '@/game/commandSystem';

const STYLE_META = {
  aggressive: { icon: '⚔️', zh: '激进', en: 'AGGRESSIVE', color: '#ff3860' },
  steady: { icon: '🛡️', zh: '稳健', en: 'STEADY', color: '#00ff88' },
  deceptive: { icon: '🎭', zh: '欺骗', en: 'DECEPTIVE', color: '#a78bfa' },
};
const RISK_COLOR = { high: '#ff3860', medium: '#ffaa00', low: '#00ff88' };
const AGENT_ICONS = { 'NEXUS-01': '👁️', 'AURORA-09': '🔬', 'CIPHER-47': '💻' };

function CommandToggle({ active, disabled, icon, title, detail, onClick }) {
  return <button type="button" className={`td-decision-command ${active ? 'is-active' : ''}`} disabled={disabled} onClick={onClick}>
    <span>{icon}</span><strong>{title}</strong><small>{detail}</small><b>◆ 1</b>
  </button>;
}

export default function DecisionCards({ cards, onChoose, timeLimit = 40, story, team = [], commandState, onCommandError }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [left, setLeft] = useState(timeLimit);
  const [custom, setCustom] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(() => cards[1] ? 1 : 0);
  const [executorId, setExecutorId] = useState(commandState?.active_agent_id || team[0]?.agent_id || '');
  const [assistantId, setAssistantId] = useState('');
  const [preview, setPreview] = useState(false);
  const [joint, setJoint] = useState(false);
  const resolvedRef = useRef(false);
  const overlayRef = useRef(null);
  const selectedCardRef = useRef(null);
  const previousFocusRef = useRef(null);
  const selectedCard = cards[selectedIndex] || cards[0];
  const points = Math.max(0, Number(commandState?.points) || 0);
  const reserved = Number(preview) + Number(joint);

  const recommendedId = useMemo(
    () => recommendExecutor(team, selectedCard?.action_tag || 'search_area'),
    [selectedCard?.action_tag, team],
  );

  useEffect(() => {
    const next = recommendedId || commandState?.active_agent_id || team[0]?.agent_id || '';
    setExecutorId(next);
    setAssistantId(team.find(agent => agent.agent_id !== next)?.agent_id || '');
  }, [recommendedId, commandState?.active_agent_id, team]);

  const chooseOnce = useCallback((choice) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onChoose(choice);
  }, [onChoose]);

  const buildChoice = useCallback((base) => ({
    ...base,
    executorAgentId: executorId || recommendedId,
    assistAgentId: joint ? assistantId : null,
    commandIds: [preview && 'tactical_preview', joint && 'joint_action'].filter(Boolean),
  }), [assistantId, executorId, joint, preview, recommendedId]);

  useEffect(() => {
    const id = window.setInterval(() => setLeft(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || typeof document === 'undefined') return undefined;

    previousFocusRef.current = document.activeElement;
    overlay.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const frame = window.requestAnimationFrame(() => {
      overlay.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      selectedCardRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const fallbackCard = cards[1] || cards[0];
    if (left === 0 && fallbackCard) {
      chooseOnce({ card: fallbackCard, executorAgentId: recommendExecutor(team, fallbackCard.action_tag) || executorId, assistAgentId: null, commandIds: [] });
    }
  }, [cards, chooseOnce, executorId, left, team]);

  const toggleCommand = (id) => {
    const active = id === 'preview' ? preview : joint;
    if (!active && reserved + 1 > points) {
      onCommandError?.('insufficient_command_points');
      return;
    }
    if (id === 'preview') setPreview(value => !value);
    else setJoint(value => !value);
  };

  const confirm = () => {
    if (!selectedCard || reserved > points) return onCommandError?.('insufficient_command_points');
    chooseOnce(buildChoice({ card: selectedCard }));
  };

  const submitCustom = () => {
    if (!custom.trim() || reserved > points) return;
    chooseOnce(buildChoice({ freeform: custom.trim() }));
  };

  const dialog = (
    <div
      ref={overlayRef}
      className="td-decision-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="td-decision-title"
    >
      <StoryBriefing story={story} />
      <div className="td-decision-heading">
        <div id="td-decision-title">{zh ? '◈ 指挥席 · 关键决策' : '◈ COMMAND DESK · KEY DECISION'}</div>
        <small className={left <= 10 ? 'is-urgent' : ''}>{zh ? `指令窗口 ${Math.max(0, left)} 秒` : `COMMAND WINDOW ${Math.max(0, left)}s`}</small>
        <b>◆ {points - reserved}/{commandState?.max_points || 5}</b>
      </div>

      <div className="td-decision-assistant-tip" role="note">
        <span>🤖</span>
        <div><small>NOVA · {zh ? '决策提示' : 'DECISION TIP'}</small><strong>{zh ? '先阅读白色的「证据及发现」，再比较收益和风险。' : 'Read the white EVIDENCE & FINDINGS text before comparing benefit and risk.'}</strong></div>
      </div>

      <div className="td-decision-cards">
        {cards.map((card, index) => {
          const meta = STYLE_META[card.style] || STYLE_META.steady;
          const riskColor = RISK_COLOR[card.risk_level] || '#ffaa00';
          const forecast = decisionForecast(card.action_tag, card.risk_level);
          const isSelected = index === selectedIndex;
          return <button ref={isSelected ? selectedCardRef : undefined} type="button" className={`td-decision-card ${isSelected ? 'is-selected' : ''}`} key={`${card.action_tag}-${index}`}
            onClick={() => setSelectedIndex(index)} style={/** @type {React.CSSProperties & Record<string, string>} */ ({ '--decision-color': meta.color, '--risk-color': riskColor })}>
            <div className="td-decision-card-head"><span>{meta.icon}</span><strong>{zh ? meta.zh : meta.en}</strong><i>{isSelected ? 'SELECTED' : `0${index + 1}`}</i></div>
            <div className="td-decision-card-copy"><h3>{card.label}</h3><p className="is-benefit">＋ {card.benefit_desc}</p><p className="is-risk">⚠ {card.risk_desc}</p><code>[{String(card.action_tag).toUpperCase()}]</code></div>
            {preview && <div className="td-decision-forecast"><span>AP {forecast.ap[0]}–{forecast.ap[1]}</span><span>{zh ? '混乱' : 'CONF'} {forecast.confusion[0]}–{forecast.confusion[1]}</span><span>{zh ? '陷阱' : 'TRAP'} {forecast.trap}%</span></div>}
            <i className="td-decision-risk-line" />
          </button>;
        })}
      </div>

      <section className="td-decision-command-desk">
        <div className="td-decision-executors">
          <header><span>{zh ? '执行探员' : 'EXECUTING AGENT'}</span><small>{zh ? '系统推荐已标记，仍可自由改派' : 'RECOMMENDATION MARKED · MANUAL OVERRIDE ALLOWED'}</small></header>
          <div>{team.slice(0, 3).map(agent => <button type="button" key={agent.agent_id} className={executorId === agent.agent_id ? 'is-active' : ''} onClick={() => setExecutorId(agent.agent_id)}><span>{AGENT_ICONS[agent.agent_id] || '◈'}</span><strong>{agent.agent_id}</strong>{recommendedId === agent.agent_id && <small>{zh ? '推荐' : 'REC'}</small>}</button>)}</div>
          {joint && <div className="td-decision-assist"><small>{zh ? '协助探员' : 'ASSIST AGENT'}</small>{team.filter(agent => agent.agent_id !== executorId).slice(0, 2).map(agent => <button type="button" key={agent.agent_id} className={assistantId === agent.agent_id ? 'is-active' : ''} onClick={() => setAssistantId(agent.agent_id)}>{AGENT_ICONS[agent.agent_id] || '◈'} {agent.agent_id}</button>)}</div>}
        </div>
        <div className="td-decision-command-options">
          <CommandToggle active={preview} disabled={!preview && reserved >= points} icon="⌁" title={zh ? '战术预演' : 'TACTICAL PREVIEW'} detail={zh ? '显示本地风险预测' : 'SHOW LOCAL FORECAST'} onClick={() => toggleCommand('preview')} />
          <CommandToggle active={joint} disabled={!joint && reserved >= points} icon="◇" title={zh ? '联合行动' : 'JOINT ACTION'} detail={zh ? '双人取高值，AP -1' : 'BEST ATTRIBUTE · AP -1'} onClick={() => toggleCommand('joint')} />
        </div>
      </section>

      <div className="td-decision-order-row">
        <input className="td-ui-input" value={custom} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitCustom(); }} placeholder={zh ? '可选：输入自由指令覆盖所选卡片…' : 'OPTIONAL: TYPE A FREE ORDER TO OVERRIDE THE CARD…'} />
        {custom.trim()
          ? <button type="button" className="td-ui-button td-button-primary" onClick={submitCustom}>{zh ? '▶ 下达自由指令' : '▶ ISSUE FREE ORDER'}</button>
          : <button type="button" className="td-ui-button td-button-primary" onClick={confirm}>{zh ? '▶ 确认战术' : '▶ CONFIRM TACTIC'}</button>}
      </div>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
