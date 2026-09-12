import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import HomeDrawer from '@/components/game/home/HomeDrawer';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon.jsx';

export default function FittedPanel({ id, labelledBy, title, summary, children, className = '', contentClassName = '', theme = 'default', icon = 'file' }) {
  const { lang } = useLang();
  const panelRef = useRef(null);
  const inlineRef = useRef(null);
  const detailRef = useRef(null);
  const buttonRef = useRef(null);
  const focusOnCondense = useRef(false);
  const [condensed, setCondensed] = useState(false);
  const [open, setOpen] = useState(false);
  const [host] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));

  // A stable portal host preserves form drafts, effects and IDs when moving into the drawer.
  useLayoutEffect(() => {
    if (!host) return undefined;
    (open ? detailRef.current : inlineRef.current)?.appendChild(host);
    return () => { host.remove(); };
  }, [host, open]);

  useLayoutEffect(() => {
    const inline = inlineRef.current;
    if (!inline) return undefined;
    if (condensed) inline.setAttribute('inert', '');
    else inline.removeAttribute('inert');
    return undefined;
  }, [condensed]);

  useLayoutEffect(() => {
    if (!host || open) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const measure = () => {
      if (!panel.clientWidth || !panel.clientHeight || !host.getClientRects().length) return;
      const overflow = host.scrollHeight > panel.clientHeight + 1 || host.scrollWidth > panel.clientWidth + 1;
      if (overflow && host.contains(document.activeElement)) focusOnCondense.current = true;
      setCondensed(previous => previous === overflow ? previous : overflow);
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(panel);
    observer?.observe(host);
    const mutations = typeof MutationObserver === 'function' ? new MutationObserver(measure) : null;
    mutations?.observe(host, { childList: true, characterData: true, subtree: true });
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
      mutations?.disconnect();
    };
  }, [host, open]);

  useLayoutEffect(() => {
    if (condensed && focusOnCondense.current) buttonRef.current?.focus({ preventScroll: true });
    focusOnCondense.current = false;
  }, [condensed]);

  const content = <div className={`td-fit-panel-content ${contentClassName}`.trim()}>{children}</div>;
  return (
    <section ref={panelRef} id={id} role="tabpanel" aria-labelledby={labelledBy} tabIndex={-1}
      className={`td-fit-panel ${condensed ? 'is-condensed' : ''} ${className}`.trim()}>
      <div ref={inlineRef} className="td-fit-panel-inline" aria-hidden={condensed || undefined}>
        {!host && content}
      </div>
      {host && createPortal(content, host)}
      {condensed && <div className="td-fit-panel-summary">
        <h2><Icon name={icon} /> {title}</h2>
        <div className="td-fit-panel-excerpt">{summary}</div>
        <button ref={buttonRef} type="button" className="td-ui-button td-fit-panel-open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="file" /> {lang === 'zh' ? '展开完整内容' : 'OPEN FULL CONTENT'}
          <span className="td-visually-hidden"> · {title}</span>
        </button>
      </div>}
      {open && <HomeDrawer title={title} subtitle={lang === 'zh' ? '完整档案 · 可在此面板内滚动查看' : 'FULL DOSSIER · SCROLL WITHIN THIS PANEL'} icon={icon}
        className={theme === 'landing' ? 'td-landing td-home-drawer--landing' : ''}
        onClose={() => setOpen(false)} returnFocusRef={panelRef} width={760}>
        <div ref={detailRef} className="td-fit-panel-detail" />
      </HomeDrawer>}
    </section>
  );
}
