import React, { useState, useEffect } from 'react';
import { useLang } from '@/lib/lang.jsx';
import StoryBriefing from '@/components/game/StoryBriefing';

const STYLE_META = {
  aggressive: { icon: '⚔️', zh: '激进', en: 'AGGRESSIVE', color: '#ff3860' },
  steady:     { icon: '🛡️', zh: '稳健', en: 'STEADY',     color: '#00ff88' },
  deceptive:  { icon: '🎭', zh: '欺骗', en: 'DECEPTIVE',   color: '#a78bfa' },
};
const RISK_COLOR = { high: '#ff3860', medium: '#ffaa00', low: '#00ff88' };

export default function DecisionCards({ cards, onChoose, timeLimit = 40, story }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [left, setLeft] = useState(timeLimit);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    const id = setInterval(() => setLeft(v => v - 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (left <= 0) onChoose({ card: cards[1] || cards[0] });
  }, [left]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120,
      background: 'radial-gradient(ellipse at center, rgba(4,10,26,0.86) 0%, rgba(0,0,0,0.94) 100%)',
      backdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', padding: 20, overflowY: 'auto',
    }}>
      <StoryBriefing story={story} />

      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ color: '#00e5ff', fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.2em', textShadow: '0 0 14px #00e5ff' }}>
          {zh ? '◈ 关键决策 · 行动策略卡' : '◈ KEY DECISION · STRATEGY CARDS'}
        </div>
        <div style={{ color: left <= 10 ? '#ff3860' : 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginTop: 8 }}>
          {zh ? `架构师指令倒计时 ${Math.max(0, left)}s` : `ARCHITECT ORDER IN ${Math.max(0, left)}s`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
        {cards.map((c, i) => {
          const m = STYLE_META[c.style] || STYLE_META.steady;
          const rc = RISK_COLOR[c.risk_level] || '#ffaa00';
          return (
            <button key={i} onClick={() => onChoose({ card: c })}
              style={{
                width: 214, minHeight: 258, textAlign: 'left', cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                border: `1px solid ${m.color}55`, borderRadius: 16, overflow: 'hidden',
                background: `linear-gradient(160deg, ${m.color}18 0%, rgba(0,0,0,0.6) 70%)`,
                color: '#fff', padding: 0,
                boxShadow: `0 0 18px ${m.color}22`,
                animation: `card-in 0.35s ${i * 0.08}s cubic-bezier(.22,1,.36,1) both`,
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = `0 0 30px ${m.color}55`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 0 18px ${m.color}22`; }}
            >
              <div style={{ padding: '14px 14px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 34, lineHeight: 1 }}>{m.icon}</div>
                <div style={{ fontSize: '0.8rem', color: m.color, fontWeight: 900, letterSpacing: '0.12em', marginTop: 8 }}>
                  {zh ? m.zh : m.en}
                </div>
              </div>
              <div style={{ padding: '0 16px 8px', flex: 1 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', marginBottom: 10, lineHeight: 1.4 }}>{c.label}</div>
                <div style={{ fontSize: '0.72rem', color: '#00ff88cc', lineHeight: 1.6, marginBottom: 7 }}>＋ {c.benefit_desc}</div>
                <div style={{ fontSize: '0.72rem', color: '#ff3860cc', lineHeight: 1.6 }}>⚠ {c.risk_desc}</div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: 10 }}>
                  [{String(c.action_tag).toUpperCase()}]
                </div>
              </div>
              <div style={{ height: 7, background: rc, boxShadow: `0 0 12px ${rc}` }}/>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 26, width: '100%', maxWidth: 830, display: 'flex', gap: 10 }}>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) onChoose({ freeform: custom.trim() }); }}
          placeholder={zh ? '输入自定义指令覆盖所有卡片…' : 'Type a custom order to override all cards…'}
          style={{
            flex: 1, background: 'rgba(0,0,0,0.6)', border: '1px solid #00e5ff45',
            borderRadius: 10, padding: '14px 16px', color: '#00e5ff',
            fontFamily: 'monospace', fontSize: '0.85rem', outline: 'none',
          }}
        />
        <button onClick={() => custom.trim() && onChoose({ freeform: custom.trim() })}
          disabled={!custom.trim()}
          style={{
            padding: '14px 26px', borderRadius: 10, border: '1px solid #00e5ff70',
            background: custom.trim() ? '#00e5ff20' : 'transparent',
            color: '#00e5ff', fontFamily: 'monospace', fontSize: '0.85rem',
            fontWeight: 700, cursor: custom.trim() ? 'pointer' : 'not-allowed',
            opacity: custom.trim() ? 1 : 0.35,
          }}>
          {zh ? '▶ 下达' : '▶ ORDER'}
        </button>
      </div>

      <style>{`@keyframes card-in{from{opacity:0;transform:translateY(24px) scale(.94)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
