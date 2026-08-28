import React, { useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { COMMAND_CONTINGENCIES, COMMAND_DOCTRINES, commandCost } from '@/game/commandSystem';

export default function CommandConsole({ commandState, busy = false, onStabilize, onClose }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const state = commandState || {};
  const doctrine = COMMAND_DOCTRINES.find(item => item.id === state.doctrine_id);
  const contingency = COMMAND_CONTINGENCIES.find(item => item.id === state.contingency_id);
  const stabilizeCost = commandCost('emergency_stabilize', state);
  const unavailable = busy || state.emergency_stabilize_used || Number(state.points || 0) < stabilizeCost;
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const handleKey = event => { if (event.key === 'Escape') onCloseRef.current?.(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return <div className="td-command-console-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose?.();
  }}>
    <section className="td-command-console" role="dialog" aria-modal="true" aria-label={zh ? '指挥台' : 'Command Console'}>
      <header><div><small>TACTICAL COMMAND // LIVE</small><h2>{zh ? '全息指挥台' : 'HOLOGRAPHIC COMMAND'}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'}>×</button></header>
      <div className="td-command-console-meter">
        <span>{zh ? '当前指挥点' : 'COMMAND POINTS'}</span><strong>◆ {state.points || 0}<small>/{state.max_points || 5}</small></strong>
        <i>{Array.from({ length: state.max_points || 5 }, (_, index) => <b key={index} className={index < (state.points || 0) ? 'is-filled' : ''} />)}</i>
      </div>
      <div className="td-command-console-plan">
        <article><span>{doctrine?.icon || '◇'}</span><div><small>{zh ? '指挥学说' : 'DOCTRINE'}</small><strong>{zh ? doctrine?.name : doctrine?.nameEn}</strong><p>{zh ? doctrine?.desc : doctrine?.descEn}</p></div></article>
        <article><span>{contingency?.icon || '◇'}</span><div><small>{zh ? '应急预案' : 'CONTINGENCY'}</small><strong>{zh ? contingency?.name : contingency?.nameEn}</strong><p>{state.contingency_status === 'used' ? (zh ? '已触发' : 'TRIGGERED') : state.contingency_status === 'missed' ? (zh ? '因点数不足而失效' : 'MISSED: INSUFFICIENT POINTS') : (zh ? contingency?.desc : contingency?.descEn)}</p></div></article>
      </div>
      <button type="button" className="td-command-stabilize" disabled={unavailable} onClick={onStabilize}>
        <span>⌁</span><div><strong>{zh ? '紧急稳态' : 'EMERGENCY STABILIZE'}</strong><small>{state.emergency_stabilize_used ? (zh ? '本案已使用' : 'ALREADY USED THIS CASE') : (zh ? '立即降低 12 点混乱，每案限一次' : 'REDUCE CONFUSION BY 12 · ONCE PER CASE')}</small></div><b>◆ {stabilizeCost}</b>
      </button>
      <footer>{zh ? '战术预演与联合行动可在每轮决策卡中启用。所有指挥消耗仅在行动成功结算后扣除。' : 'TACTICAL PREVIEW AND JOINT ACTION ARE AVAILABLE ON DECISION CARDS. COSTS COMMIT ONLY AFTER A SUCCESSFUL ACTION.'}</footer>
    </section>
  </div>;
}
