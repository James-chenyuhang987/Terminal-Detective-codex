import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function HomeDrawer({ title, subtitle, children, onClose, busy = false, width = 620 }) {
  const closeRef = useRef(null);
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (busy || closing) return;
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(onClose, 190);
  }, [busy, closing, onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.clearTimeout(closeTimerRef.current);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') requestClose();
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
  }, [requestClose]);

  const drawer = (
    <div className={`td-home-drawer-layer ${closing ? 'is-closing' : ''}`}>
      <div className="td-drawer-backdrop" onClick={requestClose} />
      <aside className="td-home-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} style={{ width: `min(${width}px, 100vw)` }}>
        <header className="td-home-drawer-header">
          <div>
            <div className="td-home-drawer-title">{title}</div>
            {subtitle && <div className="td-home-drawer-subtitle">{subtitle}</div>}
          </div>
          <button className="td-ui-button td-icon-button td-home-drawer-close" ref={closeRef} onClick={requestClose} disabled={busy} aria-label="Close">{busy ? 'SYNC…' : '✕'}</button>
        </header>
        <div className="td-home-drawer-content" style={{ pointerEvents: busy ? 'none' : 'auto', opacity: busy ? .72 : 1 }}>{children}</div>
        {busy && <div className="td-home-drawer-sync" />}
      </aside>
    </div>
  );

  return typeof document === 'undefined' ? drawer : createPortal(drawer, document.body);
}
