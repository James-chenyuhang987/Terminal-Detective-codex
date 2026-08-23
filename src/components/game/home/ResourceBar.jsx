import React from 'react';
import { ENERGY_MAX } from '@/game/playerProfile';

const fmt = (n) => (n || 0).toLocaleString('en-US');

export default function ResourceBar({ profile, onPick }) {
  const items = [
    { key: 'supply', icon: '⚡', color: '#ffd34d', val: `${profile.energy}/${ENERGY_MAX}` },
    { key: 'diamonds', icon: '💎', color: '#5fd8ff', val: fmt(profile.diamonds) },
    { key: 'warehouse', icon: '🪙', color: '#e8c98a', val: fmt(profile.gold) },
  ];
  return (
    <div className="td-resource-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'monospace' }}>
      {items.map(it => (
        <div key={it.key} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px 5px 12px',
          border: `1px solid ${it.color}45`, borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(14,26,40,0.8), rgba(0,0,0,0.75))',
          backdropFilter: 'blur(10px)',
          boxShadow: `0 3px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 14px ${it.color}22`,
          fontSize: '0.74rem', color: it.color, fontWeight: 800, letterSpacing: '0.04em',
        }}>
          <span style={{ filter: `drop-shadow(0 0 8px ${it.color})` }}>{it.icon}</span>
          <span style={{ textShadow: `0 0 10px ${it.color}66` }}>{it.val}</span>
          <button onClick={() => onPick(it.key)}
            title={it.key === 'supply' ? '补给中心' : it.key === 'diamonds' ? '钻石来源' : '物品仓库'}
            style={{
              width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center',
              border: `1px solid ${it.color}80`, color: it.color, fontSize: '0.62rem', fontWeight: 900,
              background: `${it.color}22`, cursor: 'pointer',
              boxShadow: `0 0 10px ${it.color}55`, padding: 0,
            }}>+</button>
        </div>
      ))}
    </div>
  );
}
