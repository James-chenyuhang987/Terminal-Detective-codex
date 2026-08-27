import React, { useEffect, useRef, useState } from 'react';
import { PRESET_CONFIGS } from '@/game/casePresets';
import { useLang } from '@/lib/lang.jsx';

// 预设方案芯片 — 一键加载三人配置
export default function PresetChips({ onApply }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [applied, setApplied] = useState(null);
  const clearTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(clearTimerRef.current), []);

  const handle = (p) => {
    onApply(p);
    setApplied(p.id);
    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => setApplied(null), 500);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.09)',
      background: 'rgba(255,255,255,0.02)', fontFamily: 'monospace',
    }}>
      <span style={{ fontSize: '0.4rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', writingMode: 'vertical-rl' }}>
        {zh ? '预设方案' : 'PRESETS'}
      </span>
      {PRESET_CONFIGS.map(p => (
        <button key={p.id} onClick={() => handle(p)} title={zh ? p.desc : p.descEn} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
          padding: '4px 9px', borderRadius: 20, cursor: 'pointer',
          border: `1px solid ${p.color}${applied === p.id ? 'ff' : '45'}`,
          background: applied === p.id ? `${p.color}30` : `${p.color}0c`,
          color: p.color, fontFamily: 'monospace',
          boxShadow: applied === p.id ? `0 0 14px ${p.color}80` : 'none',
          transform: applied === p.id ? 'scale(0.95)' : 'scale(1)',
          transition: 'all 0.18s',
        }}>
          <span style={{ fontSize: '0.48rem', fontWeight: 900, whiteSpace: 'nowrap' }}>{p.icon} {zh ? p.name : p.nameEn}</span>
          <span style={{ fontSize: '0.34rem', color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>{zh ? p.desc : p.descEn}</span>
        </button>
      ))}
    </div>
  );
}
