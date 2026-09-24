import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/lib/lang.jsx';
import { resolveTacticalChoice } from '@/game/tacticalRehearsal';

function localize(value, lang, fallback = '') {
  if (value && typeof value === 'object') return value[lang] || value.zh || value.en || fallback;
  return value || fallback;
}

function Metric({ label, value, tone = 'neutral' }) {
  return <span className={`td-rehearsal-metric is-${tone}`}><small>{label}</small><strong>{value}</strong></span>;
}

function SummaryList({ title, items, lang, tone }) {
  return <section className={`td-rehearsal-summary-list is-${tone}`}>
    <h3>{title}</h3>
    {items?.length ? items.map(item => (
      <div key={`${item.key || item.label}-${item.owner || item.agentId || ''}`}>
        <strong>{lang === 'en' ? (item.actionEn || item.action || item.labelEn || item.label) : (item.action || item.label)}</strong>
        <span>{item.owner || item.agentId || '—'} · {Math.round((Number(item.ratio) || 0) * 100)}%{Number.isFinite(Number(item.weight)) ? ` · ${lang === 'en' ? `${Math.round(Number(item.weight) * 100)}% WEIGHT` : `权重 ${Math.round(Number(item.weight) * 100)}%`}` : ''}</span>
      </div>
    )) : <p>{lang === 'zh' ? '暂无明显项，换人后再观察。' : 'No dominant signal yet. Try another handler.'}</p>}
  </section>;
}

const SYNERGY_LABELS = Object.freeze({
  cross_validation: { zh: '交叉验证', en: 'CROSS VALIDATION' },
  digital_forensics: { zh: '数字法证', en: 'DIGITAL FORENSICS' },
  ghost_protocol: { zh: '幽灵协议', en: 'GHOST PROTOCOL' },
});

function TacticalContext({ rehearsal, lang }) {
  const zh = lang === 'zh';
  const generalFormation = rehearsal?.caseId === 'GENERAL';
  const agents = Array.isArray(rehearsal?.agents) ? rehearsal.agents : [];
  const skills = Array.isArray(rehearsal?.synergySkills) ? rehearsal.synergySkills : [];
  const strengths = Array.isArray(rehearsal?.strengths) ? rehearsal.strengths : [];
  const risks = Array.isArray(rehearsal?.risks) ? rehearsal.risks : [];
  const signal = (items, empty) => items.length
    ? items.slice(0, 2).map(item => {
      const label = zh
        ? (item.action || item.label || item.key)
        : (item.actionEn || item.labelEn || item.action || item.label || item.key);
      const owner = zh
        ? (item.owner || item.agentId || '—')
        : (item.ownerEn || item.owner || item.agentId || '—');
      const weight = Number.isFinite(Number(item.weight))
        ? ` · ${zh ? `权重 ${Math.round(Number(item.weight) * 100)}%` : `${Math.round(Number(item.weight) * 100)}% WEIGHT`}`
        : '';
      return `${label} · ${owner}${weight}`;
    }).join(' / ')
    : empty;
  return <div className="td-rehearsal-context" aria-label={zh ? '当前战术上下文' : 'Current tactical context'}>
    <div className="td-rehearsal-context-block is-squad">
      <small>{zh ? '当前编组' : 'CURRENT SQUAD'}</small>
      <div className="td-rehearsal-context-agents">
        {agents.map((agent, index) => <span key={agent.agent_id || index} style={/** @type {React.CSSProperties & {'--agent-color': string}} */ ({ '--agent-color': agent.color || '#00e5ff' })}>
          <b>{agent.icon || '◇'}</b>{agent.name || agent.agent_id || `SLOT-${index + 1}`}
        </span>)}
      </div>
    </div>
    <div className="td-rehearsal-context-block">
      <small>{generalFormation
        ? (zh ? '协同链路 · 编组适配度' : 'SYNERGY · SQUAD FIT')
        : (zh ? '协同链路 · 案件适配度' : 'SYNERGY · CASE FIT')}</small>
      <p>{skills.length
        ? skills.map(id => SYNERGY_LABELS[id]?.[zh ? 'zh' : 'en'] || id).join(' / ')
        : (zh ? '暂无激活协同' : 'NO ACTIVE SYNERGY')} · {Math.round(Number(rehearsal?.matchScore) || 0)}%</p>
    </div>
    <div className="td-rehearsal-context-block is-signals">
      <small>{zh ? '公开优势 / 风险' : 'PUBLIC STRENGTHS / RISKS'}</small>
      <p><b>{zh ? '优势' : 'STRENGTH'}</b> {signal(strengths, zh ? '暂无明显优势，可调整专长补强' : 'NO CLEAR STRENGTH YET — TUNE SPECIALTIES')}</p>
      <p><b>{zh ? '风险' : 'RISK'}</b> {signal(risks, zh ? '暂无明显短板' : 'NO DOMINANT GAP')}</p>
    </div>
  </div>;
}

export default function TacticalRehearsalPanel({ rehearsal, onClose }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [session, setSession] = useState(() => rehearsal);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [choiceResult, setChoiceResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const beforeChoiceRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const briefRef = useRef(null);
  const resultRef = useRef(null);
  const completeRef = useRef(null);
  const previousFocusRef = useRef(null);

  const scenes = Array.isArray(session?.scenes) ? session.scenes : [];
  const scene = scenes[sceneIndex] || null;
  const isComplete = sceneIndex >= scenes.length;
  const selectedOption = useMemo(() => {
    if (!scene || !choiceResult) return null;
    return scene.options?.find(option => option.agentId === choiceResult.agentId || option.id === choiceResult.optionId) || null;
  }, [choiceResult, scene]);

  const resetSession = useCallback(() => {
    setSession(rehearsal);
    setSceneIndex(0);
    setChoiceResult(null);
    setProcessing(false);
    setRemainingSeconds(0);
    beforeChoiceRef.current = null;
  }, [rehearsal]);

  const closePanel = useCallback(() => {
    setProcessing(false);
    onClose?.();
  }, [onClose]);

  // A formation change while the panel is open starts a fresh local run.
  useEffect(() => {
    resetSession();
  }, [resetSession]);

  // The countdown belongs to the selected scene, not a parent's callback
  // identity. A lobby rerender must never cancel a running event's timer.
  const durationSeconds = Math.max(6, Math.min(20, Number(scene?.durationSeconds) || 15));
  useEffect(() => {
    if (!processing) return undefined;
    const deadline = Date.now() + durationSeconds * 1000;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (!remaining) setProcessing(false);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [durationSeconds, processing]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(panelRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePanel]);

  useEffect(() => {
    const target = choiceResult
      ? resultRef.current
      : isComplete
        ? completeRef.current
        : briefRef.current;
    if (!target) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView?.({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      target.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [choiceResult, isComplete, sceneIndex]);

  const choose = option => {
    if (!scene || choiceResult || processing) return;
    beforeChoiceRef.current = session;
    const result = resolveTacticalChoice(session, scene.id, option.agentId || option.id);
    if (result.error || !result.rehearsal) return;
    setSession(result.rehearsal);
    setChoiceResult({ ...result, optionId: option.id, agentId: option.agentId || result.agentId });
    const animate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setRemainingSeconds(animate ? durationSeconds : 0);
    setProcessing(animate);
  };

  const continueScene = () => {
    if (!choiceResult) return;
    setProcessing(false);
    setRemainingSeconds(0);
    const nextSceneIndex = session?.activeSceneId
      ? scenes.findIndex(entry => entry.id === session.activeSceneId)
      : scenes.length;
    setChoiceResult(null);
    setSceneIndex(nextSceneIndex >= 0 ? nextSceneIndex : scenes.length);
    beforeChoiceRef.current = null;
  };

  const retryScene = () => {
    if (!beforeChoiceRef.current) return;
    setSession(beforeChoiceRef.current);
    setChoiceResult(null);
    setProcessing(false);
    setRemainingSeconds(0);
    beforeChoiceRef.current = null;
  };

  const dialog = <div className="td-rehearsal-layer" role="dialog" aria-modal="true" aria-label={zh ? '战术试演' : 'Tactical rehearsal'}>
    <div className="td-rehearsal-backdrop" onClick={closePanel} />
    <section className="td-rehearsal-panel" ref={panelRef} onClick={event => event.stopPropagation()}>
      <header className="td-rehearsal-header">
        <div>
          <span>◇ {zh ? '战术台 · 免费模拟' : 'TACTICAL DESK · FREE SIMULATION'}</span>
          <h2>{zh ? '战术试演' : 'TACTICAL REHEARSAL'}</h2>
          <p>{zh ? '不消耗体力，不影响正式案件；选择会改变这次模拟的处理方式。' : 'No energy, rewards or case answers are involved. Your choices change this simulation only.'}</p>
        </div>
        <button type="button" className="td-rehearsal-close" ref={closeRef} onClick={closePanel} aria-label={zh ? '关闭战术试演' : 'Close tactical rehearsal'}>×</button>
      </header>

      <div className="td-rehearsal-progress" aria-label={zh ? '试演进度' : 'Rehearsal progress'}>
        {scenes.map((entry, index) => <span key={entry.id || index} className={index < sceneIndex ? 'is-done' : index === sceneIndex && !isComplete ? 'is-current' : ''}>{index + 1}</span>)}
        <small>{isComplete ? (zh ? '模拟完成' : 'SIMULATION COMPLETE') : `${sceneIndex + 1}/${scenes.length} · ${zh ? '选择处理者' : 'CHOOSE A HANDLER'}`}</small>
      </div>

      <TacticalContext rehearsal={session} lang={lang} />

      {!isComplete && scene && <>
        <div className="td-rehearsal-brief" ref={briefRef} tabIndex={-1}>
          <span>{localize(scene.eyebrow, lang, zh ? '战术事件' : 'TACTICAL EVENT')}</span>
          <h3>{lang === 'en' ? (scene.titleEn || scene.title) : scene.title}</h3>
          <p>{lang === 'en' ? (scene.briefEn || scene.brief) : scene.brief}</p>
        </div>
        <div className="td-rehearsal-options">
          {(scene.options || []).map(option => {
            const chosen = selectedOption?.id === option.id;
            return <button
              type="button"
              key={option.id || option.agentId}
              className={`td-rehearsal-option ${chosen ? 'is-chosen' : ''}`}
              onClick={() => choose(option)}
              disabled={Boolean(choiceResult) || processing}
            >
              <span className="td-rehearsal-option-agent">{option.agentIcon || option.icon || '◇'}</span>
              <span className="td-rehearsal-option-copy">
                <strong>{lang === 'en' ? (option.actionEn || option.action || option.label) : (option.action || option.label)}</strong>
                <small>{option.agentName || option.agentId || localize(option.agent, lang)}</small>
                <em>{lang === 'en'
                  ? `${option.fitLabelEn || option.fit || 'CONTROLLED FIT'} · ${option.reasonEn || ''}`
                  : `${option.fitLabel || option.fit || '可控处理'} · ${option.reason || ''}`}</em>
                {option.signals && (option.signals.synergy || option.signals.command || option.signals.skill || option.signals.efficiency) ? <small className="td-rehearsal-option-signal">
                  {(option.signals.synergy ? `${zh ? '协同' : 'SYNERGY'} +${option.signals.synergy}` : '')}
                  {(option.signals.command ? `${option.signals.synergy ? ' · ' : ''}${zh ? '指挥方案' : 'COMMAND'} +${option.signals.command}` : '')}
                  {(option.signals.skill ? `${option.signals.synergy || option.signals.command ? ' · ' : ''}${zh ? '装备效果' : 'SKILL EFFECT'} +${option.signals.skill}` : '')}
                  {(option.signals.efficiency ? `${option.signals.synergy || option.signals.command || option.signals.skill ? ' · ' : ''}${zh ? '行动效率' : 'EFFICIENCY'} +${option.signals.efficiency}` : '')}
                </small> : null}
              </span>
              <span className="td-rehearsal-option-arrow">→</span>
            </button>;
          })}
        </div>
        {choiceResult && <div className={`td-rehearsal-result ${processing ? 'is-processing' : ''}`} ref={resultRef} tabIndex={-1}>
          <div className="td-rehearsal-result-heading" role="status"><span>{processing ? '◌' : '✓'}</span><strong>{processing ? (zh ? '正在模拟处理链…' : 'SIMULATING RESPONSE…') : (zh ? '处理链已完成' : 'RESPONSE CHAIN COMPLETE')}</strong></div>
          {processing && <div className="td-rehearsal-countdown">
            <progress max={durationSeconds} value={durationSeconds - remainingSeconds} aria-label={zh ? '事件模拟进度' : 'Event simulation progress'} />
            <span role="timer" aria-live="off">{remainingSeconds}s</span>
          </div>}
          <p>{zh ? (choiceResult.message || selectedOption?.effect || '') : (choiceResult.messageEn || selectedOption?.effectEn || '')}</p>
          <div className="td-rehearsal-risk-note">
            <strong>{Number(choiceResult.riskDelta) > 0 ? '⚠' : Number(choiceResult.riskDelta) < 0 ? '↓' : '◇'} {zh
              ? (Number(choiceResult.riskDelta) > 0 ? '暴露短板' : Number(choiceResult.riskDelta) < 0 ? '风险下降' : '风险持平')
              : (Number(choiceResult.riskDelta) > 0 ? 'EXPOSED RISK' : Number(choiceResult.riskDelta) < 0 ? 'RISK REDUCED' : 'RISK FLAT')}</strong>
            <span>{zh ? (choiceResult.risk || selectedOption?.risk || '') : (choiceResult.riskEn || selectedOption?.riskEn || '')}</span>
          </div>
          <div className="td-rehearsal-metrics">
            <Metric label={zh ? '现场清晰度' : 'CLARITY'} value={choiceResult.impact?.clarity ?? 0} tone="good" />
            <Metric label={zh ? '稳定度' : 'STABILITY'} value={`${choiceResult.impact?.stability ?? 0}`} tone="neutral" />
            <Metric label={zh ? '风险变化' : 'RISK CHANGE'} value={`${Number(choiceResult.riskDelta) >= 0 ? '+' : ''}${choiceResult.riskDelta ?? 0}`} tone={Number(choiceResult.riskDelta) > 0 ? 'risk' : 'good'} />
            <Metric label={zh ? '处理节奏' : 'TEMPO'} value={`${choiceResult.impact?.tempo ?? 0}`} tone="neutral" />
          </div>
          <div className="td-rehearsal-result-actions">
            <button type="button" className="td-rehearsal-continue is-secondary" onClick={retryScene}>{zh ? '换人重试' : 'TRY ANOTHER HANDLER'}</button>
            <button type="button" className="td-rehearsal-continue" onClick={continueScene}>{processing ? (zh ? '跳过等待 →' : 'SKIP WAIT →') : sceneIndex + 1 < scenes.length ? (zh ? '进入下一事件 →' : 'NEXT EVENT →') : (zh ? '查看本次总结 →' : 'VIEW SUMMARY →')}</button>
          </div>
        </div>}
      </>}

      {isComplete && <div className="td-rehearsal-complete" ref={completeRef} tabIndex={-1}>
        <div className="td-rehearsal-complete-mark">✓</div>
        <h3>{zh ? '模拟链路完成' : 'SIMULATION COMPLETE'}</h3>
        <p>{zh ? '这是一次战术排练，不会改变正式案件或玩家档案。' : 'This was a tactical rehearsal. The formal case and player profile are unchanged.'}</p>
        <div className="td-rehearsal-summary-grid">
          <SummaryList title={zh ? '当前优势' : 'CURRENT STRENGTHS'} items={session?.strengths} lang={lang} tone="good" />
          <SummaryList title={zh ? '准备风险' : 'PREPARATION RISKS'} items={session?.risks} lang={lang} tone="risk" />
        </div>
        <div className="td-rehearsal-final-metrics">
          <Metric label={zh ? '清晰度' : 'CLARITY'} value={session?.metrics?.clarity ?? 0} tone="good" />
          <Metric label={zh ? '稳定度' : 'STABILITY'} value={session?.metrics?.stability ?? 0} tone="neutral" />
          <Metric label={zh ? '累计风险' : 'TOTAL RISK'} value={session?.metrics?.risk ?? 0} tone="risk" />
          <Metric label={zh ? '处理节奏' : 'TEMPO'} value={session?.metrics?.tempo ?? 0} tone="neutral" />
        </div>
        {Array.isArray(session?.tradeoffs) && session.tradeoffs.length > 0 && <div className="td-rehearsal-tradeoff">
          <strong>{zh ? '换人会改变什么' : 'WHAT A SWAP CHANGES'}</strong>
          {session.tradeoffs.slice(0, 3).map(item => <span key={item.key || item.text}>{zh ? (item.text || `${item.gain?.agentId || ''} 的能力更强；换出会牺牲这项覆盖。`) : (item.textEn || `${item.gain?.agentId || ''} leads here; replacing them sacrifices this coverage.`)}</span>)}
        </div>}
        <div className="td-rehearsal-complete-actions">
          <button type="button" className="td-rehearsal-continue is-secondary" onClick={resetSession}>{zh ? '重新试演' : 'RESTART REHEARSAL'}</button>
          <button type="button" className="td-rehearsal-continue" onClick={closePanel}>{zh ? '返回战术台' : 'RETURN TO TACTICAL DESK'}</button>
        </div>
      </div>}
    </section>
  </div>;

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
