import React, { useEffect, useState } from 'react';
import { calcCaseMatchScore, CASE_NEON_BLOOD } from '@/game/casePresets';

// 当前案件匹配度 — 数字仪表盘
export default function CaseMatchGauge({ agents }) {
  const { score, color, advice } = calcCaseMatchScore(agents, CASE_NEON_BLOOD);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 220);
    return () => clearTimeout(t);
  }, [score]);

  const w = CASE_NEON_BLOOD.weights;

  return (
    <div style={{
      border: `1px solid ${color}45`, borderRadius: 10,
      background: `${color}08`, padding: '9px 11px', marginBottom: 12,
      fontFamily: 'monospace', transition: 'border-color 0.3s, background 0.3s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em' }}>
          当前案件匹配度<br/>
          <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.38rem' }}>NEON BLOOD · MATCH</span>
        </div>
        <div style={{
          fontSize: '1.7rem', fontWeight: 900, color, lineHeight: 1,
          textShadow: `0 0 16px ${color}90`,
          transform: flash ? 'scale(1.1)' : 'scale(1)',
          transition: 'transform 0.18s cubic-bezier(.22,1,.36,1), color 0.3s',
        }}>
          {score}<span style={{ fontSize: '0.7rem' }}>%</span>
        </div>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', margin: '7px 0 6px' }}>
        <div style={{
          height: '100%', borderRadius: 3, width: `${score}%`,
          background: `linear-gradient(to right, ${color}70, ${color})`,
          boxShadow: `0 0 8px ${color}90`, transition: 'width 0.25s ease',
        }} />
      </div>

      <div style={{ fontSize: '0.42rem', color: `${color}cc`, lineHeight: 1.6 }}>▸ {advice}</div>
      <div style={{ fontSize: '0.36rem', color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>
        权重：逻辑 {w.logic_power * 100}% · 黑客 {w.hack_level * 100}% · 观察 {w.observation_focus * 100}%
      </div>
    </div>
  );
}