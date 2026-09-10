import React from 'react';
import {
  DETECTIVE_LEVEL_CAP,
  XP_PER_LEVEL,
  claimableLevelRewardCount,
} from '@/game/playerProfile';
import { useLang } from '@/lib/lang.jsx';
import { detectiveTagLabel, rankTitleLabel } from '@/game/identityOptions';
import Icon from '@/components/ui/Icon.jsx';

export default function ProfileBadge({ profile, onClick, onOpenLevelRoad }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const isMax = profile.level >= DETECTIVE_LEVEL_CAP;
  const pct = isMax ? 100 : Math.min(100, ((profile.xp || 0) / XP_PER_LEVEL) * 100);
  const badgeIcons = { city: 'city', private: 'key', bureau: 'satellite' };
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
            border: '2px solid rgba(197, 166, 111,0.75)',
            background: 'radial-gradient(circle at 32% 28%, rgba(225, 208, 172,0.35), rgba(30,20,8,0.9))',
            boxShadow: 'inset 0 1px 0 rgba(230,223,207,.12)',
            display: 'grid', placeItems: 'center', color: '#c5a66f',
          }}><Icon name={profile.avatar || 'eagle'} size={27} /></div>
          <div aria-hidden="true" style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '1px solid rgba(197,166,111,.2)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 6,
            color: '#e1d0ac',
          }}><Icon name={badgeIcons[profile.identity_badge] || 'key'} size={17} /><span>{zh ? '侦探档案' : 'DETECTIVE PROFILE'}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 5 }}>
            <span style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.66)', whiteSpace: 'nowrap' }}>{zh ? '等级' : 'LEVEL'} {profile.level}</span>
            <div style={{ width: 106, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 3,
                background: isMax ? 'linear-gradient(to right, #c5a66f, #e1d0ac)' : 'linear-gradient(to right, #709f9a, #a5c8c0)',
                boxShadow: 'none',
              }} />
            </div>
            <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>{isMax ? 'MAX' : `${profile.xp}/${XP_PER_LEVEL}`}</span>
          </div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(112, 159, 154,0.62)', marginTop: 4, letterSpacing: '0.08em' }}><Icon name="badge" /> {rankTitleLabel(profile.rank_title, lang)}</div>
          {profile.signature && <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.38)', marginTop: 3, maxWidth: 220 }}>“{profile.signature}”</div>}
          {!!tags.length && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {tags.map(tag => <span key={tag} style={{ padding: '1px 5px', borderRadius: 999, border: '1px solid rgba(155, 154, 174,.28)', color: 'rgba(216,205,255,.65)', fontSize: '.45rem', lineHeight: 1.3 }}>{detectiveTagLabel(tag, lang)}</span>)}
          </div>}
        </div>
      </button>
      <button className="td-ui-button td-level-road-button" onClick={onOpenLevelRoad} title={zh ? '查看等级奖励' : 'View level rewards'} style={{
        position: 'relative', flexShrink: 0, borderRadius: 9, padding: '7px 9px', cursor: 'pointer',
        border: '1px solid rgba(197, 166, 111,.5)', background: 'linear-gradient(145deg, rgba(197, 166, 111,.16), rgba(112, 159, 154,.06))',
        color: '#e1d0ac', fontFamily: 'monospace', fontWeight: 900, fontSize: '.52rem', letterSpacing: '.08em',
        boxShadow: claimable ? 'inset 0 0 0 1px rgba(197,166,111,.2)' : 'none',
      }}>
        <Icon name="route" size={16} /> {zh ? '等级之路' : 'LEVEL ROAD'}
        {claimable > 0 && <span style={{
          position: 'absolute', right: -6, top: -7, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
          display: 'grid', placeItems: 'center', background: '#c77c78', color: '#08121c', fontSize: '.45rem', border: '1px solid #08121c',
        }}>{claimable}</span>}
      </button>
    </div>
  );
}
