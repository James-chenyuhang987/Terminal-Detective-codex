import React, { useEffect, useId, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon.jsx';

export default function HomeTopbarActions({ actions, onAction, syncLabel, syncColor, buildId, lang }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const instanceId = useId().replaceAll(':', '');
  const menuId = `td-home-actions-menu-${instanceId}`;
  const menuActions = Array.isArray(actions)
    ? actions.filter(action => action && typeof action.key === 'string' && action.key && action.label)
    : [];

  useEffect(() => {
    if (!open || !menuActions.length) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    setActiveIndex(0);
    itemRefs.current[0]?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, menuActions.length]);

  const toggle = () => {
    if (!menuActions.length) return;
    setOpen(value => !value);
  };

  const choose = (key) => {
    setOpen(false);
    onAction?.(key);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const focusItem = (index) => {
    const nextIndex = (index + menuActions.length) % menuActions.length;
    setActiveIndex(nextIndex);
    itemRefs.current[nextIndex]?.focus({ preventScroll: true });
  };

  const handleMenuKeyDown = (event) => {
    if (!menuActions.length) return;
    const currentIndex = Math.max(0, itemRefs.current.indexOf(event.target));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(menuActions.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(menuActions[currentIndex].key);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const handleBlur = (event) => {
    if (!menuRef.current?.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div className="td-home-top-actions" ref={menuRef} onBlur={handleBlur}>
      <button ref={triggerRef} type="button" className="td-ui-button td-home-actions-trigger" aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" aria-label={lang === 'zh' ? '打开快捷操作' : 'Open quick actions'} onClick={toggle} disabled={!menuActions.length}>
        <Icon name="settings" size={18} /><span>{lang === 'zh' ? '操作' : 'ACTIONS'}</span>
      </button>
      {open && <div className="td-home-actions-menu" id={menuId} role="menu" aria-label={lang === 'zh' ? '快捷操作' : 'Quick actions'} onKeyDown={handleMenuKeyDown}>
        {menuActions.map(({ icon, key, label }, index) => (
          <button
            ref={(element) => { itemRefs.current[index] = element; }}
            type="button"
            role="menuitem"
            tabIndex={index === activeIndex ? 0 : -1}
            className="td-home-top-action"
            key={key}
            onFocus={() => setActiveIndex(index)}
            onClick={() => choose(key)}
          >
            <Icon name={icon} size={18} /><span>{label}</span>
          </button>
        ))}
      </div>}
      <span className="td-home-sync-status" style={{ color: syncColor }} title={`${syncLabel} · BUILD ${buildId}`}><Icon name="signal" size={18} label={syncLabel} /> <small>{buildId}</small></span>
    </div>
  );
}
