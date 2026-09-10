import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';
import Icon from '@/components/ui/Icon.jsx';

export default function SideNavIcons({ items, onPick }) {
  return (
    <div className="td-home-sidenav" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'monospace' }}>
      {items.map(it => (
        <GlassPanel key={it.key} accent="#709f9a" glow={0.08} className="td-home-nav-card">
          <button className="td-ui-button td-home-nav-button" onClick={() => onPick(it.key)}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(112, 159, 154,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
              textAlign: 'left', border: 'none', background: 'transparent',
              padding: '10px 12px', borderRadius: 14, transition: 'background 0.22s',
            }}>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
              border: '1px solid rgba(112, 159, 154,0.45)', fontSize: 15,
              background: 'radial-gradient(circle at 30% 25%, rgba(112, 159, 154,0.28), rgba(0,20,34,0.85))',
              color: '#a5c8c0', boxShadow: 'inset 0 1px 0 rgba(230,223,207,.08)',
            }}><Icon name={it.icon} size={18} /></span>
            <span>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#cdefff', fontWeight: 700, letterSpacing: '0.06em' }}>{it.label}</span>
              <span style={{ display: 'block', fontSize: '0.53rem', color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>{it.desc}</span>
            </span>
          </button>
        </GlassPanel>
      ))}
    </div>
  );
}
