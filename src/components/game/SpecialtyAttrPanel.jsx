import { noirColor } from '@/components/ui/palette';
import { IconText } from '@/components/ui/Icon';
import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import {
  AGENT_SPECIALTIES, ATTR_META, SPECIALTY_BUDGET,
  specUsed, specRemaining, effectiveAttrs, maxBonusFor, ATTR_MAX,
} from '@/game/specialtySystem';

// 专长槽属性面板 — 基础属性只读 + 专长方向内分配 20 点
function SpecAttrRow({ meta, base, bonus, isSpecialty, locked, maxBonus, onChange }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const color = noirColor(meta.color);
  const cap = ATTR_MAX[meta.key];
  const effective = Math.min(base + bonus, cap);
  const canInc = isSpecialty && !locked && bonus < maxBonus;
  const canDec = isSpecialty && bonus > 0;
  const disabled = !isSpecialty || (locked && bonus === 0);

  const btn = (enabled, onClick, symbol) => (
    <button className="td-icon-button" disabled={!enabled} aria-label={`${symbol === '+' ? (zh ? '增加' : 'Increase') : (zh ? '减少' : 'Decrease')} ${zh ? meta.labelZh : meta.label}`} onClick={enabled ? onClick : undefined} style={{
      width: 30, height: 30, borderRadius: 5,
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
            {zh ? meta.labelZh : meta.label}
            {!isSpecialty && <span style={{ marginLeft: 5, fontSize: '0.4rem', color: 'rgba(255,255,255,0.25)' }}><IconText text={"🔒 "} />{zh ? '职业固定' : 'ROLE LOCKED'}</span>}
            {isSpecialty && <span style={{ marginLeft: 5, fontSize: '0.4rem', color: color + '90' }}>◆ {zh ? '专长方向' : 'SPECIALTY'}</span>}
          </div>
          {zh && <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{meta.label}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isSpecialty && btn(canDec, () => onChange(bonus - 1), '−')}
          <div style={{ minWidth: 52, textAlign: 'center', fontFamily: 'monospace' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 900, color, textShadow: 'none' }}>
              {meta.isPercent ? `${effective}%` : effective}
            </span>
            {isSpecialty && bonus > 0 && (
              <span style={{ fontSize: '0.44rem', color: '#8aaa91', marginLeft: 3 }}>+{bonus}</span>
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
            background: 'linear-gradient(to right, #8aaa9180, #8aaa91)',
            boxShadow: '0 0 8px #8aaa9180',
          }} />
        )}
      </div>
    </div>
  );
}

export default function SpecialtyAttrPanel({ agentIdx, spec, onSpecChange, agentColor: legacyColor, attributeBonus = {} }) {
  const agentColor = noirColor(legacyColor);
  const { lang } = useLang();
  const zh = lang === 'zh';
  const def = AGENT_SPECIALTIES[agentIdx];
  const used = specUsed(spec);
  const remaining = specRemaining(spec);
  const locked = remaining === 0;
  const attrs = effectiveAttrs(agentIdx, spec, attributeBonus);

  return (
    <div>
      {/* 专长点余额 counter */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', marginBottom: 12, borderRadius: 10,
        border: `1px solid ${locked ? '#c77c7850' : agentColor + '40'}`,
        background: locked ? 'rgba(199, 124, 120,0.06)' : `${agentColor}08`,
        transition: 'all 0.3s',
      }}>
        <div style={{ fontFamily: 'monospace' }}>
          <div style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em' }}>{zh ? '专长点余额' : 'SPEC POINTS'}</div>
          <div style={{ fontSize: '0.4rem', color: locked ? '#c77c78' : 'rgba(255,255,255,0.25)', marginTop: 2 }}>
            {locked
              ? (zh ? '余额耗尽 — 减点后方可再分配' : 'NO POINTS LEFT — REMOVE A POINT TO REALLOCATE')
              : (zh ? '仅可强化本职业的专长方向' : 'POINTS APPLY TO THIS ROLE’S SPECIALTIES ONLY')}
          </div>
        </div>
        <div style={{
          fontSize: '1.5rem', fontWeight: 900, fontFamily: 'monospace',
          color: locked ? '#c77c78' : '#8aaa91',
          textShadow: 'none',
        }}>
          {remaining}<span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>/{SPECIALTY_BUDGET}</span>
        </div>
      </div>

      {/* budget bar */}
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginBottom: 14 }}>
        <div style={{
          height: '100%', borderRadius: 2, width: '100%', transform: `scaleX(${used / SPECIALTY_BUDGET})`, transformOrigin: 'left',
          background: locked ? 'linear-gradient(to right, #c19a63, #c77c78)' : 'linear-gradient(to right, #8aaa9180, #8aaa91)',
          transition: 'transform 0.2s ease, background 0.3s',
        }} />
      </div>

      {ATTR_META.map(meta => {
        const isSpecialty = def.specialty_slots.includes(meta.key);
        return (
          <SpecAttrRow
            key={meta.key}
            meta={meta}
            base={Math.min(ATTR_MAX[meta.key], def.base_attrs[meta.key] + (Number(attributeBonus?.[meta.key]) || 0))}
            bonus={isSpecialty ? (spec?.[meta.key] || 0) : 0}
            isSpecialty={isSpecialty}
            locked={locked}
            maxBonus={maxBonusFor(agentIdx, spec, meta.key, attributeBonus)}
            onChange={(v) => onSpecChange({ ...spec, [meta.key]: Math.max(0, v) })}
          />
        );
      })}

      {/* effective summary hidden hook for radar consumers */}
      <div style={{ display: 'none' }}>{JSON.stringify(attrs)}</div>
    </div>
  );
}
