import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/lib/lang.jsx';
import Icon, { IconText } from '@/components/ui/Icon.jsx';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion.js';

const drawerStack = [];
let originalOverflow = '';

function syncDrawerStack() {
  drawerStack.forEach((layer, index) => {
    layer.inert = index !== drawerStack.length - 1;
    layer.style.zIndex = String(180 + index);
  });
}

function canRestoreFocus(element) {
  return element?.isConnected && element.getClientRects().length
    && !element.closest('[inert], [hidden], [disabled]')
    && window.getComputedStyle(element).visibility !== 'hidden';
}

export default function HomeDrawer({ title, subtitle, icon = undefined, children, onClose, busy = false, width = 620, className = '', returnFocusRef = undefined }) {
  const { lang } = useLang();
  const { motionEnabled, reducedMotion, foreground } = usePresentationMotion();
  const closeRef = useRef(null);
  const drawerRef = useRef(null);
  const layerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (busy || closing) return;
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(onClose, motionEnabled ? 190 : 0);
  }, [busy, closing, onClose, motionEnabled]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const layer = layerRef.current;
    if (!drawerStack.length) originalOverflow = document.body.style.overflow;
    drawerStack.push(layer);
    syncDrawerStack();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      window.clearTimeout(closeTimerRef.current);
      const wasTop = drawerStack.at(-1) === layer;
      drawerStack.splice(drawerStack.indexOf(layer), 1);
      syncDrawerStack();
      if (!drawerStack.length) document.body.style.overflow = originalOverflow;
      if (wasTop) {
        const target = [
          previousFocusRef.current,
          returnFocusRef?.current,
          drawerStack.at(-1)?.querySelector('.td-home-drawer-close'),
          ...Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')),
        ].find(canRestoreFocus);
        target?.focus?.({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (drawerStack.at(-1) !== layerRef.current || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(drawerRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || [])].filter(canRestoreFocus);
      if (!focusable.length) {
        event.preventDefault();
        drawerRef.current?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!drawerRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
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
    <div ref={layerRef} className={`td-home-drawer-layer ${closing ? 'is-closing' : ''}`} data-td-motion={motionEnabled ? 'active' : 'paused'}>
      <div className="td-drawer-backdrop" onClick={requestClose} />
      <aside className={`td-home-drawer ${className}`.trim()} ref={drawerRef} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} tabIndex={-1}
        data-motion-reduced={reducedMotion} data-motion-paused={!foreground} style={{ width: `min(${width}px, 100vw)` }}>
        <header className="td-home-drawer-header">
          <div>
            <div className="td-home-drawer-title">{icon && <Icon name={icon} size={20} />} <IconText text={title} /></div>
            {subtitle && <div className="td-home-drawer-subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="td-ui-button td-icon-button td-home-drawer-close" ref={closeRef}
            onClick={requestClose} disabled={busy}
            aria-label={lang === 'zh' ? '关闭面板' : 'Close panel'}
            title={lang === 'zh' ? '关闭' : 'Close'}>{busy ? <Icon name="refresh" size={18} /> : <Icon name="close" size={18} />}</button>
        </header>
        <div className="td-home-drawer-content" style={{ pointerEvents: busy ? 'none' : 'auto', opacity: busy ? .72 : 1 }}>{children}</div>
        {busy && <div className="td-home-drawer-sync" />}
      </aside>
    </div>
  );

  return typeof document === 'undefined' ? drawer : createPortal(drawer, document.body);
}
