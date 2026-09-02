import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { applyCheckin, canCheckin, ACHIEVEMENT_TOTAL, diffProfileWrite, knownAchievementCount, markActivity } from '@/game/playerProfile';
import { useProfile } from '@/lib/ProfileContext.jsx';
import { useLang } from '@/lib/lang.jsx';
import NameInputDialog from '@/components/game/home/NameInputDialog';
import ResourceBar from '@/components/game/home/ResourceBar';
import ProfileBadge from '@/components/game/home/ProfileBadge';
import HomePortal from '@/components/game/home/HomePortal';
import InfoCard from '@/components/game/home/InfoCard';
import SideNavIcons from '@/components/game/home/SideNavIcons';
import FooterShortcuts from '@/components/game/home/FooterShortcuts';
import HomeBackdrop from '@/components/game/home/HomeBackdrop';
import CheckinCelebration from '@/components/game/home/CheckinCelebration';
import StatusToast from '@/components/game/StatusToast';
import HomeDrawer from '@/components/game/home/HomeDrawer';
import { getHomeModuleMeta } from '@/components/game/home/homeModuleMeta';
import { transactionErrorMessage } from '@/game/transactionFeedback';

const loadHomeModules = () => import('@/components/game/home/HomeModules');
const HomeModules = lazy(loadHomeModules);
const loadSettingsDrawer = () => import('@/components/game/settings/SettingsDrawer');
const SettingsDrawer = lazy(loadSettingsDrawer);
const BUILD_ID = String(import.meta.env.VITE_BUILD_SHA || 'local').slice(0, 7);

function HomeModuleSkeleton({ lang }) {
  return (
    <div className="td-home-module-skeleton" role="status" aria-live="polite">
      <div><i /><i /><i /></div>
      <div><i /><i /></div>
      <span>{lang === 'zh' ? '正在接入模块…' : 'CONNECTING MODULE…'}</span>
    </div>
  );
}

export default function DetectiveHome({ onEnterLobby, onOpenCases, onRegister }) {
  const { lang } = useLang();
  const {
    profile,
    mutate,
    pendingCount,
    refresh,
    syncStatus,
    takeOver,
    isReadOnly,
  } = useProfile();
  const [busy, setBusy] = useState(false);
  const [module, setModule] = useState(null);
  const [toast, setToast] = useState(null);
  const [checkinCelebration, setCheckinCelebration] = useState(null);
  const toastTimerRef = useRef(null);
  const busyRef = useRef(false);
  const hasSavedTeam = !!profile?.saved_team_config;
  const loadError = ['error', 'recovery', 'storage_unavailable'].includes(syncStatus);
  const syncLabel = {
    online: lang === 'zh' ? 'Cloudflare 已连接' : 'Cloudflare connected',
    syncing: lang === 'zh' ? '同步中…' : 'Syncing…',
    pending: lang === 'zh' ? `${pendingCount} 项待同步` : `${pendingCount} pending`,
    readonly: lang === 'zh' ? '只读模式' : 'Read only',
    storage_unavailable: lang === 'zh' ? '本地存储不可用' : 'Local storage unavailable',
    recovery: lang === 'zh' ? '档案需要恢复' : 'Profile recovery required',
    error: lang === 'zh' ? '同步失败' : 'Sync failed',
  }[syncStatus] || (lang === 'zh' ? '连接中…' : 'Connecting…');
  const syncColor = syncStatus === 'online'
    ? '#00ff88'
    : ['syncing', 'pending', 'loading'].includes(syncStatus) ? '#ffaa00' : '#ff3860';

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    const preload = () => {
      void loadHomeModules();
      void loadSettingsDrawer();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 650 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 80);
    return () => clearTimeout(id);
  }, []);

  const closeCheckinCelebration = useCallback(() => setCheckinCelebration(null), []);

  const retryLoad = () => {
    void (profile ? refresh() : takeOver()).catch(() => {});
  };

  const notify = (message, type = 'success') => {
    setToast({ id: Date.now(), message, type });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  const patch = async (next, message = '') => {
    if (isReadOnly) {
      notify(lang === 'zh' ? '当前设备为只读模式，请先接管此设备' : 'This device is read-only. Take over this device before making changes.', 'error');
      return false;
    }
    if (busyRef.current) {
      notify(lang === 'zh' ? '正在同步上一项操作，请稍候' : 'The previous action is still syncing. Please wait.', 'error');
      return false;
    }
    const changes = diffProfileWrite(profile, next);
    if (!Object.keys(changes).length) {
      if (message) notify(message);
      return true;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await mutate(current => ({ profile: { ...current, ...changes } }));
      if (message) notify(result?.pending
        ? `${message} · ${lang === 'zh' ? '已保存在本机，等待云端同步' : 'saved locally; cloud sync pending'}`
        : message);
      return true;
    } catch {
      notify(lang === 'zh' ? '云端同步失败，请重试' : 'Cloud sync failed. Please retry.', 'error');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const applyResult = async (result, message = '') => {
    if (isReadOnly) {
      notify(lang === 'zh' ? '当前设备为只读模式，请先接管此设备' : 'This device is read-only. Take over this device before making changes.', 'error');
      return false;
    }
    if (busyRef.current) {
      notify(lang === 'zh' ? '正在同步上一项操作，请稍候' : 'The previous action is still syncing. Please wait.', 'error');
      return false;
    }
    const rejectResult = (failedResult) => {
      const errors = {
        not_owned: lang === 'zh' ? '尚未持有该物品' : 'Item not owned',
        equip_limit: lang === 'zh' ? '最多装备两件任务道具' : 'Only two mission items can be equipped',
        already_claimed: lang === 'zh' ? '奖励已经领取' : 'Reward already claimed',
        incomplete: lang === 'zh' ? '目标尚未完成' : 'Objective incomplete',
        day_locked: lang === 'zh' ? '该目标尚未解锁' : 'This day is still locked',
        locked: lang === 'zh' ? '成就尚未解锁' : 'Achievement locked',
        invalid_level: lang === 'zh' ? '该等级奖励不存在' : 'This level reward does not exist',
        level_locked: lang === 'zh' ? '尚未达到该等级' : 'This level has not been reached yet',
        rename_used: lang === 'zh' ? '代号修改次数已用完' : 'Codename rename already used',
      };
      notify(transactionErrorMessage(failedResult?.error, lang) || errors[failedResult?.error] || (lang === 'zh' ? '操作无法完成' : 'Unable to complete action'), 'error');
      return false;
    };
    // Inventory actions must be evaluated against the newest queued profile.
    // Computing them in the click handler can reuse a stale item count while a
    // previous cloud write is finishing.
    if (typeof result === 'function') {
      busyRef.current = true;
      setBusy(true);
      try {
        const evaluated = await mutate(current => result(current));
        if (!evaluated?.profile || evaluated.error) return rejectResult(evaluated);
        if (message) notify(evaluated?.pending
          ? `${message} · ${lang === 'zh' ? '已保存在本机，等待云端同步' : 'saved locally; cloud sync pending'}`
          : message);
        return true;
      } catch {
        notify(lang === 'zh' ? '云端同步失败，请重试' : 'Cloud sync failed. Please retry.', 'error');
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    }
    if (!result?.profile || result.error) return rejectResult(result);
    return patch(result.profile, message);
  };

  const handleName = async (name) => {
    await patch({ ...profile, detective_name: name });
  };

  const handleCheckin = async () => {
    const { profile: next, reward, day } = applyCheckin(profile);
    if (!reward) return;
    const parts = [reward.energy ? `⚡+${reward.energy}` : '', reward.gold ? `🪙+${reward.gold}` : '', reward.diamonds ? `💎+${reward.diamonds}` : ''].filter(Boolean).join(' · ');
    const saved = await patch(next, `${lang === 'zh' ? '签到成功' : 'Check-in complete'} · ${parts || '🎁'}`);
    if (saved) setCheckinCelebration({ reward, day });
  };

  const enterLobby = (targetCaseId = null) => {
    onEnterLobby(targetCaseId);
    if (!isReadOnly) {
      void mutate(current => ({ profile: markActivity(current, 'lobby_visits') })).catch(() => {});
    }
  };

  const openCase = (caseId) => {
    setModule(null);
    onOpenCases(caseId);
  };

  const planCase = (caseId) => {
    setModule(null);
    enterLobby(caseId);
  };

  const openModule = useCallback((moduleKey) => {
    if (moduleKey === 'settings') void loadSettingsDrawer();
    else void loadHomeModules();
    setModule(moduleKey);
  }, []);

  const quickStart = () => {
    if (profile.saved_team_config) openModule('cases');
    else void enterLobby();
  };

  if (!profile) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0a0a0f', display: 'grid', placeItems: 'center', color: '#00e5ff', fontFamily: 'monospace', fontSize: '0.75rem' }}>
        {loadError ? <div style={{ textAlign: 'center' }}><div style={{ color: '#ff7890', marginBottom: 12 }}>{lang === 'zh' ? '读取云端档案失败' : 'Failed to load cloud profile'}</div><button onClick={retryLoad} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #00e5ff80', background: 'rgba(0,229,255,.1)', color: '#7df1ff', cursor: 'pointer', fontFamily: 'monospace' }}>{lang === 'zh' ? '重试' : 'RETRY'}</button></div> : (lang === 'zh' ? '读取侦探档案…' : 'LOADING DETECTIVE PROFILE…')}
      </div>
    );
  }

  const named = !!profile.detective_name;
  const sideItems = lang === 'zh' ? [
    { key: 'agents', icon: '🕵️', label: '探员', desc: '已拥有探员' },
    { key: 'warehouse', icon: '🎒', label: '物品仓库', desc: '道具与材料' },
    { key: 'graph', icon: '🕸', label: '线索图谱', desc: '线索关联分析' },
    { key: 'tech', icon: '⚙️', label: '科技研发', desc: '解锁科技能力' },
    { key: 'comms', icon: '✉️', label: '探员通讯', desc: '系统与剧情联络' },
    { key: 'settings', icon: '🔧', label: '设置', desc: '游戏与账户设置' },
  ] : [
    { key: 'agents', icon: '🕵️', label: 'AGENTS', desc: 'Owned roster' },
    { key: 'warehouse', icon: '🎒', label: 'WAREHOUSE', desc: 'Items and materials' },
    { key: 'graph', icon: '🕸', label: 'CLUE GRAPH', desc: 'Cross-case evidence' },
    { key: 'tech', icon: '⚙️', label: 'RESEARCH', desc: 'Permanent upgrades' },
    { key: 'comms', icon: '✉️', label: 'COMMS', desc: 'System and story mail' },
    { key: 'settings', icon: '🔧', label: 'SETTINGS', desc: 'Game and account' },
  ];

  return (
    <div className="td-home td-page-shell" style={{
      minHeight: '100dvh', position: 'relative', overflowX: 'hidden',
      background: '#07090e',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column',
    }}>
      <HomeBackdrop />

      {/* Top bar */}
      <div className="td-home-topbar" style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '12px 22px', borderBottom: '1px solid rgba(0,229,255,0.14)',
        background: 'linear-gradient(180deg, rgba(4,10,18,0.82), rgba(4,10,18,0.4))',
        backdropFilter: 'blur(16px) saturate(160%)',
        boxShadow: '0 6px 26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
        flexWrap: 'wrap',
      }}>
        <ProfileBadge
          profile={profile}
          onClick={() => openModule('profile')}
          onOpenLevelRoad={() => openModule('level_road')}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ResourceBar profile={profile} onPick={openModule} />
          <div style={{ display: 'flex', gap: 10, fontSize: 15 }}>
            {[['✉️', 'comms'], ['📅', 'checkin'], ['🔧', 'settings']].map(([ic, k]) => (
              <button className="td-ui-button td-icon-button td-home-top-action" key={k} onClick={() => openModule(k)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.75 }}>{ic}</button>
            ))}
            <span title={`${syncLabel} · BUILD ${BUILD_ID}`} style={{ color: syncColor, fontSize: '0.7rem' }}>📶 <small style={{ color: 'rgba(180,220,235,.38)', fontSize: '.46rem' }}>{BUILD_ID}</small></span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="td-home-grid" style={{
        position: 'relative', zIndex: 2,
        flex: 1, display: 'grid', gap: 20, padding: '26px 22px',
        gridTemplateColumns: 'minmax(190px, 220px) 1fr minmax(180px, 210px)',
        alignItems: 'start',
      }}>
        {/* Left column */}
        <div className="td-home-left" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoCard icon="📰" title={lang === 'zh' ? '今日情报' : 'DAILY INTEL'} alert desc={lang === 'zh' ? '优先案件与今日额外奖励已更新' : 'Priority case and daily bonus updated'}
            btnLabel={lang === 'zh' ? '查看详情' : 'VIEW INTEL'} onClick={() => openModule('intel')} />
          <InfoCard icon="🗂" title={lang === 'zh' ? '未解案件' : 'OPEN CASES'} big={String(profile.unsolved_count).padStart(2, '0')}
            unit={lang === 'zh' ? '个案件待调查' : 'cases pending'} btnLabel={lang === 'zh' ? '进入案件簿' : 'OPEN ARCHIVE'} onClick={() => openModule('cases')} />
          <InfoCard icon="🏅" title={lang === 'zh' ? '成就徽章' : 'ACHIEVEMENTS'} big={knownAchievementCount(profile)}
            unit={`/ ${ACHIEVEMENT_TOTAL}`} btnLabel={lang === 'zh' ? '查看成就' : 'VIEW'} onClick={() => openModule('achievements')} />
        </div>

        {/* Center */}
        <div className="td-home-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              margin: 0, fontSize: 'clamp(2.1rem, 5.4vw, 3.7rem)', fontWeight: 900, letterSpacing: '0.05em',
              background: 'linear-gradient(180deg, #ffffff 0%, #cfefff 42%, #38b9ff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.85)) drop-shadow(0 0 26px rgba(0,180,255,0.55))',
            }}>
              {lang === 'zh'
                ? `侦探${named ? profile.detective_name : 'XXX'}的家`
                : `${named ? profile.detective_name : 'XXX'}'S DETECTIVE HOME`}
            </h1>
            <div style={{
              width: 200, height: 1, margin: '10px auto 0',
              background: 'linear-gradient(to right, transparent, rgba(0,229,255,0.7), transparent)',
              boxShadow: '0 0 12px rgba(0,229,255,0.6)',
            }} />
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: 8, letterSpacing: '0.14em' }}>
              {lang === 'zh' ? '每一个线索，都是揭开真相的钥匙' : 'EVERY CLUE IS A KEY TO THE TRUTH'} 🔍
            </div>
          </div>

          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
            {!named ? (
              onRegister
                ? <div className="td-ui-card td-home-investigate-card" style={{
                    width: 300, border: '1px solid rgba(0,229,255,0.4)', borderRadius: 14, padding: 20,
                    background: 'linear-gradient(160deg, rgba(0,229,255,0.12), rgba(0,0,0,0.8))', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 24 }}>🪪</div>
                    <div style={{ color: '#00e5ff', fontWeight: 900, letterSpacing: '0.16em', fontSize: '0.9rem', margin: '8px 0 6px' }}>
                      {lang === 'zh' ? '尚未注册身份' : 'IDENTITY NOT REGISTERED'}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                      {lang === 'zh' ? '设定代号、头像与个性签名' : 'Set your codename, avatar and signature'}
                    </div>
                    <button className="td-ui-button td-button-primary td-button-wide" onClick={onRegister} style={{
                      width: '100%', padding: 11, cursor: 'pointer', borderRadius: 10,
                      border: '1px solid #00e5ff', background: 'rgba(0,229,255,0.18)',
                      color: '#cfefff', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.18em', fontSize: '0.78rem',
                    }}>{lang === 'zh' ? '前往注册' : 'REGISTER IDENTITY'}</button>
                  </div>
                : <NameInputDialog onConfirm={handleName} busy={busy} />
            ) : (
              <div className="td-ui-card td-home-investigate-card" style={{
                width: 300, border: '1px solid rgba(197,160,89,0.5)', borderRadius: 14, padding: '20px',
                background: 'linear-gradient(160deg, rgba(197,160,89,0.16), rgba(0,0,0,0.8))', textAlign: 'center',
                boxShadow: '0 0 34px rgba(197,160,89,0.22)',
              }}>
                <div style={{ fontSize: 24 }}>🔎</div>
                <div style={{ color: '#e8c98a', fontWeight: 900, letterSpacing: '0.2em', fontSize: '1rem', margin: '8px 0 6px' }}>
                  {lang === 'zh' ? '「开始调查」' : 'START INVESTIGATION'}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                  {lang === 'zh'
                    ? `代号 ${profile.detective_name} · 侦探之旅已启程`
                    : `CODENAME ${profile.detective_name} · YOUR INVESTIGATION BEGINS`}
                </div>
                <button className="td-ui-button td-button-gold td-button-wide" onClick={quickStart} style={{
                  width: '100%', padding: '11px', cursor: 'pointer', borderRadius: 10,
                  border: '1px solid #c5a059', background: 'rgba(197,160,89,0.22)',
                  color: '#f0d9a5', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.18em', fontSize: '0.78rem',
                }}>{lang === 'zh' ? '开始调查' : 'START INVESTIGATION'}</button>
                <button className="td-ui-button td-button-ghost td-button-compact" onClick={() => openModule('profile')} style={{
                  marginTop: 8, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: '0.55rem',
                }}>✎ {lang === 'zh' ? '修改档案' : 'EDIT PROFILE'}</button>
              </div>
            )}
            <HomePortal onEnter={() => openModule('agent_market')} />
          </div>
        </div>

        {/* Right column */}
        <SideNavIcons items={sideItems} onPick={openModule} />
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 2, padding: '14px 22px 22px' }}>
        <FooterShortcuts
          items={[
            { key: 'checkin', icon: '📅', label: lang === 'zh' ? '每日签到' : 'CHECK-IN', alert: canCheckin(profile) },
            { key: 'events', icon: '🎁', label: lang === 'zh' ? '活动中心' : 'EVENTS' },
            { key: 'tutorial', icon: '📖', label: lang === 'zh' ? '新手任务' : 'ROOKIE TASKS' },
            { key: 'goals', icon: '🎯', label: lang === 'zh' ? '七日目标' : '7-DAY GOALS' },
          ]}
          onPick={openModule}
        />
      </div>

      {module === 'settings' && (
        <Suspense fallback={(
          <HomeDrawer {...getHomeModuleMeta(module, lang)} onClose={() => setModule(null)}>
            <HomeModuleSkeleton lang={lang} />
          </HomeDrawer>
        )}>
          <SettingsDrawer onClose={() => setModule(null)} />
        </Suspense>
      )}
      {module && module !== 'settings' && (() => {
        const meta = getHomeModuleMeta(module, lang);
        return (
          <HomeDrawer {...meta} onClose={() => setModule(null)} busy={busy}>
            <Suspense fallback={<HomeModuleSkeleton lang={lang} />}>
              <HomeModules
                moduleKey={module} profile={profile} busy={busy}
                onApply={applyResult} onCheckin={handleCheckin} onOpenModule={openModule} onNavigate={openCase}
                onPlanCase={planCase} hasSavedTeam={hasSavedTeam} onEnterLobby={() => enterLobby()}
              />
            </Suspense>
          </HomeDrawer>
        );
      })()}

      <StatusToast
        toast={toast}
        successEyebrow={lang === 'zh' ? '交易已确认' : 'TRANSACTION CONFIRMED'}
        errorEyebrow={lang === 'zh' ? '交易未完成' : 'TRANSACTION DECLINED'}
      />
      {checkinCelebration && (
        <CheckinCelebration
          reward={checkinCelebration.reward}
          day={checkinCelebration.day}
          lang={lang}
          onDone={closeCheckinCelebration}
        />
      )}
    </div>
  );
}
