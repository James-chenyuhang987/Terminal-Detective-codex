import React from 'react';
import {
  AGENT_SPECIALTIES, ATTR_META, SPECIALTY_BUDGET,
  specUsed, specRemaining, effectiveAttrs, maxBonusFor, ATTR_MAX,
} from '@/game/specialtySystem';

// 专长槽属性面板 — 基础属性只读 + 专长方向内分配 20 点
function SpecAttrRow({ meta, base, bonus, isSpecialty, locked, maxBonus, onChange }) {
  const color = meta.color;
  const cap = ATTR_MAX[meta.key];
  const effective = Math.min(base + bonus, cap);
  const canInc = isSpecialty && !locked && bonus < maxBonus;
  const canDec = isSpecialty && bonus > 0;
  const disabled = !isSpecialty || (locked && bonus === 0);

  const btn = (enabled, onClick, symbol) => (
    <button onClick={enabled ? onClick : undefined} style={{
      width: 22, height: 22, borderRadius: 5,
      border: `1px solid ${enabled ? color + '60' : 'rgba(255,255,255,0.08)'}`,
      background: enabled ? `${color}18` : 'rgba(255,255,255,0.02)',
      color: enabled ? color : 'rgba(255,255,255,0.15)',
      cursor: enabled ? 'pointer' : 'not-allowed',
      fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1, flexShrink: 0, userSelect: 'none',
    }}>{symbol}</button>
  );

  return (
    <div style={{ marginBottom: 13, opacity: disabled && !isSpecialty ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div>
          <div style={{ fontSize: '0.48rem', fontWeight: 700, color, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            {meta.label}
            {!isSpecialty && <span style={{ marginLeft: 5, fontSize: '0.4rem', color: 'rgba(255,255,255,0.25)' }}>🔒 职业固定</span>}
            {isSpecialty && <span style={{ marginLeft: 5, fontSize: '0.4rem', color: color + '90' }}>◆ 专长方向</span>}
          </div>
          <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{meta.labelZh}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isSpecialty && btn(canDec, () => onChange(bonus - 1), '−')}
          <div style={{ minWidth: 52, textAlign: 'center', fontFamily: 'monospace' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 900, color, textShadow: `0 0 6px ${color}70` }}>
              {meta.isPercent ? `${effective}%` : effective}
            </span>
            {isSpecialty && bonus > 0 && (
              <span style={{ fontSize: '0.44rem', color: '#00ff88', marginLeft: 3 }}>+{bonus}</span>
            )}
          </div>
          {isSpecialty && btn(canInc, () => onChange(bonus + 1), '+')}
        </div>
      </div>
      {/* Track: base segment + bonus segment */}
      <div style={{ position: 'relative', height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${(base / cap) * 100}%`,
          background: `linear-gradient(to right, ${color}40, ${color}80)`,
        }} />
        {isSpecialty && bonus > 0 && (
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            left: `${(base / cap) * 100}%`,
            width: `${(bonus / cap) * 100}%`,
            background: 'linear-gradient(to right, #00ff8880, #00ff88)',
            boxShadow: '0 0 8px #00ff8880',
          }} />
        )}
      </div>
    </div>
  );
}

export default function SpecialtyAttrPanel({ agentIdx, spec, onSpecChange, agentColor }) {
  const def = AGENT_SPECIALTIES[agentIdx];
  const used = specUsed(spec);
  const remaining = specRemaining(spec);
  const locked = remaining === 0;
  const attrs = effectiveAttrs(agentIdx, spec);

  return (
    <div>
      {/* 专长点余额 counter */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', marginBottom: 12, borderRadius: 10,
        border: `1px solid ${locked ? '#ff386050' : agentColor + '40'}`,
        background: locked ? 'rgba(255,56,96,0.06)' : `${agentColor}08`,
        transition: 'all 0.3s',
      }}>
        <div style={{ fontFamily: 'monospace' }}>
          <div style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>专长点余额 · SPEC POINTS</div>
          <div style={{ fontSize: '0.4rem', color: locked ? '#ff3860' : 'rgba(255,255,255,0.25)', marginTop: 2 }}>
            {locked ? '余额耗尽 — 减点后方可再分配' : '仅可强化本职业的专长方向'}
          </div>
        </div>
        <div style={{
          fontSize: '1.5rem', fontWeight: 900, fontFamily: 'monospace',
          color: locked ? '#ff3860' : '#00ff88',
          textShadow: `0 0 14px ${locked ? '#ff3860' : '#00ff88'}80`,
        }}>
          {remaining}<span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>/{SPECIALTY_BUDGET}</span>
        </div>
      </div>

      {/* budget bar */}
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginBottom: 14 }}>
        <div style={{
          height: '100%', borderRadius: 2, width: `${(used / SPECIALTY_BUDGET) * 100}%`,
          background: locked ? 'linear-gradient(to right, #ff6600, #ff3860)' : 'linear-gradient(to right, #00ff8880, #00ff88)',
          boxShadow: `0 0 6px ${locked ? '#ff3860' : '#00ff88'}`,
          transition: 'width 0.2s ease, background 0.3s',
        }} />
      </div>

      {ATTR_META.map(meta => {
        const isSpecialty = def.specialty_slots.includes(meta.key);
        return (
          <SpecAttrRow
            key={meta.key}
            meta={meta}
            base={def.base_attrs[meta.key]}
            bonus={isSpecialty ? (spec?.[meta.key] || 0) : 0}
            isSpecialty={isSpecialty}
            locked={locked}
            maxBonus={maxBonusFor(agentIdx, spec, meta.key)}
            onChange={(v) => onSpecChange({ ...spec, [meta.key]: Math.max(0, v) })}
          />
        );
      })}

      {/* effective summary hidden hook for radar consumers */}
      <div style={{ display: 'none' }}>{JSON.stringify(attrs)}</div>
    </div>
  );
}