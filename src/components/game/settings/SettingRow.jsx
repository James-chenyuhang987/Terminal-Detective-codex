import React from 'react';

export function ToggleRow({ skin, label, desc, value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 12px', borderRadius: 9,
      border: `1px solid ${skin.border}`, background: skin.panel,
    }}>
      <div>
        <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{label}</div>
        {desc && <div style={{ fontSize: '0.55rem', color: skin.subText, marginTop: 3 }}>{desc}</div>}
      </div>
      <button type="button" className="td-ui-button" onClick={() => onChange(!value)} aria-label={label} aria-pressed={value} style={{
        flexShrink: 0, width: 44, height: 22, borderRadius: 12, cursor: 'pointer',
        border: `1px solid ${value ? skin.accent : skin.border}`,
        background: value ? `${skin.accent}33` : 'transparent',
        position: 'relative', transition: 'all 0.2s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 23 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: value ? skin.accent : skin.subText,
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}

export function SegmentRow({ skin, label, desc, value, options, onChange }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 9,
      border: `1px solid ${skin.border}`, background: skin.panel,
    }}>
      <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{label}</div>
      {desc && <div style={{ fontSize: '0.55rem', color: skin.subText, margin: '3px 0 8px' }}>{desc}</div>}
      <div role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
        {options.map(o => (
          <button type="button" className="td-ui-button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)} style={{
            flex: 1, padding: '6px 4px', borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${value === o.value ? skin.accent : skin.border}`,
            background: value === o.value ? `${skin.accent}22` : 'transparent',
            color: value === o.value ? skin.accent : skin.subText,
            fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.08em',
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function ActionRow({ skin, label, desc, btnLabel, danger = false, onClick }) {
  const c = danger ? '#c77c78' : skin.accent;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 12px', borderRadius: 9,
      border: `1px solid ${skin.border}`, background: skin.panel,
    }}>
      <div>
        <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{label}</div>
        {desc && <div style={{ fontSize: '0.55rem', color: skin.subText, marginTop: 3 }}>{desc}</div>}
      </div>
      <button type="button" className="td-ui-button" onClick={onClick} style={{
        flexShrink: 0, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
        border: `1px solid ${c}`, background: `${c}18`, color: c,
        fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: '0.1em',
      }}>{btnLabel}</button>
    </div>
  );
}

export function SectionTitle({ skin, children }) {
  return (
    <div style={{
      fontSize: '0.6rem', letterSpacing: '0.2em', color: skin.accent,
      fontWeight: 900, margin: '18px 0 8px',
    }}>{children}</div>
  );
}
