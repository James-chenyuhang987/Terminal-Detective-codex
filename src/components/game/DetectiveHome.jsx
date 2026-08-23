import React, { useState, useEffect } from 'react';
import { loadProfile, saveProfile, applyCheckin, canCheckin, ACHIEVEMENT_TOTAL } from '@/game/playerProfile';
import NameInputDialog from '@/components/game/home/NameInputDialog';
import ResourceBar from '@/components/game/home/ResourceBar';
import ProfileBadge from '@/components/game/home/ProfileBadge';
import HomePortal from '@/components/game/home/HomePortal';
import InfoCard from '@/components/game/home/InfoCard';
import SideNavIcons from '@/components/game/home/SideNavIcons';
import FooterShortcuts from '@/components/game/home/FooterShortcuts';
import ModulePanel from '@/components/game/home/ModulePanel';
import HomeBackdrop from '@/components/game/home/HomeBackdrop';

const SIDE_ITEMS = [
  { key: 'warehouse', icon: '🎒', label: '物品仓库', desc: '道具与材料' },
  { key: 'graph', icon: '🕸', label: '线索图谱', desc: '线索关联分析' },
  { key: 'tech', icon: '⚙️', label: '科技研发', desc: '解锁科技能力' },
  { key: 'comms', icon: '✉️', label: '探员通讯', desc: '好友与聊天' },
  { key: 'settings', icon: '🔧', label: '设置', desc: '游戏设置' },
];

export default function DetectiveHome({ onEnterLobby, onOpenCases, onRegister }) {
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [module, setModule] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => { loadProfile().then(setProfile); }, []);

  const patch = async (next) => {
    setProfile(next);
    await saveProfile(next);
  };

  const handleName = async (name) => {
    setBusy(true);
    await patch({ ...profile, detective_name: name });
    setBusy(false);
  };

  const handleCheckin = async () => {
    const { profile: next, reward } = applyCheckin(profile);
    if (!reward) return;
    await patch(next);
    setToast(`签到成功 · 体力+${reward.energy} 金币+${reward.gold} 钻石+${reward.diamonds}`);
    setTimeout(() => setToast(''), 3200);
  };

  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'grid', placeItems: 'center', color: '#00e5ff', fontFamily: 'monospace', fontSize: '0.75rem' }}>
        读取侦探档案…
      </div>
    );
  }

  const named = !!profile.detective_name;

  return (
    <div style={{
      minHeight: '100vh', position: 'relative', overflowX: 'hidden',
      background: '#07090e',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column',
    }}>
      <HomeBackdrop />

      {/* Top bar */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '12px 22px', borderBottom: '1px solid rgba(0,229,255,0.14)',
        background: 'linear-gradient(180deg, rgba(4,10,18,0.82), rgba(4,10,18,0.4))',
        backdropFilter: 'blur(16px) saturate(160%)',
        boxShadow: '0 6px 26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
        flexWrap: 'wrap',
      }}>
        <ProfileBadge profile={profile} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ResourceBar profile={profile} onCheckin={handleCheckin} canCheckin={canCheckin(profile)} />
          <div style={{ display: 'flex', gap: 10, fontSize: 15 }}>
            {[['✉️', 'comms'], ['📅', 'checkin'], ['🔧', 'settings']].map(([ic, k]) => (
              <button key={k} onClick={() => setModule(k)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.75 }}>{ic}</button>
            ))}
            <span style={{ color: '#00ff88', fontSize: '0.7rem' }}>📶</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{
        position: 'relative', zIndex: 2,
        flex: 1, display: 'grid', gap: 20, padding: '26px 22px',
        gridTemplateColumns: 'minmax(190px, 220px) 1fr minmax(180px, 210px)',
        alignItems: 'start',
      }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoCard icon="📰" title="今日情报" alert desc="城市迷案追踪 —— 新的案件线索已更新"
            btnLabel="查看详情" onClick={() => setModule('intel')} />
          <InfoCard icon="🗂" title="未解案件" big={String(profile.unsolved_count).padStart(2, '0')}
            unit="个案件待调查" btnLabel="进入案件簿" onClick={onOpenCases} />
          <InfoCard icon="🏅" title="成就徽章" big={(profile.achievements || []).length}
            unit={`/ ${ACHIEVEMENT_TOTAL}`} btnLabel="查看成就" onClick={() => setModule('achievements')} />
        </div>

        {/* Center */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              margin: 0, fontSize: 'clamp(2.1rem, 5.4vw, 3.7rem)', fontWeight: 900, letterSpacing: '0.05em',
              background: 'linear-gradient(180deg, #ffffff 0%, #cfefff 42%, #38b9ff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.85)) drop-shadow(0 0 26px rgba(0,180,255,0.55))',
            }}>
              侦探{named ? profile.detective_name : 'XXX'}的家
            </h1>
            <div style={{
              width: 200, height: 1, margin: '10px auto 0',
              background: 'linear-gradient(to right, transparent, rgba(0,229,255,0.7), transparent)',
              boxShadow: '0 0 12px rgba(0,229,255,0.6)',
            }} />
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: 8, letterSpacing: '0.14em' }}>
              每一个线索，都是揭开真相的钥匙 🔍
            </div>
          </div>

          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
            {!named ? (
              onRegister
                ? <div style={{
                    width: 300, border: '1px solid rgba(0,229,255,0.4)', borderRadius: 14, padding: 20,
                    background: 'linear-gradient(160deg, rgba(0,229,255,0.12), rgba(0,0,0,0.8))', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 24 }}>🪪</div>
                    <div style={{ color: '#00e5ff', fontWeight: 900, letterSpacing: '0.16em', fontSize: '0.9rem', margin: '8px 0 6px' }}>
                      尚未注册身份
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                      设定代号、头像与个性签名
                    </div>
                    <button onClick={onRegister} style={{
                      width: '100%', padding: 11, cursor: 'pointer', borderRadius: 10,
                      border: '1px solid #00e5ff', background: 'rgba(0,229,255,0.18)',
                      color: '#cfefff', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.18em', fontSize: '0.78rem',
                    }}>前往注册</button>
                  </div>
                : <NameInputDialog onConfirm={handleName} busy={busy} />
            ) : (
              <div style={{
                width: 300, border: '1px solid rgba(197,160,89,0.5)', borderRadius: 14, padding: '20px',
                background: 'linear-gradient(160deg, rgba(197,160,89,0.16), rgba(0,0,0,0.8))', textAlign: 'center',
                boxShadow: '0 0 34px rgba(197,160,89,0.22)',
              }}>
                <div style={{ fontSize: 24 }}>🔎</div>
                <div style={{ color: '#e8c98a', fontWeight: 900, letterSpacing: '0.2em', fontSize: '1rem', margin: '8px 0 6px' }}>
                  「开始调查」
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                  代号 {profile.detective_name} · 侦探之旅已启程
                </div>
                <button onClick={onEnterLobby} style={{
                  width: '100%', padding: '11px', cursor: 'pointer', borderRadius: 10,
                  border: '1px solid #c5a059', background: 'rgba(197,160,89,0.22)',
                  color: '#f0d9a5', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.18em', fontSize: '0.78rem',
                }}>开始调查</button>
                <button onClick={() => patch({ ...profile, detective_name: '' })} style={{
                  marginTop: 8, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: '0.55rem',
                }}>✎ 修改代号</button>
              </div>
            )}
            <HomePortal onEnter={onEnterLobby} />
          </div>
        </div>

        {/* Right column */}
        <SideNavIcons items={SIDE_ITEMS} onPick={setModule} />
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 2, padding: '14px 22px 22px' }}>
        <FooterShortcuts
          items={[
            { key: 'checkin', icon: '📅', label: '每日签到', alert: canCheckin(profile) },
            { key: 'events', icon: '🎁', label: '活动中心' },
            { key: 'tutorial', icon: '📖', label: '新手任务' },
            { key: 'goals', icon: '🎯', label: '七日目标' },
          ]}
          onPick={setModule}
        />
      </div>

      {module && <ModulePanel moduleKey={module} profile={profile} onClose={() => setModule(null)} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 120,
          border: '1px solid rgba(0,255,136,0.5)', borderRadius: 10, padding: '10px 18px',
          background: 'rgba(0,20,10,0.92)', color: '#00ff88', fontSize: '0.7rem', letterSpacing: '0.08em',
        }}>{toast}</div>
      )}
    </div>
  );
}