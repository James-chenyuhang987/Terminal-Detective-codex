import React from 'react';
import { XP_PER_LEVEL } from '@/game/playerProfile';

export default function ProfileBadge({ profile, onClick }) {
  const pct = Math.min(100, ((profile.xp || 0) / XP_PER_LEVEL) * 100);
  const badgeIcons = { city: '🏙', private: '🗝', bureau: '🛰' };
  const tags = Array.isArray(profile.detective_tags) ? profile.detective_tags.slice(0, 3) : [];
  return (
    <button onClick={onClick} title="侦探档案 / Detective profile" style={{
      display: 'flex', alignItems: 'center', gap: 13, fontFamily: 'monospace',
      background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
    }}>
      {/* 段位徽章 */}
      <div style={{ position: 'relative', width: 54, height: 54, flexShrink: 0 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(197,160,89,0.75)',
          background: 'radial-gradient(circle at 32% 28%, rgba(240,217,165,0.35), rgba(30,20,8,0.9))',
          boxShadow: '0 0 22px rgba(197,160,89,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
          display: 'grid', placeItems: 'center', fontSize: 21,
        }}>{profile.avatar || '🦅'}</div>
        <div style={{
          position: 'absolute', inset: -4, borderRadius: '50%',
          border: '1px dashed rgba(197,160,89,0.35)',
          animation: 'badge-spin 18s linear infinite',
        }} />
      </div>
      <div>
        <div style={{
          fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 6,
          background: 'linear-gradient(180deg, #ffffff, #d8b473)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}><span style={{ WebkitTextFillColor: 'initial' }}>{badgeIcons[profile.identity_badge] || '🗝'}</span><span>侦探档案</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 5 }}>
          <span style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.66)' }}>等级 {profile.level}</span>
          <div style={{
            width: 118, height: 5, borderRadius: 3,
            background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 3,
              background: 'linear-gradient(to right, #00b7ff, #7df1ff)',
              boxShadow: '0 0 10px #00e5ff',
            }} />
          </div>
          <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)' }}>{profile.xp}/{XP_PER_LEVEL}</span>
        </div>
        <div style={{ fontSize: '0.58rem', color: 'rgba(0,229,255,0.62)', marginTop: 4, letterSpacing: '0.08em' }}>
          ◈ {profile.rank_title}
        </div>
        {profile.signature && (
          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.38)', marginTop: 3, maxWidth: 220 }}>
            “{profile.signature}”
          </div>
        )}
        {!!tags.length && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {tags.map(tag => <span key={tag} style={{
            padding: '1px 5px', borderRadius: 999, border: '1px solid rgba(167,139,250,.28)',
            color: 'rgba(216,205,255,.65)', fontSize: '.45rem', lineHeight: 1.3,
          }}>{tag}</span>)}
        </div>}
      </div>
      <style>{`@keyframes badge-spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
