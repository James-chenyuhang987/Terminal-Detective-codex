import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import NarrativeText from './NarrativeText';
import './narrative.css';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';

export default function NarrativeOverlay({ title, text, lang, active = true, busy = false, error = '', onComplete,
  onCancel = null, onHome = null, onSettings = null, onSwitchMode = null, restoreFocusSelector = '' }) {
  const zh = lang !== 'en';
  const titleId = useId();
  const textId = useId();
  const dialogRef = useRef(null);
  const [reveal, setReveal] = useState({ count: 0, complete: false, instant: false });
  const { foreground, reducedMotion } = usePresentationMotion();
  const characters = Array.from(text);
  const complete = reveal.complete || reducedMotion;
  const visibleCount = complete ? characters.length : Math.min(reveal.count, characters.length);
  const instant = reducedMotion || reveal.instant === true;

  useEffect(() => {
    if (reducedMotion) setReveal(current => current.complete ? current : { ...current, complete: true });
    if (!active || !foreground || busy || complete) return undefined;
    const id = window.setInterval(() => {
      if (document.hidden || !document.hasFocus()) return;
      setReveal(current => {
        const count = Math.min(characters.length, current.count + 2);
        return { ...current, count, complete: count >= characters.length };
      });
    }, 28);
    return () => window.clearInterval(id);
  }, [active, foreground, busy, complete, reducedMotion, characters.length]);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus !== document.body && previousFocus.isConnected
        && !previousFocus.closest('[hidden], [inert]') && previousFocus.getClientRects().length) {
        previousFocus.focus({ preventScroll: true });
      } else if (restoreFocusSelector && (document.activeElement === document.body || dialog?.contains(document.activeElement))) {
        const fallback = document.querySelector(restoreFocusSelector);
        if (fallback instanceof HTMLElement && !fallback.closest('[hidden], [inert]') && fallback.getClientRects().length) fallback.focus({ preventScroll: true });
      }
    };
  }, [active, restoreFocusSelector]);

  return <dialog ref={dialogRef} className="td-narrative" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId}
    data-text-paused={!active || !foreground || busy} data-text-instant={instant}
    onCancel={event => { event.preventDefault(); if (!busy) (onCancel || onComplete)(); }}
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
    <header><small aria-hidden="true">{zh ? '◈ 终端侦探 / 叙事档案' : '◈ TERMINAL DETECTIVE / NARRATIVE ARCHIVE'}</small><h2 id={titleId}>
      <NarrativeText text={title} lang={lang} variant="title" paused={!active || !foreground || busy} instant={instant} />
      <span className="td-narrative-sr">{title}</span>
    </h2></header>
    <div className="td-narrative-scroll" tabIndex={0}>
      {/* All words reserve their wrapping; assistive technology receives one static passage. */}
      <p className="td-narrative-copy" aria-hidden="true"><NarrativeText text={text} lang={lang} visibleCount={visibleCount} paused={!active || !foreground || busy} instant={instant} /></p>
      <p id={textId} className="td-narrative-sr">{text}</p>
    </div>
    {error && <p className="td-narrative-error" role="alert">{error}</p>}
    <footer>
      <div className="td-narrative-actions">
        <button type="button" autoFocus onClick={() => setReveal({ count: characters.length, complete: true, instant: true })} disabled={instant || busy}>{zh ? '显示全文' : 'Show all'}</button>
        <button type="button" className="is-primary" onClick={onComplete} disabled={!complete || busy}>{busy ? (zh ? '正在进入…' : 'Entering…') : (zh ? '继续' : 'Continue')}</button>
        <button type="button" onClick={onComplete} disabled={busy}>{zh ? '跳过' : 'Skip'}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>{zh ? '返回主页' : 'Back home'}</button>}
      </div>
      {(onHome || onSettings || onSwitchMode) && <nav aria-label={zh ? '剧情呈现控制' : 'Narrative presentation controls'}>
        {onHome && <button type="button" onClick={onHome}>{zh ? '主页 / 暂停' : 'Home / Suspend'}</button>}
        {onSettings && <button type="button" onClick={onSettings}>{zh ? '设置' : 'Settings'}</button>}
        {onSwitchMode && <button type="button" onClick={onSwitchMode}>{zh ? '切换文字模式' : 'Switch to text'}</button>}
      </nav>}
    </footer>
  </dialog>;
}
