import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';
import Icon from '@/components/ui/Icon.jsx';

export default function InfoCard({ title, alert = false, big = undefined, unit = '', desc = '', btnLabel, icon, onClick }) {
  return (
    <GlassPanel accent="#709f9a" className="td-home-info-card" style={{ padding: '13px 15px', fontFamily: 'monospace' }}>
      {/* 标题条 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 8, marginBottom: 10,
        borderBottom: '1px solid rgba(112, 159, 154,0.15)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#e1d0ac', fontWeight: 900, letterSpacing: '0.12em' }}>
          <Icon name={icon} size={17} /> {title}
        </span>
        {alert && <span style={{
          width: 15, height: 15, borderRadius: '50%', background: '#c77c78', flexShrink: 0,
          color: '#fff', fontSize: '0.5rem', display: 'grid', placeItems: 'center', fontWeight: 900,
        }}><Icon name="warning" size={11} /></span>}
      </div>

      {big !== undefined && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{
            fontSize: '1.7rem', fontWeight: 900, lineHeight: 1,
            color: '#e6dfcf',
          }}>{big}</span>
          <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.42)' }}>{unit}</span>
        </div>
      )}
      {desc && <div style={{ fontSize: '0.6rem', color: 'rgba(220,235,255,0.5)', lineHeight: 1.7, marginTop: 6 }}>{desc}</div>}

      <button className="td-ui-button td-button-secondary td-home-info-action" onClick={onClick}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(112, 159, 154,0.18)'; e.currentTarget.style.color = '#e6dfcf'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(112, 159, 154,0.06)'; e.currentTarget.style.color = 'rgba(112, 159, 154,0.85)'; }}
        style={{
          marginTop: 11, width: '100%', padding: '7px', cursor: 'pointer', borderRadius: 8,
          border: '1px solid rgba(112, 159, 154,0.35)', background: 'rgba(112, 159, 154,0.06)',
          color: 'rgba(112, 159, 154,0.85)', fontFamily: 'monospace', fontSize: '0.6rem',
          letterSpacing: '0.12em', transition: 'all 0.22s',
        }}>
        {btnLabel} <Icon name="file" />
      </button>
    </GlassPanel>
  );
}
