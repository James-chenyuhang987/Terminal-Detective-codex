import React from 'react';

// 全息玻璃面板：四角切角描边 + 内发光 + 顶部高光
export default function GlassPanel({ children, accent = '#00e5ff', style = {}, onClick = undefined, glow = 0.22, className = '' }) {
  return (
    <div className={`td-glass-panel ${onClick ? 'td-interactive-card' : ''} ${className}`.trim()} onClick={onClick} style={{
      position: 'relative', borderRadius: 14,
      border: `1px solid ${accent}3d`,
      background: 'linear-gradient(158deg, rgba(12,26,40,0.72) 0%, rgba(4,8,14,0.82) 100%)',
      backdropFilter: 'blur(14px) saturate(150%)',
      WebkitBackdropFilter: 'blur(14px) saturate(150%)',
      boxShadow: `0 10px 34px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 26px ${accent}${Math.round(glow * 100).toString(16).padStart(2, '0')}`,
      ...style,
    }}>
      {[
        { top: -1, left: -1, borderTop: `2px solid ${accent}`, borderLeft: `2px solid ${accent}`, borderRadius: '14px 0 0 0' },
        { top: -1, right: -1, borderTop: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderRadius: '0 14px 0 0' },
        { bottom: -1, left: -1, borderBottom: `2px solid ${accent}`, borderLeft: `2px solid ${accent}`, borderRadius: '0 0 0 14px' },
        { bottom: -1, right: -1, borderBottom: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderRadius: '0 0 14px 0' },
      ].map((s, i) => (
        <span key={i} style={{ position: 'absolute', width: 13, height: 13, opacity: 0.75, pointerEvents: 'none', ...s }} />
      ))}
      {children}
    </div>
  );
}
