import React from 'react';

export default function FooterShortcuts({ items, onPick }) {
  return (
    <div style={{
      display: 'flex', gap: 8, justifyContent: 'center', fontFamily: 'monospace',
      padding: '8px 14px', borderRadius: 16, width: 'fit-content', margin: '0 auto',
      border: '1px solid rgba(0,229,255,0.18)',
      background: 'linear-gradient(180deg, rgba(10,24,38,0.7), rgba(0,0,0,0.75))',
      backdropFilter: 'blur(14px)',
      boxShadow: '0 8px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
    }}>
      {items.map(it => (
        <button key={it.key} onClick={() => onPick(it.key)}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,255,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 12,
            padding: '8px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 5, position: 'relative', transition: 'background 0.2s',
          }}>
          <span style={{ fontSize: 21, filter: 'drop-shadow(0 0 10px rgba(0,229,255,0.55))' }}>{it.icon}</span>
          <span style={{ fontSize: '0.58rem', color: 'rgba(220,240,255,0.6)', letterSpacing: '0.08em' }}>{it.label}</span>
          {it.alert && <span style={{
            position: 'absolute', top: 4, right: 12, width: 13, height: 13, borderRadius: '50%',
            background: '#ff3860', color: '#fff', fontSize: '0.45rem', display: 'grid',
            placeItems: 'center', fontWeight: 900, boxShadow: '0 0 10px #ff3860',
            animation: 'fs-pulse 1.6s ease-in-out infinite',
          }}>!</span>}
        </button>
      ))}
      <style>{`@keyframes fs-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}`}</style>
    </div>
  );
}