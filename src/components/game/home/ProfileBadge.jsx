import React from 'react';
import {
  DETECTIVE_LEVEL_CAP,
  XP_PER_LEVEL,
  claimableLevelRewardCount,
} from '@/game/playerProfile';
import { useLang } from '@/lib/lang.jsx';
import { detectiveTagLabel, rankTitleLabel } from '@/game/identityOptions';

export default function ProfileBadge({ profile, onClick, onOpenLevelRoad }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const isMax = profile.level >= DETECTIVE_LEVEL_CAP;
  const pct = isMax ? 100 : Math.min(100, ((profile.xp || 0) / XP_PER_LEVEL) * 100);
  const badgeIcons = { city: '🏙', private: '🗝', bureau: '🛰' };
  const tags = Array.isArray(profile.detective_tags) ? profile.detective_tags.slice(0, 3) : [];
  const claimable = claimableLevelRewardCount(profile);

  return (
    <div className="td-profile-badge-group" style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <button onClick={onClick} title={zh ? '侦探档案' : 'Detective profile'} style={{
        display: 'flex', alignItems: 'center', gap: 13, fontFamily: 'monospace',
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0,
      }}>
        <div style={{ position: 'relative', width: 54, height: 54, flexShrink: 0 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid rgba(197,160,89,0.75)',
            background: 'radial-gradient(circle at 32% 28%, rgba(240,217,165,0.35), rgba(30,20,8,0.9))',
            boxShadow: '0 0 22px rgba(197,160,89,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
            display: 'grid', placeItems: 'center', fontSize: 21,
          }}>{profile.avatar || '🦅'}</div>
          <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '1px dashed rgba(197,160,89,0.35)', animation: 'badge-spin 18s linear infinite' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(180deg, #ffffff, #d8b473)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}><span style={{ WebkitTextFillColor: 'initial' }}>{badgeIcons[profile.identity_badge] || '🗝'}</span><span>{zh ? '侦探档案' : 'DETECTIVE PROFILE'}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 5 }}>
            <span style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.66)', whiteSpace: 'nowrap' }}>{zh ? '等级' : 'LEVEL'} {profile.level}</span>
            <div style={{ width: 106, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 3,
                background: isMax ? 'linear-gradient(to right, #d7aa52, #fff0b0)' : 'linear-gradient(to right, #00b7ff, #7df1ff)',
                boxShadow: isMax ? '0 0 10px #e8c98a' : '0 0 10px #00e5ff',
              }} />
            </div>
            <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>{isMax ? 'MAX' : `${profile.xp}/${XP_PER_LEVEL}`}</span>
          </div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(0,229,255,0.62)', marginTop: 4, letterSpacing: '0.08em' }}>◈ {rankTitleLabel(profile.rank_title, lang)}</div>
          {profile.signature && <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.38)', marginTop: 3, maxWidth: 220 }}>“{profile.signature}”</div>}
          {!!tags.length && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {tags.map(tag => <span key={tag} style={{ padding: '1px 5px', borderRadius: 999, border: '1px solid rgba(167,139,250,.28)', color: 'rgba(216,205,255,.65)', fontSize: '.45rem', lineHeight: 1.3 }}>{detectiveTagLabel(tag, lang)}</span>)}
          </div>}
        </div>
      </button>
      <button className="td-ui-button td-level-road-button" onClick={onOpenLevelRoad} title={zh ? '查看等级奖励' : 'View level rewards'} style={{
        position: 'relative', flexShrink: 0, borderRadius: 9, padding: '7px 9px', cursor: 'pointer',
        border: '1px solid rgba(232,201,138,.5)', background: 'linear-gradient(145deg, rgba(232,201,138,.16), rgba(0,229,255,.06))',
        color: '#f0d9a5', fontFamily: 'monospace', fontWeight: 900, fontSize: '.52rem', letterSpacing: '.08em',
        boxShadow: claimable ? '0 0 16px rgba(232,201,138,.28)' : 'none',
      }}>
        🛤 {zh ? '等级之路' : 'LEVEL ROAD'}
        {claimable > 0 && <span style={{
          position: 'absolute', right: -6, top: -7, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
          display: 'grid', placeItems: 'center', background: '#ff3860', color: '#fff', fontSize: '.45rem', boxShadow: '0 0 12px rgba(255,56,96,.75)',
        }}>{claimable}</span>}
      </button>
      <style>{`@keyframes badge-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
