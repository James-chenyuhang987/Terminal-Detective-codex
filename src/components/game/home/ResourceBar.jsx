import React from 'react';
import { ENERGY_MAX, getEconomySnapshot } from '@/game/playerProfile';
import { useLang } from '@/lib/lang.jsx';

const fmt = (n) => (n || 0).toLocaleString('en-US');

export default function ResourceBar({ profile, onPick }) {
  const { lang } = useLang();
  const economy = getEconomySnapshot(profile);
  const items = [
    { key: 'supply', icon: '⚡', color: '#ffd34d', label: lang === 'zh' ? '体力' : 'ENERGY', val: `${profile.energy}/${ENERGY_MAX}`, progress: Math.min(100, economy.energy.percent) },
    { key: 'diamonds', icon: '💎', color: '#5fd8ff', label: lang === 'zh' ? '钻石' : 'DIAMONDS', val: fmt(profile.diamonds), alert: economy.pendingDiamonds > 0 },
    { key: 'warehouse', icon: '🪙', color: '#e8c98a', label: lang === 'zh' ? '金币' : 'GOLD', val: fmt(profile.gold) },
  ];
  return (
    <div className="td-resource-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'monospace' }}>
      {items.map(it => (
        <div className="td-resource-capsule" key={it.key} style={/** @type {React.CSSProperties & {'--resource-color': string}} */ ({ '--resource-color': it.color })}>
          <span className="td-resource-icon">{it.icon}</span>
          <span className="td-resource-copy"><small>{it.label}</small><strong>{it.val}</strong>{it.progress != null && <i><b style={{ width: `${it.progress}%` }} /></i>}</span>
          {it.alert && <span className="td-resource-alert" title={lang === 'zh' ? '有钻石奖励待领取' : 'Diamond rewards ready'}>●</span>}
          <button onClick={() => onPick(it.key)}
            aria-label={it.key === 'supply' ? (lang === 'zh' ? '打开补给中心' : 'Open supply center') : it.key === 'diamonds' ? (lang === 'zh' ? '查看钻石来源' : 'View diamond sources') : (lang === 'zh' ? '打开物品仓库' : 'Open warehouse')}
            title={it.key === 'supply' ? (lang === 'zh' ? '补给中心' : 'Supply center') : it.key === 'diamonds' ? (lang === 'zh' ? '钻石来源' : 'Diamond sources') : (lang === 'zh' ? '物品仓库' : 'Warehouse')}>＋</button>
        </div>
      ))}
    </div>
  );
}
