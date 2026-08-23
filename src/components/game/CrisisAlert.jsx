import React, { useState, useEffect } from 'react';

// 危机事件全屏警报 — 橙红警报覆盖层（BSoD 级视觉强度）
export default function CrisisAlert({ event, onChoose }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 40%, rgba(80,20,0,0.96) 0%, rgba(30,5,0,0.98) 80%)',
      fontFamily: 'monospace',
      animation: 'ca-bg-in 0.25s ease both',
    }}>
      {/* Alarm stripes */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.12,
        backgroundImage: 'repeating-linear-gradient(45deg, #ff5500 0 24px, transparent 24px 48px)',
        animation: 'ca-stripes 1.5s linear infinite',
      }} />
      {/* Pulsing border */}
      <div style={{
        position: 'absolute', inset: 10, pointerEvents: 'none',
        border: '2px solid #ff550080', borderRadius: 8,
        animation: 'ca-border 0.8s ease-in-out infinite',
      }} />

      <div style={{
        position: 'relative', width: 580, maxWidth: '92vw',
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'scale(0.92)',
        transition: 'all 0.35s cubic-bezier(.22,1,.36,1)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: '2.6rem', animation: 'ca-icon 0.7s ease-in-out infinite alternate' }}>{event.icon}</div>
          <div style={{
            fontSize: '1.15rem', fontWeight: 900, color: '#ff6600',
            letterSpacing: '0.2em', textShadow: '0 0 24px #ff660090',
            animation: 'ca-flicker 2s steps(2) infinite',
          }}>
            ⚠ {event.title}
          </div>
          <div style={{ fontSize: '0.48rem', color: '#ff995580', letterSpacing: '0.35em', marginTop: 4 }}>
            CRISIS EVENT · IMMEDIATE RESPONSE REQUIRED
          </div>
        </div>

        {/* Description */}
        <div style={{
          padding: '14px 18px', borderRadius: 10, marginBottom: 18,
          border: '1px solid #ff550050', background: 'rgba(255,85,0,0.07)',
          color: '#ffd9c2', fontSize: '0.66rem', lineHeight: 1.9,
        }}>
          {event.desc}
        </div>

        {/* Choices */}
        <div style={{ display: 'flex', gap: 10 }}>
          {event.choices.map((c, i) => (
            <button key={c.id} onClick={() => onChoose(c.id)} style={{
              flex: 1, padding: '14px 12px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${c.riskColor}55`,
              background: `${c.riskColor}0c`,
              fontFamily: 'monospace', textAlign: 'center',
              transition: 'all 0.15s',
              animation: `ca-choice-in 0.3s ${0.15 + i * 0.08}s ease both`,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = `${c.riskColor}22`; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 0 20px ${c.riskColor}40`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${c.riskColor}0c`; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{
                display: 'inline-block', fontSize: '0.42rem', fontWeight: 900, color: c.riskColor,
                border: `1px solid ${c.riskColor}60`, borderRadius: 4, padding: '1px 7px',
                marginBottom: 6, background: `${c.riskColor}15`,
              }}>{c.risk}</div>
              <div style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 900, marginBottom: 5 }}>{c.label}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.48rem', lineHeight: 1.6 }}>{c.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ca-bg-in { from{opacity:0} to{opacity:1} }
        @keyframes ca-stripes { from{background-position:0 0} to{background-position:68px 0} }
        @keyframes ca-border { 0%,100%{opacity:0.9;box-shadow:0 0 30px #ff550040 inset} 50%{opacity:0.3;box-shadow:0 0 10px #ff550020 inset} }
        @keyframes ca-icon { from{transform:scale(1)} to{transform:scale(1.15)} }
        @keyframes ca-flicker { 0%,90%{opacity:1} 95%{opacity:0.5} 100%{opacity:1} }
        @keyframes ca-choice-in { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
      `}</style>
    </div>
  );
}