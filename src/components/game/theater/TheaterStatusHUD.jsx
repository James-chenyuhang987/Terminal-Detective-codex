import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

export function theaterStatusWarnings(state, crisisPending = false) {
  return {
    ap: Number.isFinite(state?.action_points_left) && state.action_points_left <= 3,
    hp: Number.isFinite(state?.current_hp) && state.current_hp <= 30,
    confusion: Number.isFinite(state?.confusion_score) && state.confusion_score >= 65,
    crisis: Boolean(crisisPending),
  };
}

export function useFieldTransmission(line, active) {
  const key = line ? `${line.id}:${line.type}:${line.text}` : null;
  const [expired, setExpired] = useState(null);
  const urgent = line?.type === 'error' || line?.type === 'trap';
  useEffect(() => {
    if (!key || !active) return undefined;
    const timer = window.setTimeout(() => setExpired(key), urgent ? 11000 : 6500);
    return () => window.clearTimeout(timer);
  }, [key, urgent, active]);
  return active && key && key !== expired ? line : null;
}

export default function TheaterStatusHUD({ gameState, evidenceCount = 0, crisisPending = false }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const detailsRef = useRef(null);
  const warnings = theaterStatusWarnings(gameState, crisisPending);
  useEffect(() => {
    const dismiss = event => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) detailsRef.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <div className="td-theater-resources td-theater-status" aria-label={zh ? '案件状态' : 'Case status'}>
    <span className={warnings.ap ? 'is-warning' : ''}>AP <b>{gameState.action_points_left}</b>{warnings.ap && <em>{zh ? '余量偏低' : 'Low reserve'}</em>}</span>
    {(warnings.hp || warnings.confusion || warnings.crisis) && <div className="td-theater-status-alert" role="status" aria-live="polite">
      {warnings.hp && <span>HP <b>{gameState.current_hp}%</b></span>}
      {warnings.confusion && <span>{zh ? '混乱偏高' : 'High confusion'} <b>{gameState.confusion_score}%</b></span>}
      {warnings.crisis && <span>{zh ? '现场危机 · 需要处理' : 'Field crisis · action required'}</span>}
    </div>}
    <details ref={detailsRef} className="td-theater-status-details" onKeyDown={event => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }}>
      <summary>{zh ? '状态' : 'Status'}</summary>
      <dl><div><dt>{zh ? '回合' : 'Turn'}</dt><dd>{gameState.turn_count}</dd></div>
        <div><dt>{zh ? '已保全线索' : 'Secured clues'}</dt><dd>{evidenceCount}</dd></div>
        <div><dt>HP</dt><dd>{gameState.current_hp}%</dd></div>
        <div><dt>{zh ? '混乱' : 'Confusion'}</dt><dd>{gameState.confusion_score}%</dd></div></dl>
    </details>
  </div>;
}
