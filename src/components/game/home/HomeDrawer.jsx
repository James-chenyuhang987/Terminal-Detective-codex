import { useEffect, useRef } from 'react';

export default function HomeDrawer({ title, subtitle, children, onClose, busy = false, width = 620 }) {
  const closeRef = useRef(null);
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);

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
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...(drawerRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <>
      <div onClick={() => !busy && onClose()} style={{
        position: 'fixed', inset: 0, zIndex: 180, background: 'rgba(0,3,8,0.72)', backdropFilter: 'blur(5px)',
      }} />
      <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 181,
        width: `min(${width}px, 100vw)`, display: 'flex', flexDirection: 'column',
        color: '#dff8ff', fontFamily: 'monospace',
        background: 'linear-gradient(160deg, rgba(7,20,34,0.99), rgba(1,5,11,0.99))',
        borderLeft: '1px solid rgba(0,229,255,0.4)',
        boxShadow: '-22px 0 70px rgba(0,0,0,0.75), inset 1px 0 rgba(125,241,255,0.08)',
        animation: 'home-drawer-in .28s cubic-bezier(.22,1,.36,1)',
      }}>
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
          padding: '17px 20px', borderBottom: '1px solid rgba(0,229,255,0.18)',
          background: 'rgba(0,229,255,0.035)',
        }}>
          <div>
            <div style={{ fontSize: '0.94rem', color: '#7df1ff', fontWeight: 900, letterSpacing: '0.13em' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.56rem', color: 'rgba(220,245,255,.4)', marginTop: 5 }}>{subtitle}</div>}
          </div>
          <button ref={closeRef} onClick={onClose} disabled={busy} aria-label="Close" style={{
            border: '1px solid rgba(0,229,255,.25)', borderRadius: 8, padding: '6px 10px',
            background: 'rgba(0,229,255,.06)', color: '#7df1ff', cursor: busy ? 'wait' : 'pointer', fontFamily: 'monospace',
          }}>{busy ? 'SYNC…' : '✕'}</button>
        </header>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '18px 20px 30px',
          pointerEvents: busy ? 'none' : 'auto', opacity: busy ? .72 : 1, transition: 'opacity .2s',
        }}>{children}</div>
        {busy && <div style={{ height: 2, background: 'linear-gradient(90deg,transparent,#00e5ff,transparent)', animation: 'home-sync 1s linear infinite' }} />}
      </aside>
      <style>{`
        @keyframes home-drawer-in{from{transform:translateX(103%);opacity:.4}to{transform:none;opacity:1}}
        @keyframes home-sync{from{transform:translateX(-80%)}to{transform:translateX(80%)}}
        @media(max-width:720px){aside[role="dialog"]{border-left:0!important}}
      `}</style>
    </>
  );
}
