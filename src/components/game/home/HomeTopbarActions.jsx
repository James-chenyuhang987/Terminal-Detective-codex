import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon.jsx';

export default function HomeTopbarActions({ actions, onAction, syncLabel, syncColor, buildId, lang }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const firstItemRef = useRef(null);
  const menuId = 'td-home-actions-menu';

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    firstItemRef.current?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = () => setOpen(value => !value);
  const choose = (key) => {
    setOpen(false);
    onAction(key);
    triggerRef.current?.focus();
  };

  return (
    <div className="td-home-top-actions" ref={menuRef}>
      <button ref={triggerRef} type="button" className="td-ui-button td-home-actions-trigger" aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" aria-label={lang === 'zh' ? '打开快捷操作' : 'Open quick actions'} onClick={toggle}>
        <Icon name="settings" size={18} /><span>{lang === 'zh' ? '操作' : 'ACTIONS'}</span>
      </button>
      {open && <div className="td-home-actions-menu" id={menuId} role="menu" aria-label={lang === 'zh' ? '快捷操作' : 'Quick actions'}>
        {actions.map(({ icon, key, label }, index) => (
          <button ref={index === 0 ? firstItemRef : null} type="button" role="menuitem" className="td-home-top-action" key={key} onClick={() => choose(key)}>
            <Icon name={icon} size={18} /><span>{label}</span>
          </button>
        ))}
      </div>}
      <span className="td-home-sync-status" style={{ color: syncColor }} title={`${syncLabel} · BUILD ${buildId}`}><Icon name="signal" size={18} label={syncLabel} /> <small>{buildId}</small></span>
    </div>
  );
}
