import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';

export default function SideNavIcons({ items, onPick }) {
  return (
    <div className="td-home-sidenav" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'monospace' }}>
      {items.map((it, i) => (
        <GlassPanel key={it.key} accent="#00e5ff" glow={0.12} className="td-home-nav-card"
          style={{ animation: `nav-in 0.5s ${0.1 + i * 0.07}s cubic-bezier(.22,1,.36,1) both` }}>
          <button className="td-ui-button td-home-nav-button" onClick={() => onPick(it.key)}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
              textAlign: 'left', border: 'none', background: 'transparent',
              padding: '10px 12px', borderRadius: 14, transition: 'background 0.22s',
            }}>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
              border: '1px solid rgba(0,229,255,0.45)', fontSize: 15,
              background: 'radial-gradient(circle at 30% 25%, rgba(0,229,255,0.28), rgba(0,20,34,0.85))',
              boxShadow: '0 0 14px rgba(0,229,255,0.3), inset 0 1px 0 rgba(255,255,255,0.18)',
            }}>{it.icon}</span>
            <span>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#cdefff', fontWeight: 700, letterSpacing: '0.06em' }}>{it.label}</span>
              <span style={{ display: 'block', fontSize: '0.53rem', color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>{it.desc}</span>
            </span>
          </button>
        </GlassPanel>
      ))}
      <style>{`@keyframes nav-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
