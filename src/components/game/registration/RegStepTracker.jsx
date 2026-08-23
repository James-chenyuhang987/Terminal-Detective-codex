import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';

const STEPS = [
  { id: '01', label: '输入名字', desc: '设定你的侦探代号' },
  { id: '02', label: '创建身份', desc: '头像 · 徽章 · 签名' },
  { id: '03', label: '进入大厅', desc: '开启第一桩案件' },
];

export default function RegStepTracker({ current = 0 }) {
  return (
    <GlassPanel accent="#00e5ff" style={{ padding: '20px 18px' }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.24em', color: 'rgba(0,229,255,0.65)', marginBottom: 18 }}>
        REGISTRATION FLOW
      </div>
      {STEPS.map((s, i) => {
        const active = i === current;
        const done = i < current;
        const color = done ? '#00ff88' : active ? '#e8c98a' : 'rgba(255,255,255,0.28)';
        return (
          <div key={s.id} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: `1px solid ${color}`, color, fontSize: '0.6rem', fontWeight: 900,
                background: active ? 'rgba(232,201,138,0.14)' : 'transparent',
                boxShadow: active ? '0 0 16px rgba(232,201,138,0.4)' : 'none',
              }}>{done ? '✓' : s.id}</div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 1, flex: 1, minHeight: 40, background: `linear-gradient(180deg, ${color}, rgba(255,255,255,0.08))` }} />
              )}
            </div>
            <div style={{ paddingBottom: 22 }}>
              <div style={{ color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em' }}>{s.label}</div>
              <div style={{ color: 'rgba(255,255,255,0.32)', fontSize: '0.56rem', marginTop: 4 }}>{s.desc}</div>
            </div>
          </div>
        );
      })}
    </GlassPanel>
  );
}