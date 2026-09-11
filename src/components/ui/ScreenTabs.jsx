import React from 'react';

export default function ScreenTabs({ id, label, tabs, value, onChange, className = '' }) {
  const handleKey = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].key);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
  };

  return (
    <div className={`td-screen-tabs ${className}`} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button key={tab.key} id={`${id}-tab-${tab.key}`} type="button" role="tab"
          aria-selected={value === tab.key} aria-controls={`${id}-panel-${tab.key}`}
          tabIndex={value === tab.key ? 0 : -1}
          onClick={() => onChange(tab.key)} onKeyDown={event => handleKey(event, index)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
