import React from 'react';

// 轻量探员档案 Tooltip — position:fixed，避免被父容器裁切
export default function AgentLoreTooltip({ lore, color, icon, roleZh, x, y }) {
  if (!lore) return null;
  const left = Math.min(x + 16, window.innerWidth - 280);
  const top = Math.min(Math.max(y - 40, 12), window.innerHeight - 200);

  return (
    <div style={{
      position: 'fixed', left, top, width: 258, zIndex: 90,
      pointerEvents: 'none', fontFamily: 'monospace',
      border: `1px solid ${color}70`, borderRadius: 12,
      background: 'rgba(2,8,20,0.82)', backdropFilter: 'blur(14px)',
      boxShadow: `0 0 26px ${color}30, inset 0 0 24px ${color}08`,
      padding: '11px 13px',
      animation: 'lore-tip-in 0.16s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <div>
          <div style={{ fontSize: '0.64rem', fontWeight: 900, color, letterSpacing: '0.06em', textShadow: `0 0 10px ${color}80` }}>
            {lore.id}
          </div>
          <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.35)' }}>{roleZh}</div>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: '0.4rem', color,
          border: `1px solid ${color}50`, borderRadius: 3,
          padding: '1px 5px', background: `${color}12`,
        }}>{lore.personality}</span>
      </div>

      <div style={{
        fontSize: '0.48rem', color: `${color}dd`, lineHeight: 1.7,
        borderLeft: `2px solid ${color}60`, paddingLeft: 7, margin: '7px 0',
      }}>{lore.quote}</div>

      <div style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>
        {lore.summary}
      </div>

      <div style={{ marginTop: 7, fontSize: '0.4rem', color: 'rgba(255,255,255,0.25)' }}>
        点击查看完整档案 →
      </div>

      <style>{`@keyframes lore-tip-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}