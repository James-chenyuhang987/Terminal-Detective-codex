import React, { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { normalizeStoryMode } from '@/game/storyMode';
import StoryModeControl from '@/components/game/theater/StoryModeControl';

export default function StoryModeChooser({ initialMode, onConfirm, onCancel, busy = false, error = '' }) {
  const { lang } = useLang();
  const [choice, setChoice] = useState(() => normalizeStoryMode(initialMode));
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    // Native modal dialogs contain keyboard focus and make the landing page inert.
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="td-story-mode-chooser" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); onCancel(); }}
      style={{
        width: 'min(560px, calc(100vw - 28px))', maxHeight: 'calc(100dvh - 32px)',
        margin: 'auto', padding: 'clamp(16px, 4vw, 28px)', overflowY: 'auto',
        border: '1px solid #c5a66f80', borderRadius: 16, color: '#e6dfcf',
        background: 'linear-gradient(155deg, #102333, #040a14)',
        boxShadow: '0 24px 90px #000b', fontFamily: 'monospace',
      }}>
      <form onSubmit={event => { event.preventDefault(); if (!busy) onConfirm(choice); }}>
        <div style={{ color: '#a5c8c0', fontSize: '.65rem', letterSpacing: '.15em' }}>TERMINAL DETECTIVE · STORY MODE</div>
        <h2 id={titleId} style={{ margin: '12px 0', fontSize: 'clamp(1.2rem, 4vw, 1.6rem)' }}>
          {lang === 'zh' ? '选择你的侦探体验' : 'Choose your detective experience'}
        </h2>
        <p id={descriptionId} style={{ color: '#b3c4d6', lineHeight: 1.8, fontSize: '.75rem', margin: '0 0 20px' }}>
          {lang === 'zh'
            ? '3D 场景叙事，或经典终端文字。确认后再读取档案、注册身份或进入主页；之后可在主页和设置中随时切换。'
            : 'Explore a 3D story scene or the classic text terminal. Confirm before loading your profile, registering or entering Home. Switch later from Home or Settings.'}
        </p>
        <StoryModeControl value={choice} onChange={setChoice} disabled={busy} />
        {error && <p role="alert" style={{ color: '#dda29a', fontSize: '.75rem', lineHeight: 1.7 }}>{error}</p>}
        <p role="status" aria-live="polite" style={{ minHeight: 22, margin: '12px 0', color: '#a5c8c0', fontSize: '.7rem' }}>
          {busy ? (lang === 'zh' ? '正在读取侦探档案…' : 'Loading detective profile…') : ''}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="td-ui-button" onClick={onCancel} style={{
            flex: 1, minHeight: 44, padding: 12, border: '1px solid #7aacc566', borderRadius: 8,
            background: 'transparent', color: '#c4d6e7', cursor: 'pointer',
          }}>{lang === 'zh' ? '取消 / 返回' : 'Cancel / Back'}</button>
          <button type="submit" className="td-ui-button td-button-primary" disabled={busy} aria-busy={busy} style={{
            flex: 1, minHeight: 44, padding: 12, borderRadius: 8,
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? .6 : 1,
          }}>{lang === 'zh' ? (error ? '确认并重试' : '确认并继续') : (error ? 'Confirm & retry' : 'Confirm & continue')}</button>
        </div>
      </form>
      <style>{`.td-story-mode-chooser::backdrop{background:rgba(0,4,12,.84);backdrop-filter:blur(6px)}.td-story-mode-chooser :focus-visible,.td-story-mode-control :focus-visible{outline:3px solid #c5a66f;outline-offset:4px}`}</style>
    </dialog>
  );
}
