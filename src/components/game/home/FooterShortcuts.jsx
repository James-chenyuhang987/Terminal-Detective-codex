import React from 'react';
import Icon from '@/components/ui/Icon.jsx';

export default function FooterShortcuts({ items, onPick }) {
  return (
    <div className="td-home-shortcuts" style={{
      display: 'flex', gap: 8, justifyContent: 'center', fontFamily: 'monospace',
      padding: '8px 14px', borderRadius: 16, width: 'fit-content', margin: '0 auto',
      border: '1px solid rgba(112, 159, 154,0.18)',
      background: 'linear-gradient(180deg, rgba(10,24,38,0.7), rgba(0,0,0,0.75))',
      backdropFilter: 'blur(14px)',
      boxShadow: '0 8px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
    }}>
      {items.map(it => (
        <button className="td-ui-button td-home-shortcut-button" key={it.key} onClick={() => onPick(it.key)}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(112, 159, 154,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 12,
            padding: '8px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 5, position: 'relative', transition: 'background 0.2s',
          }}>
          <Icon name={it.icon} size={21} style={{ color: '#c5a66f' }} />
          <span style={{ fontSize: '0.58rem', color: 'rgba(220,240,255,0.6)', letterSpacing: '0.08em' }}>{it.label}</span>
          {it.alert && <span style={{
            position: 'absolute', top: 4, right: 12, width: 13, height: 13, borderRadius: '50%',
            background: '#c77c78', color: '#fff', fontSize: '0.45rem', display: 'grid',
            placeItems: 'center', fontWeight: 900,
          }}><Icon name="warning" size={10} /></span>}
        </button>
      ))}
    </div>
  );
}
