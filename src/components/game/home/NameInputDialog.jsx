import React, { useState } from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';

export default function NameInputDialog({ initialName = '', onConfirm, busy }) {
  const [name, setName] = useState(initialName);
  const ok = !!name.trim();
  return (
    <GlassPanel accent="#00e5ff" glow={0.3} style={{ width: 310, padding: '24px 22px', textAlign: 'center', fontFamily: 'monospace' }}>
      <div style={{
        width: 40, height: 40, margin: '0 auto 10px', borderRadius: '50%', display: 'grid', placeItems: 'center',
        border: '1px solid rgba(0,229,255,0.5)', background: 'rgba(0,229,255,0.1)', fontSize: 18,
        boxShadow: '0 0 18px rgba(0,229,255,0.4)',
      }}>🔍</div>
      <div style={{
        fontWeight: 900, letterSpacing: '0.18em', fontSize: '1rem',
        background: 'linear-gradient(180deg,#ffffff,#6ee8ff)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>开始调查</div>
      <div style={{ color: 'rgba(210,238,255,0.5)', fontSize: '0.68rem', margin: '10px 0 12px' }}>请输入你的名字</div>

      <div style={{ position: 'relative' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ok) onConfirm(name.trim()); }}
          placeholder="玩家名"
          maxLength={12}
          style={{
            width: '100%', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(0,229,255,0.35)',
            borderRadius: 9, padding: '11px 34px 11px 14px', color: '#8ff0ff',
            fontFamily: 'monospace', fontSize: '0.88rem', outline: 'none',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)',
          }}
        />
        <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'rgba(0,229,255,0.5)', fontSize: '0.7rem' }}>✎</span>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.6rem', margin: '11px 0 15px' }}>
        你的名字将出现在侦探之家中
      </div>
      <button
        onClick={() => ok && onConfirm(name.trim())}
        disabled={!ok || busy}
        style={{
          width: '100%', padding: '12px', borderRadius: 11, cursor: ok ? 'pointer' : 'not-allowed',
          border: '1px solid rgba(197,160,89,0.85)',
          background: ok ? 'linear-gradient(180deg, rgba(197,160,89,0.34), rgba(120,90,35,0.18))' : 'transparent',
          color: '#f5e2b8', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.2em',
          fontSize: '0.82rem', opacity: ok ? 1 : 0.38,
          boxShadow: ok ? '0 0 24px rgba(197,160,89,0.4)' : 'none', transition: 'all 0.22s',
        }}>
        {busy ? '写入档案…' : '确认进入'}
      </button>
    </GlassPanel>
  );
}