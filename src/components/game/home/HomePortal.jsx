import React from 'react';
import { useLang } from '@/lib/lang.jsx';

export default function HomePortal({ onEnter }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  return (
    <div className="td-ui-card td-home-portal" style={{
      position: 'relative', width: '100%', maxWidth: 350, padding: '22px 20px 18px',
      border: '1px solid rgba(0,229,255,0.45)', borderRadius: 20, textAlign: 'center',
      background: 'linear-gradient(180deg, rgba(0,72,110,0.42) 0%, rgba(0,14,28,0.9) 100%)',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 0 70px rgba(0,229,255,0.28), inset 0 0 70px rgba(0,229,255,0.07), 0 20px 50px rgba(0,0,0,0.6)',
      fontFamily: 'monospace', overflow: 'hidden',
    }}>
      {/* 顶部扫描光带 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 2,
        background: 'linear-gradient(to right, transparent, #7df1ff, transparent)',
        boxShadow: '0 0 18px #00e5ff', animation: 'portal-scan 3.4s linear infinite',
      }} />

      <div style={{
        fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.14em',
        background: 'linear-gradient(180deg, #ffffff, #6ee8ff)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        filter: 'drop-shadow(0 0 16px rgba(0,229,255,0.8))',
      }}>
        {zh ? '全息探员大厅' : 'HOLOGRAPHIC AGENT HALL'} 🔍
      </div>
      <div style={{ fontSize: '0.62rem', color: 'rgba(200,235,255,0.5)', marginTop: 8, letterSpacing: '0.05em' }}>
        {zh ? '进入全息探员市场，签约支援成员并管理编队' : 'Recruit support agents and manage your investigation squad'}
      </div>

      {/* 全息拱门 + 侦探剪影 */}
      <div style={{ position: 'relative', height: 200, margin: '18px 0 14px' }}>
        {/* 地面光台 */}
        <div style={{
          position: 'absolute', left: '50%', bottom: -4, transform: 'translateX(-50%)',
          width: 230, height: 34, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(0,229,255,0.4) 0%, transparent 70%)',
          animation: 'portal-pulse 2.8s ease-in-out infinite',
        }} />
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)',
            width: 200 - i * 32, height: 186 - i * 29,
            borderRadius: '50% 50% 0 0 / 62% 62% 0 0',
            border: `1px solid rgba(125,241,255,${0.55 - i * 0.09})`,
            boxShadow: `0 0 26px rgba(0,229,255,${0.3 - i * 0.05}), inset 0 0 30px rgba(0,229,255,${0.12 - i * 0.02})`,
            animation: `portal-pulse ${2.4 + i * 0.4}s ease-in-out ${i * 0.22}s infinite`,
          }} />
        ))}
        {/* 门内光幕 */}
        <div style={{
          position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)',
          width: 130, height: 150, borderRadius: '50% 50% 0 0 / 55% 55% 0 0',
          background: 'linear-gradient(180deg, rgba(0,229,255,0.32), rgba(0,120,180,0.1))',
          filter: 'blur(1px)',
        }} />
        {/* 侦探剪影 */}
        <div style={{ position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', filter: 'drop-shadow(0 0 26px rgba(0,229,255,0.85))' }}>
          <svg width="66" height="120" viewBox="0 0 66 120">
            <g fill="#02121c">
              <ellipse cx="33" cy="14" rx="9" ry="10" />
              <ellipse cx="33" cy="9" rx="19" ry="4" />
              <rect x="30" y="23" width="6" height="8" />
              <path d="M33 30 C18 32 13 46 12 66 L12 112 L54 112 L54 66 C53 46 48 32 33 30 Z" />
            </g>
          </svg>
        </div>
      </div>

      <button className="td-ui-button td-button-primary td-home-portal-button" onClick={onEnter}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0,229,255,0.7)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 0 22px rgba(0,229,255,0.35)'; }}
        style={{
          width: '100%', padding: '13px', cursor: 'pointer', borderRadius: 12,
          border: '1px solid rgba(125,241,255,0.75)',
          background: 'linear-gradient(180deg, rgba(0,229,255,0.26), rgba(0,120,180,0.12))',
          color: '#e6fbff', fontFamily: 'monospace', fontWeight: 900,
          letterSpacing: '0.24em', fontSize: '0.88rem', textShadow: '0 0 14px #00e5ff',
          boxShadow: '0 0 22px rgba(0,229,255,0.35)', transition: 'all 0.24s',
        }}>
        {zh ? '进入探员市场' : 'ENTER AGENT MARKET'} ≫
      </button>
      <div style={{ fontSize: '0.5rem', color: 'rgba(200,235,255,0.3)', marginTop: 9, letterSpacing: '0.24em' }}>
        — {zh ? '探员交换站' : 'AGENT EXCHANGE'} —
      </div>
      <style>{`
        @keyframes portal-pulse{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes portal-scan{0%{top:0}100%{top:100%}}
      `}</style>
    </div>
  );
}
