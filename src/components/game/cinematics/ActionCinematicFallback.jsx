import React, { useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import SceneIllustration from '@/components/game/SceneIllustration';
import { getCinematicActionLabel } from '@/game/actionCinematic';

const OUTCOME_TEXT = {
  trap: { zh: '敌对反制触发', en: 'HOSTILE COUNTERMEASURE' },
  clue: { zh: '关键证据已保全', en: 'EVIDENCE SECURED' },
  progress: { zh: '调查路径已推进', en: 'INVESTIGATION ADVANCED' },
  no_yield: { zh: '本轮未获得新证据', en: 'NO NEW EVIDENCE' },
};

export default function ActionCinematicFallback({ event, onComplete, loading = false }) {
  const { lang } = useLang();
  const completeRef = useRef(onComplete);
  const skipRef = useRef(null);
  const previousFocusRef = useRef(null);
  completeRef.current = onComplete;
  const zh = lang === 'zh';

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    skipRef.current?.focus();
    const id = loading ? null : window.setTimeout(() => completeRef.current?.('completed'), 1000);
    return () => {
      if (id !== null) window.clearTimeout(id);
      previousFocusRef.current?.focus();
    };
  }, [event?.eventId, loading]);

  useEffect(() => {
    const onKey = keyEvent => {
      if (keyEvent.key === 'Escape') completeRef.current?.('skipped');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`td-action-cinematic td-action-cinematic-fallback ${loading ? 'is-loading' : ''}`}
      style={/** @type {React.CSSProperties & {'--cine-accent': string}} */ ({ '--cine-accent': event?.accentColor || '#00e5ff' })}
      role="dialog"
      aria-modal="true"
      aria-label={zh ? '行动演示' : 'ACTION REENACTMENT'}
    >
      <div className="td-action-cinematic-grid" aria-hidden="true" />
      <div className="td-cinematic-fallback-card">
        <SceneIllustration zone={event?.zoneId} actionTag={event?.actionTag} height={220} />
        <small>{loading ? (zh ? '正在载入全息演示' : 'LOADING HOLOGRAPHIC REENACTMENT') : (zh ? '现场重演 · 2D 安全模式' : 'FIELD REPLAY · 2D SAFE MODE')}</small>
        <h2>{getCinematicActionLabel(event?.actionTag, lang)}</h2>
        {!loading && <strong>{(OUTCOME_TEXT[event?.outcome] || OUTCOME_TEXT.progress)[lang] || OUTCOME_TEXT.progress.zh}</strong>}
      </div>
      <button ref={skipRef} type="button" className="td-cinematic-skip" onClick={() => completeRef.current?.('skipped')}>
        {zh ? '跳过演示' : 'SKIP REPLAY'} ▶▶
      </button>
    </div>
  );
}
