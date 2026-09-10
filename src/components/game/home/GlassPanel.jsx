import React from 'react';
import { noirColor } from '@/components/ui/palette.js';

export default function GlassPanel({ children, accent: sourceAccent = '#709f9a', style = {}, onClick = undefined, glow = 0.08, className = '' }) {
  const accent = noirColor(sourceAccent);
  return (
    <div className={`td-glass-panel ${onClick ? 'td-interactive-card' : ''} ${className}`.trim()} onClick={onClick} style={{
      position: 'relative', borderRadius: 14,
      border: `1px solid ${accent}3d`,
      background: 'linear-gradient(158deg, rgba(12,26,40,0.72) 0%, rgba(4,8,14,0.82) 100%)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      boxShadow: `0 12px 30px rgba(0,0,0,.3), inset 0 1px 0 ${accent}${Math.round(Math.min(.12, Math.max(0, glow)) * 255).toString(16).padStart(2, '0')}`,
      ...style,
    }}>
      {[
        { top: -1, left: -1, borderTop: `2px solid ${accent}`, borderLeft: `2px solid ${accent}`, borderRadius: '14px 0 0 0' },
        { top: -1, right: -1, borderTop: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderRadius: '0 14px 0 0' },
        { bottom: -1, left: -1, borderBottom: `2px solid ${accent}`, borderLeft: `2px solid ${accent}`, borderRadius: '0 0 0 14px' },
        { bottom: -1, right: -1, borderBottom: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderRadius: '0 0 14px 0' },
      ].map((s, i) => (
        <span key={i} aria-hidden="true" style={{ position: 'absolute', width: 10, height: 10, opacity: 0.35, pointerEvents: 'none', ...s }} />
      ))}
      {children}
    </div>
  );
}
