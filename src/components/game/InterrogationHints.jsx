import React from 'react';
import { INTENSITY_META, EMOTION_META } from '@/game/npcEmotion';
import { useLang } from '@/lib/lang.jsx';

// 审讯策略提示栏 — 点击方向标签填入输入框
export default function InterrogationHints({ hints, onPick }) {
  const { lang } = useLang();
  if (!hints?.length) return null;
  return (
    <div style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8, padding: '6px 8px', marginBottom: 8,
    }}>
      <span style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
        {lang === 'zh' ? '审讯策略' : 'STRATEGY'}
      </span>
      {hints.map(h => {
        const m = INTENSITY_META[h.intensity] || INTENSITY_META.calm;
        return (
          <button key={h.id} onClick={() => onPick(h.text)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 9px', borderRadius: 14, cursor: 'pointer',
              border: `1px solid ${m.color}45`, background: `${m.color}12`,
              color: m.color, fontFamily: 'monospace', fontSize: '0.5rem',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${m.color}28`}
            onMouseLeave={e => e.currentTarget.style.background = `${m.color}12`}
          >
            <span style={{
              width: 14, height: 14, borderRadius: '50%', fontSize: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${m.color}25`,
            }}>{m.icon}</span>
            {h.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmotionBadge({ level = 'calm' }) {
  const { lang } = useLang();
  const m = EMOTION_META[level] || EMOTION_META.calm;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 7px', borderRadius: 10,
      border: `1px solid ${m.color}55`, background: `${m.color}18`,
      color: m.color, fontFamily: 'monospace', fontSize: '0.45rem', fontWeight: 700,
    }}>
      {m.icon} {lang === 'zh' ? m.zh : m.en}
    </span>
  );
}