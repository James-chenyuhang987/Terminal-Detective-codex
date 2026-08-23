import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';

export default function InfoCard({ title, alert = false, big = undefined, unit = '', desc = '', btnLabel, icon, onClick }) {
  return (
    <GlassPanel accent="#00e5ff" style={{ padding: '13px 15px', fontFamily: 'monospace' }}>
      {/* 标题条 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 8, marginBottom: 10,
        borderBottom: '1px solid rgba(0,229,255,0.15)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#f0d9a5', fontWeight: 900, letterSpacing: '0.12em' }}>
          <span style={{ width: 3, height: 13, background: '#c5a059', boxShadow: '0 0 8px #c5a059', borderRadius: 2 }} />
          {icon} {title}
        </span>
        {alert && <span style={{
          width: 15, height: 15, borderRadius: '50%', background: '#ff3860', flexShrink: 0,
          color: '#fff', fontSize: '0.5rem', display: 'grid', placeItems: 'center', fontWeight: 900,
          boxShadow: '0 0 10px #ff3860', animation: 'alert-pulse 1.6s ease-in-out infinite',
        }}>!</span>}
      </div>

      {big !== undefined && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{
            fontSize: '1.7rem', fontWeight: 900, lineHeight: 1,
            background: 'linear-gradient(180deg, #ffffff, #00e5ff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 12px rgba(0,229,255,0.6))',
          }}>{big}</span>
          <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.42)' }}>{unit}</span>
        </div>
      )}
      {desc && <div style={{ fontSize: '0.6rem', color: 'rgba(220,235,255,0.5)', lineHeight: 1.7, marginTop: 6 }}>{desc}</div>}

      <button onClick={onClick}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,255,0.18)'; e.currentTarget.style.color = '#dffaff'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,229,255,0.06)'; e.currentTarget.style.color = 'rgba(0,229,255,0.85)'; }}
        style={{
          marginTop: 11, width: '100%', padding: '7px', cursor: 'pointer', borderRadius: 8,
          border: '1px solid rgba(0,229,255,0.35)', background: 'rgba(0,229,255,0.06)',
          color: 'rgba(0,229,255,0.85)', fontFamily: 'monospace', fontSize: '0.6rem',
          letterSpacing: '0.12em', transition: 'all 0.22s',
        }}>
        {btnLabel} ›
      </button>
      <style>{`@keyframes alert-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:.75}}`}</style>
    </GlassPanel>
  );
}
