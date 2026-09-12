import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { canCheckin, ACHIEVEMENT_TOTAL, knownAchievementCount } from '@/game/playerProfile';
import { publicErrorMessage } from '@/lib/publicError.js';
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
import HomeTopbarActions from '@/components/game/home/HomeTopbarActions';
import StatusToast from '@/components/game/StatusToast';
import HomeDrawer from '@/components/game/home/HomeDrawer';
import { getHomeModuleMeta } from '@/components/game/home/homeModuleMeta';
import { transactionErrorMessage } from '@/game/transactionFeedback';
import { useSettings } from '@/lib/settings.jsx';
import StoryModeControl from '@/components/game/theater/StoryModeControl';
import Icon from '@/components/ui/Icon.jsx';
import ScreenTabs from '@/components/ui/ScreenTabs.jsx';
import FittedPanel from '@/components/ui/FittedPanel.jsx';

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

export default function DetectiveHome({ onEnterLobby, onOpenCases, onRegister, onStartInvestigation = null, suspendedCase = null, onResume = () => {} }) {
  const { lang } = useLang();
  const { settings, updateSetting } = useSettings();
  const {
    profile,
    command,
    pendingCount,
    refresh,
    syncStatus,
    takeOver,
    isReadOnly,
  } = useProfile();
  const [busy, setBusy] = useState(false);
  const [module, setModule] = useState(null);
  const [homeTab, setHomeTab] = useState('overview');
  const [toast, setToast] = useState(null);
  const [checkinCelebration, setCheckinCelebration] = useState(null);
  const toastTimerRef = useRef(null);
  const busyRef = useRef(false);
  const resumeRef = useRef(null);
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
    ? '#8aaa91'
    : ['syncing', 'pending', 'loading'].includes(syncStatus) ? '#c19a63' : '#c77c78';

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    if (suspendedCase) resumeRef.current?.focus({ preventScroll: true });
  }, [suspendedCase]);

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

  const notifySaved = (message) => {
    if (message) notify(message);
  };

  const applyResult = async (intent, message = '') => {
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
    if (!intent || typeof intent.type !== 'string') return rejectResult(null);
    busyRef.current = true;
    setBusy(true);
    try {
      const { type, ...args } = intent;
      const evaluated = await command(type, args);
      if (!evaluated?.profile || evaluated.error || evaluated.pending) return rejectResult(evaluated);
      notifySaved(message);
      return evaluated;
    } catch (cause) {
      notify(publicErrorMessage(cause, lang), 'error');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleName = async (name) => {
    await applyResult({ type: 'identity', patch: { detective_name: name } });
  };

  const handleCheckin = async () => {
    const saved = await applyResult({ type: 'checkin' });
    if (!saved?.reward) return;
    const { reward, day } = saved;
    const parts = [reward.energy ? `⚡+${reward.energy}` : '', reward.gold ? `🪙+${reward.gold}` : '', reward.diamonds ? `💎+${reward.diamonds}` : ''].filter(Boolean).join(' · ');
    notifySaved(`${lang === 'zh' ? '签到成功' : 'Check-in complete'} · ${parts || '🎁'}`);
    setCheckinCelebration({ reward, day });
  };

  const enterLobby = (targetCaseId = null) => {
    if (suspendedCase) { onResume(); return; }
    onEnterLobby(targetCaseId);
    if (!isReadOnly) {
      void command('visit_lobby').catch(cause => notify(publicErrorMessage(cause, lang), 'error'));
    }
  };

  const openCase = (caseId) => {
    setModule(null);
    if (suspendedCase) { onResume(); return; }
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
    if (suspendedCase) { onResume(); return; }
    if (onStartInvestigation) { onStartInvestigation(); return; }
    if (profile.saved_team_config) openModule('cases');
    else void enterLobby();
  };

  if (!profile) {
    return (
      <div style={{ minHeight: '100dvh', background: '#08121c', display: 'grid', placeItems: 'center', color: '#709f9a', fontFamily: 'monospace', fontSize: '0.75rem' }}>
        {loadError ? <div style={{ textAlign: 'center' }}><div style={{ color: '#dda29a', marginBottom: 12 }}>{lang === 'zh' ? '读取云端档案失败' : 'Failed to load cloud profile'}</div><button onClick={retryLoad} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #709f9a80', background: 'rgba(112, 159, 154,.1)', color: '#a5c8c0', cursor: 'pointer', fontFamily: 'monospace' }}>{lang === 'zh' ? '重试' : 'RETRY'}</button></div> : (lang === 'zh' ? '读取侦探档案…' : 'LOADING DETECTIVE PROFILE…')}
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
  const topActions = lang === 'zh' ? [
    { icon: '✉️', key: 'comms', label: '通讯' },
    { icon: '📅', key: 'checkin', label: '签到' },
    { icon: '🔧', key: 'settings', label: '设置' },
  ] : [
    { icon: '✉️', key: 'comms', label: 'COMMS' },
    { icon: '📅', key: 'checkin', label: 'CHECK-IN' },
    { icon: '🔧', key: 'settings', label: 'SETTINGS' },
  ];

  return (
    <div className="td-home td-page-shell" style={{
      position: 'relative',
      background: '#07090e',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column',
    }}>
      <HomeBackdrop />

      {/* Top bar */}
      <div className="td-home-topbar" style={{
        position: 'relative', zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '12px 22px', borderBottom: '1px solid rgba(112, 159, 154,0.14)',
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
        <div className="td-home-topbar-tools">
        <ResourceBar profile={profile} onPick={openModule} />
        <HomeTopbarActions actions={topActions} onAction={openModule} syncLabel={syncLabel} syncColor={syncColor} buildId={BUILD_ID} lang={lang} />
        </div>
      </div>

      <header className="td-home-heading">
        <h1>{lang === 'zh'
          ? `侦探${named ? profile.detective_name : 'XXX'}的家`
          : `${named ? profile.detective_name : 'XXX'}'S DETECTIVE HOME`}</h1>
        <p><Icon name="search" size={15} /> {lang === 'zh' ? '每一个线索，都是揭开真相的钥匙' : 'EVERY CLUE IS A KEY TO THE TRUTH'}</p>
      </header>

      <ScreenTabs id="home" className="td-home-tabs" label={lang === 'zh' ? '侦探之家栏目' : 'Detective home sections'}
        tabs={[
          { key: 'overview', label: lang === 'zh' ? '总览' : 'OVERVIEW' },
          { key: 'intel', label: lang === 'zh' ? '情报' : 'INTEL' },
          { key: 'services', label: lang === 'zh' ? '功能' : 'SERVICES' },
        ]} value={homeTab} onChange={setHomeTab} />

      {/* Body */}
      <div className="td-home-grid" data-home-tab={homeTab} style={{
        position: 'relative', zIndex: 2,
        flex: 1, display: 'grid', gap: 20, padding: '26px 22px',
        gridTemplateColumns: 'minmax(190px, 220px) 1fr minmax(180px, 210px)',
        alignItems: 'start',
      }}>
        {/* Left column */}
        <FittedPanel id="home-panel-intel" labelledBy="home-tab-intel" title={lang === 'zh' ? '今日情报' : 'DAILY INTEL'} icon="file"
          summary={<>
            <p>{lang === 'zh' ? '优先案件与今日额外奖励已更新' : 'Priority case and daily bonus updated'}</p>
            <p>{lang === 'zh' ? '未解案件' : 'OPEN CASES'} · {profile.unsolved_count}</p>
            <p>{lang === 'zh' ? '成就徽章' : 'ACHIEVEMENTS'} · {knownAchievementCount(profile)} / {ACHIEVEMENT_TOTAL}</p>
          </>}
          className="td-home-left" contentClassName="td-home-panel-stack">
          <InfoCard icon="📰" title={lang === 'zh' ? '今日情报' : 'DAILY INTEL'} alert desc={lang === 'zh' ? '优先案件与今日额外奖励已更新' : 'Priority case and daily bonus updated'}
            btnLabel={lang === 'zh' ? '查看详情' : 'VIEW INTEL'} onClick={() => openModule('intel')} />
          <InfoCard icon="🗂" title={lang === 'zh' ? '未解案件' : 'OPEN CASES'} big={String(profile.unsolved_count).padStart(2, '0')}
            unit={lang === 'zh' ? '个案件待调查' : 'cases pending'} btnLabel={lang === 'zh' ? '进入案件簿' : 'OPEN ARCHIVE'} onClick={() => openModule('cases')} />
          <InfoCard icon="🏅" title={lang === 'zh' ? '成就徽章' : 'ACHIEVEMENTS'} big={knownAchievementCount(profile)}
            unit={`/ ${ACHIEVEMENT_TOTAL}`} btnLabel={lang === 'zh' ? '查看成就' : 'VIEW'} onClick={() => openModule('achievements')} />
        </FittedPanel>

        {/* Center */}
        <FittedPanel id="home-panel-overview" labelledBy="home-tab-overview" title={lang === 'zh' ? '侦探之家总览' : 'DETECTIVE HOME OVERVIEW'} icon="search"
          summary={<>
            <div className="td-home-summary-emblem" aria-hidden="true"><Icon name="detective" size={54} /></div>
            <strong>{settings.storyMode === 'terminal' ? (lang === 'zh' ? '终端模式' : 'TERMINAL MODE') : (lang === 'zh' ? '剧场模式' : 'THEATER MODE')}</strong>
            <p>{suspendedCase
              ? (lang === 'en' ? (suspendedCase.en?.title || suspendedCase.subtitle || suspendedCase.title) : suspendedCase.title)
              : (named ? (lang === 'zh' ? '调查终端待命 · 随时出发' : 'INVESTIGATION TERMINAL · READY') : (lang === 'zh' ? '设定代号，建立侦探档案' : 'SET YOUR CODENAME TO BEGIN'))}</p>
            <p>{lang === 'zh' ? '剧情模式 · 当前调查 · 身份档案 · 探员事务所' : 'Story mode · Investigation · Identity · Agent bureau'}</p>
          </>}
          className="td-home-center" contentClassName="td-home-panel-stack td-home-overview-stack">

          <div style={{ width: '100%', maxWidth: 600 }}>
            <StoryModeControl value={settings.storyMode} onChange={value => updateSetting('storyMode', value)} />
          </div>
          {suspendedCase && (
            <section aria-label={lang === 'zh' ? '进行中的调查' : 'Investigation in progress'} style={{
              width: '100%', maxWidth: 600, padding: 16, borderRadius: 12,
              border: '1px solid #c5a66f80', background: 'rgba(44,32,13,.9)', color: '#e1d0ac',
            }}>
              <h2 style={{ margin: 0, fontSize: '.85rem' }}>
                {lang === 'zh' ? '调查已暂存' : 'Investigation suspended'} · {lang === 'en' ? (suspendedCase.en?.title || suspendedCase.subtitle || suspendedCase.title) : suspendedCase.title}
              </h2>
              <p style={{ fontSize: '.7rem', lineHeight: 1.7, color: '#d5c7ae' }}>
                {lang === 'zh'
                  ? '案件与编队已由云端保存。切换模式、刷新页面或重新登录后均可继续同一调查，不再扣费。镜头位置和未提交的草稿仅在当前页面保留。'
                  : 'Your case and squad are saved in the cloud. Resume the same investigation after switching modes, reloading, or signing in again without another charge. Camera position and unsent drafts remain only in this page.'}
              </p>
              <button type="button" className="td-ui-button td-button-gold" onClick={onResume} style={{
                minHeight: 44, padding: '10px 16px', borderRadius: 8, border: '1px solid #c5a66f',
                background: '#c5a66f20', color: '#e1d0ac', cursor: 'pointer', fontFamily: 'monospace',
              }}>{lang === 'zh' ? '继续当前调查' : 'Resume current investigation'}</button>
            </section>
          )}

          <div className="td-home-overview-cards">
            {!named ? (
              onRegister
                ? <div className="td-ui-card td-home-investigate-card" style={{
                    width: 300, border: '1px solid rgba(112, 159, 154,0.4)', borderRadius: 14, padding: 20,
                    background: 'linear-gradient(160deg, rgba(112, 159, 154,0.12), rgba(0,0,0,0.8))', textAlign: 'center',
                  }}>
                    <div style={{ color: '#a5c8c0' }}><Icon name="id" size={28} /></div>
                    <div style={{ color: '#709f9a', fontWeight: 900, letterSpacing: '0.16em', fontSize: '0.9rem', margin: '8px 0 6px' }}>
                      {lang === 'zh' ? '尚未注册身份' : 'IDENTITY NOT REGISTERED'}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                      {lang === 'zh' ? '设定代号、头像与个性签名' : 'Set your codename, avatar and signature'}
                    </div>
                    <button className="td-ui-button td-button-primary td-button-wide" onClick={onRegister} style={{
                      width: '100%', padding: 11, cursor: 'pointer', borderRadius: 10,
                      border: '1px solid #709f9a', background: 'rgba(112, 159, 154,0.18)',
                      color: '#e6dfcf', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.18em', fontSize: '0.78rem',
                    }}>{lang === 'zh' ? '前往注册' : 'REGISTER IDENTITY'}</button>
                  </div>
                : <NameInputDialog onConfirm={handleName} busy={busy} />
            ) : (
              <div className="td-ui-card td-home-investigate-card" style={{
                width: 300, border: '1px solid rgba(197, 166, 111,0.5)', borderRadius: 14, padding: '20px',
                background: 'linear-gradient(160deg, rgba(197, 166, 111,0.16), rgba(0,0,0,0.8))', textAlign: 'center',
                boxShadow: '0 14px 28px rgba(0,0,0,.3)',
              }}>
                <div style={{ color: '#c5a66f' }}><Icon name="search" size={28} /></div>
                <div style={{ color: '#c5a66f', fontWeight: 900, letterSpacing: '0.2em', fontSize: '1rem', margin: '8px 0 6px' }}>
                  {suspendedCase ? (lang === 'zh' ? '「继续调查」' : 'RESUME INVESTIGATION') : (lang === 'zh' ? '「开始调查」' : 'START INVESTIGATION')}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                  {lang === 'zh'
                    ? `代号 ${profile.detective_name} · 侦探之旅已启程`
                    : `CODENAME ${profile.detective_name} · YOUR INVESTIGATION BEGINS`}
                </div>
                <button className="td-ui-button td-button-gold td-button-wide" onClick={quickStart} style={{
                  width: '100%', padding: '11px', cursor: 'pointer', borderRadius: 10,
                  border: '1px solid #c5a66f', background: 'rgba(197, 166, 111,0.22)',
                  color: '#e1d0ac', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.18em', fontSize: '0.78rem',
                }}>{suspendedCase ? (lang === 'zh' ? '继续调查' : 'RESUME INVESTIGATION') : (lang === 'zh' ? '开始调查' : 'START INVESTIGATION')}</button>
                <button className="td-ui-button td-button-ghost td-button-compact" onClick={() => openModule('profile')} style={{
                  marginTop: 8, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: '0.55rem',
                }}><Icon name="edit" /> {lang === 'zh' ? '修改档案' : 'EDIT PROFILE'}</button>
              </div>
            )}
            <HomePortal onEnter={() => openModule('agent_market')} />
          </div>
        </FittedPanel>

        {/* Right column */}
        <FittedPanel id="home-panel-services" labelledBy="home-tab-services" title={lang === 'zh' ? '侦探之家功能' : 'HOME SERVICES'} icon="settings"
          summary={sideItems.map(item => item.label).join(' · ')}
          className="td-home-services" contentClassName="td-home-panel-stack">
          <SideNavIcons items={sideItems} onPick={openModule} />
        </FittedPanel>
      </div>

      {/* Footer */}
      <div className="td-home-footer" style={{ position: 'relative', zIndex: 2, padding: '14px 22px 22px' }}>
        <div className="td-home-primary-actions">
          <button ref={resumeRef} type="button" className="td-ui-button td-button-gold" onClick={suspendedCase ? onResume : named ? quickStart : onRegister} disabled={!named && !onRegister}>
            <Icon name="search" /> {suspendedCase ? (lang === 'zh' ? '继续调查' : 'RESUME') : named ? (lang === 'zh' ? '开始调查' : 'INVESTIGATE') : (lang === 'zh' ? '注册身份' : 'REGISTER')}
          </button>
          <button type="button" className="td-ui-button" onClick={() => enterLobby()} disabled={!named}>
            <Icon name="users" /> {lang === 'zh' ? '探员大厅' : 'AGENT HALL'}
          </button>
        </div>
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
