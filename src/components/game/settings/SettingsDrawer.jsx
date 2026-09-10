import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { useAuth } from '@/lib/AuthContext';
import { validatePassword } from '@/lib/authErrors';
import { useSettings, panelSkin, playSfx, APP_VERSION, SAVE_KEYS } from '@/lib/settings.jsx';
import { useProfile } from '@/lib/ProfileContext.jsx';
import { sanitizeProfileWrite } from '@/game/playerProfile';
import { MAX_SETTINGS_IMPORT_BYTES, normalizeSettings, parseSettingsImport } from '@/lib/settingsData.js';
import { ToggleRow, SegmentRow, ActionRow, SectionTitle } from '@/components/game/settings/SettingRow';
import StatusToast from '@/components/game/StatusToast';
import StoryModeControl from '@/components/game/theater/StoryModeControl';
import Icon from '@/components/ui/Icon.jsx';
import { noirColor } from '@/components/ui/palette.js';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion.js';

const TX = {
  zh: {
    title: '设置中心', close: '关闭',
    general: '通用 · GENERAL', language: '界面语言', languageDesc: '切换全部界面文字与本地叙事语言',
    panelLight: '面板浅色模式', panelLightDesc: '文字密集面板（设置/报告/日志/证物板）使用浅色底，主场景保持深色',
    tutorial: '调查新手教程', tutorialDesc: '每次进入调查终端时显示完整七步教程',
    av: '音效与视觉 · AUDIO & FX',
    sfx: '音效', sfxDesc: '按钮与关键事件提示音',
    scanlines: 'CRT 扫描线', scanlinesDesc: '复古显示器横向扫描纹理',
    glitch: '故障特效强度', glitchDesc: '混乱值升高时的画面撕裂程度',
    particles: '粒子动画', particlesDesc: '大厅背景与关键事件中的装饰粒子',
    reduceMotion: '减少动态效果', reduceMotionDesc: '减少装饰动画与过渡；始终遵循系统的减少动态效果偏好',
    cinematics: '行动 3D 演示', cinematicsDesc: '每两回合及重大事件播放全屏现场重演；关闭后使用快速 2D 结果镜头',
    cinematicQuality: '3D 演示画质', cinematicQualityDesc: '自动模式依据设备性能和节省流量设置选择 3D 或 2D 安全模式',
    data: '游戏数据 · DATA',
    exportL: '导出档案', exportDesc: '导出本地设置和只读云端档案，云端数据仅供查看', exportBtn: '导出',
    importL: '导入设置', importDesc: '仅恢复经过校验的设置，不导入货币、奖励、案件或现场存档', importBtn: '导入',
    resetSet: '重置设置', resetSetDesc: '恢复语言之外的全部设置为默认值', resetSetBtn: '重置',
    clearL: '清除本地偏好', clearDesc: '仅清除设置、现场缓存与新手引导，不影响云端进度', clearBtn: '清除',
    cloudReset: '云端进度保护', cloudResetDesc: '资源与案件由服务器核算，客户端不能导入或重置云端进度',
    version: '版本信息',
    account: '账户 · ACCOUNT', email: '已验证邮箱', providers: '登录方式', passwordProvider: '邮箱密码', githubProvider: 'GitHub', linked: '已绑定', notLinked: '未绑定',
    linkGithub: '绑定 GitHub', unlinkGithub: '解绑 GitHub', passwordSetup: '设置邮箱密码', passwordChange: '修改密码', passwordPlaceholder: '8–64 位，包含字母和数字', passwordSave: '保存密码',
    currentPassword: '当前密码', currentPasswordPlaceholder: '近期已登录可留空；否则用于重新验证身份',
    passwordRuleLength: '8–64 位', passwordRuleLetter: '含字母', passwordRuleNumber: '含数字',
    sync: '云端同步', syncOk: 'Firebase 身份已连接 Cloudflare D1', syncWorking: '正在同步', syncPending: '项改动等待同步', syncReadonly: '另一设备已接管，当前为只读', syncStorage: '本地存储不可用，修改已暂停', syncRecovery: '档案需要恢复，修改已暂停', syncError: '云端同步失败', logout: '退出登录', logoutDesc: '结束当前 Firebase 会话并返回登录页', logoutBtn: '退出',
    authOk: '账户登录方式已更新', authFailed: '账户操作未完成，请稍后重试', authWeak: '密码需为 8–64 位并包含字母和数字', authRecent: '请输入当前密码重新验证身份；GitHub 账号将弹窗确认', authLast: '至少需要保留一种登录方式', authConflict: '这个 GitHub 已绑定其他账号',
    authRate: '操作过于频繁，请稍后再试', authCredential: '当前密码不正确或登录凭据已失效', authProfileConflict: '该邮箱已关联其他身份档案', authNetwork: '认证服务暂时不可用，请重试',
    confirmClear: '确认清除本机偏好和现场缓存？云端档案不会变化。',
    confirmReset: '确认将设置恢复为默认值？',
    okClear: '本地存档已清除', okReset: '设置已恢复默认', okExport: '配置已导出',
    okImport: '设置已导入，云端进度未改变', errImport: '导入失败：文件格式或版本无效', importPreview: '确认恢复文件中的设置？云端进度与现场存档不会改变。',
    syncFailed: '云端同步失败，请重试',
    successStatus: '操作已完成', errorStatus: '操作未完成',
    off: '关闭', auto: '自动', low: '低', high: '高',
    yes: '确认', no: '取消',
  },
  en: {
    title: 'SETTINGS', close: 'CLOSE',
    general: 'GENERAL', language: 'Language', languageDesc: 'Switch all UI text and local narrative language',
    panelLight: 'Light Panel Mode', panelLightDesc: 'Text-heavy panels (settings/report/log/board) go light; main scene stays dark',
    tutorial: 'Investigation Tutorial', tutorialDesc: 'Show the complete seven-step guide whenever the investigation terminal opens',
    av: 'AUDIO & FX',
    sfx: 'Sound Effects', sfxDesc: 'Button and key-event cues',
    scanlines: 'CRT Scanlines', scanlinesDesc: 'Retro monitor scanline texture',
    glitch: 'Glitch Intensity', glitchDesc: 'Screen tearing as confusion rises',
    particles: 'Particle FX', particlesDesc: 'Decorative particles in the lobby and key events',
    reduceMotion: 'Reduce Motion', reduceMotionDesc: 'Reduce decorative animation and transitions; your system’s reduced-motion preference is always respected',
    cinematics: '3D Action Replays', cinematicsDesc: 'Play full-screen reenactments every two turns and on major events; disabled mode uses a quick 2D result shot',
    cinematicQuality: '3D Replay Quality', cinematicQualityDesc: 'Auto chooses 3D or the safe 2D mode from device capability and data-saver preferences',
    data: 'DATA',
    exportL: 'Export Profile', exportDesc: 'Export preferences and a read-only cloud profile for inspection', exportBtn: 'EXPORT',
    importL: 'Import Settings', importDesc: 'Restore validated preferences only, never currency, rewards, cases or run saves', importBtn: 'IMPORT',
    resetSet: 'Reset Settings', resetSetDesc: 'Restore all settings except language to defaults', resetSetBtn: 'RESET',
    clearL: 'Clear Local Preferences', clearDesc: 'Clear settings, run cache and onboarding only; cloud progress is preserved', clearBtn: 'CLEAR',
    cloudReset: 'Cloud Progress Protection', cloudResetDesc: 'Resources and cases are calculated by the server. Clients cannot import or reset cloud progress.',
    version: 'Version',
    account: 'ACCOUNT', email: 'Verified email', providers: 'Sign-in methods', passwordProvider: 'Email password', githubProvider: 'GitHub', linked: 'Linked', notLinked: 'Not linked',
    linkGithub: 'LINK GITHUB', unlinkGithub: 'UNLINK GITHUB', passwordSetup: 'Add email password', passwordChange: 'Change password', passwordPlaceholder: '8–64 chars with a letter and number', passwordSave: 'SAVE PASSWORD',
    currentPassword: 'Current password', currentPasswordPlaceholder: 'Leave blank after a recent sign-in; otherwise used to verify your identity',
    passwordRuleLength: '8–64 chars', passwordRuleLetter: 'Has a letter', passwordRuleNumber: 'Has a number',
    sync: 'Cloud sync', syncOk: 'Firebase identity connected to Cloudflare D1', syncWorking: 'Syncing', syncPending: 'changes waiting to sync', syncReadonly: 'Another device took over; this device is read-only', syncStorage: 'Local storage is unavailable; changes are paused', syncRecovery: 'Profile recovery is required; changes are paused', syncError: 'Cloud sync failed', logout: 'Sign out', logoutDesc: 'End the Firebase session and return to sign in', logoutBtn: 'SIGN OUT',
    authOk: 'Sign-in methods updated', authFailed: 'Account operation did not complete. Please retry.', authWeak: 'Password needs 8–64 characters, a letter and a number.', authRecent: 'Enter your current password to verify your identity; GitHub accounts use a popup.', authLast: 'At least one sign-in method must remain.', authConflict: 'This GitHub account is already linked elsewhere.',
    authRate: 'Too many attempts. Wait and try again.', authCredential: 'The current password is incorrect or the credential expired.', authProfileConflict: 'This email is linked to another identity profile.', authNetwork: 'Authentication is temporarily unavailable. Try again.',
    confirmClear: 'Clear local preferences and run cache? Cloud progress is preserved.',
    confirmReset: 'Restore settings to defaults?',
    okClear: 'Local saves cleared', okReset: 'Settings restored', okExport: 'Config exported',
    okImport: 'Settings imported; cloud progress unchanged', errImport: 'Import failed: invalid format or version', importPreview: 'Restore settings from this file? Cloud progress and run saves will not change.',
    syncFailed: 'Cloud sync failed. Please retry.',
    successStatus: 'OPERATION COMPLETE', errorStatus: 'OPERATION FAILED',
    off: 'OFF', auto: 'AUTO', low: 'LOW', high: 'HIGH',
    yes: 'CONFIRM', no: 'CANCEL',
  },
};

export default function SettingsDrawer({ onClose }) {
  const { lang, setLang } = useLang();
  const { user, providers, linkGitHub, unlinkGitHub, addPassword, changePassword, logout } = useAuth();
  const { settings, setSetting, resetSettings } = useSettings();
  const { profile, account, pendingCount, syncStatus } = useProfile();
  const skin = {
    ...Object.fromEntries(Object.entries(panelSkin(settings.panelLight)).map(([key, value]) => [key, noirColor(value)])),
    ...(settings.panelLight ? {
      bg: 'rgba(230,223,207,.98)', panel: 'rgba(245,240,229,.9)', text: '#182733',
      subText: '#4c5b5b', border: 'rgba(81,99,99,.3)', accent: '#426762',
    } : {}),
  };
  const { motionEnabled } = usePresentationMotion();
  const tx = TX[lang] || TX.zh;
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null); // { text, run }
  const [accountPassword, setAccountPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  const toastTimerRef = useRef(null);
  const accountPasswordState = validatePassword(accountPassword);
  const syncLabel = {
    online: tx.syncOk,
    syncing: tx.syncWorking,
    pending: `${pendingCount} ${tx.syncPending}`,
    readonly: tx.syncReadonly,
    storage_unavailable: tx.syncStorage,
    recovery: tx.syncRecovery,
    error: tx.syncError,
  }[syncStatus] || tx.syncWorking;
  const syncColor = syncStatus === 'online'
    ? '#8aaa91'
    : ['syncing', 'pending', 'loading'].includes(syncStatus) ? '#c19a63' : '#c77c78';

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.clearTimeout(toastTimerRef.current);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (saving) return;
      if (confirm) setConfirm(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, onClose, saving]);

  const notify = (msg, kind = 'success') => {
    playSfx(settings.sfxEnabled, kind);
    setToast({ id: Date.now(), message: msg, type: kind === 'error' ? 'error' : 'success' });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  };

  const closeSafely = () => { if (!saving) onClose(); };

  const runConfirmed = async () => {
    const task = confirm?.run;
    if (!task || saving) return;
    setConfirm(null);
    setSaving(true);
    try {
      await task();
    } catch {
      notify(tx.syncFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  const change = (key, value) => { setSetting(key, value); playSfx(settings.sfxEnabled, 'click'); };

  const runAccountAction = async (action) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await action();
      if (result === null || result === false) return;
      setAccountPassword('');
      setCurrentPassword('');
      notify(tx.authOk, 'success');
    } catch (error) {
      const messages = {
        weak_password: tx.authWeak,
        recent_login_required: tx.authRecent,
        last_provider: tx.authLast,
        account_exists: tx.authConflict,
        rate_limited: tx.authRate,
        invalid_credential: tx.authCredential,
        profile_conflict: tx.authProfileConflict,
        network: tx.authNetwork,
      };
      notify(messages[error?.feedbackCode] || tx.authFailed, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const payload = {
      format: 'terminal-detective-profile', schema_version: 2, app_version: APP_VERSION,
      exported_at: new Date().toISOString(), local: { settings: normalizeSettings(settings) },
      cloud_profile: profile ? sanitizeProfileWrite(profile) : null,
      cloud_profile_read_only: true,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = 'terminal-detective-config.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    notify(tx.okExport, 'success');
  };

  const handleImport = async (file) => {
    if (!file) return;
    try {
      if (file.size > MAX_SETTINGS_IMPORT_BYTES) throw new Error('Import too large.');
      const importedSettings = parseSettingsImport(await file.text());
      setConfirm({
        text: tx.importPreview,
        run: () => {
          Object.entries(importedSettings).forEach(([key, value]) => setSetting(key, value));
          notify(tx.okImport, 'success');
        },
      });
    } catch {
      notify(tx.errImport, 'error');
    }
  };

  return (
    <>
      <div onClick={closeSafely} style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,4,10,0.6)', backdropFilter: 'blur(3px)',
      }} />
      <div className="td-settings-drawer" role="dialog" aria-modal="true" aria-label={tx.title} data-td-motion={motionEnabled ? 'active' : 'paused'} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 'min(400px, 100vw)', display: 'flex', flexDirection: 'column',
        background: skin.bg,
        borderLeft: `1px solid ${skin.accent}55`,
        boxShadow: `-18px 0 50px rgba(0,0,0,0.6), inset 1px 0 0 ${skin.accent}30`,
        backdropFilter: 'blur(16px)',
        fontFamily: 'monospace',
        animation: motionEnabled ? 'settings-in 0.28s cubic-bezier(.22,1,.36,1)' : 'none',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          padding: 'calc(76px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right)) 14px 16px', borderBottom: `1px solid ${skin.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Icon name="settings" size={18} style={{ color: skin.accent }} />
            <span style={{
              fontSize: '0.82rem', fontWeight: 900, letterSpacing: '0.2em',
              color: skin.accent,
            }}>{tx.title}</span>
          </div>
          <button ref={closeRef} onClick={closeSafely} disabled={saving} style={{
            background: 'transparent', border: `1px solid ${skin.border}`, borderRadius: 7,
            color: skin.subText, cursor: 'pointer', padding: '4px 9px', fontSize: '0.58rem',
            fontFamily: 'monospace',
          }}><Icon name="close" size={15} /> {tx.close}</button>
        </div>

        {/* Body */}
        <div aria-busy={saving} style={{ flex: 1, overflowY: 'auto', padding: '4px max(16px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) 16px', pointerEvents: saving ? 'none' : 'auto', opacity: saving ? .68 : 1 }}>
          <SectionTitle skin={skin}>{tx.general}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <StoryModeControl value={settings.storyMode} onChange={value => change('storyMode', value)}
              light={settings.panelLight} disabled={saving} />
            <SegmentRow skin={skin} label={tx.language} desc={tx.languageDesc}
              value={lang}
              options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'ENGLISH' }]}
              onChange={(v) => { setLang(v); playSfx(settings.sfxEnabled, 'click'); }} />
            <ToggleRow skin={skin} label={tx.panelLight} desc={tx.panelLightDesc}
              value={settings.panelLight} onChange={(v) => change('panelLight', v)} />
            <ToggleRow skin={skin} label={tx.tutorial} desc={tx.tutorialDesc}
              value={settings.investigationTutorialEnabled}
              onChange={(v) => change('investigationTutorialEnabled', v)} />
          </div>

          <SectionTitle skin={skin}>{tx.av}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ToggleRow skin={skin} label={tx.sfx} desc={tx.sfxDesc}
              value={settings.sfxEnabled}
              onChange={(v) => { setSetting('sfxEnabled', v); playSfx(v, 'click'); }} />
            <ToggleRow skin={skin} label={tx.reduceMotion} desc={tx.reduceMotionDesc}
              value={settings.reduceMotion} onChange={(v) => change('reduceMotion', v)} />
            <ToggleRow skin={skin} label={tx.scanlines} desc={tx.scanlinesDesc}
              value={settings.scanlines} onChange={(v) => change('scanlines', v)} />
            <SegmentRow skin={skin} label={tx.glitch} desc={tx.glitchDesc}
              value={settings.glitchLevel}
              options={[{ value: 'off', label: tx.off }, { value: 'low', label: tx.low }, { value: 'high', label: tx.high }]}
              onChange={(v) => change('glitchLevel', v)} />
            <ToggleRow skin={skin} label={tx.particles} desc={tx.particlesDesc}
              value={settings.particles} onChange={(v) => change('particles', v)} />
            <ToggleRow skin={skin} label={tx.cinematics} desc={tx.cinematicsDesc}
              value={settings.cinematicsEnabled} onChange={(v) => change('cinematicsEnabled', v)} />
            <SegmentRow skin={skin} label={tx.cinematicQuality} desc={tx.cinematicQualityDesc}
              value={settings.cinematicQuality}
              options={[{ value: 'auto', label: tx.auto }, { value: 'low', label: tx.low }, { value: 'high', label: tx.high }]}
              onChange={(v) => change('cinematicQuality', v)} />
          </div>

          <SectionTitle skin={skin}>{tx.data}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionRow skin={skin} label={tx.exportL} desc={tx.exportDesc} btnLabel={tx.exportBtn} onClick={handleExport} />
            <ActionRow skin={skin} label={tx.importL} desc={tx.importDesc} btnLabel={tx.importBtn}
              onClick={() => fileRef.current?.click()} />
            <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
              onChange={e => { handleImport(e.target.files?.[0]); e.target.value = ''; }} />
            <ActionRow skin={skin} label={tx.resetSet} desc={tx.resetSetDesc} btnLabel={tx.resetSetBtn}
              onClick={() => setConfirm({
                text: tx.confirmReset,
                run: () => { resetSettings(); notify(tx.okReset, 'success'); },
              })} />
            <ActionRow skin={skin} danger label={tx.clearL} desc={tx.clearDesc} btnLabel={tx.clearBtn}
              onClick={() => setConfirm({
                text: tx.confirmClear,
                run: () => {
                  SAVE_KEYS.forEach(k => localStorage.removeItem(k));
                  resetSettings();
                  notify(tx.okClear, 'success');
                },
              })} />
            <div style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(199, 124, 120,.28)', background: 'rgba(199, 124, 120,.05)' }}>
              <div style={{ color: skin.text, fontWeight: 700, fontSize: '.7rem' }}>{tx.cloudReset}</div>
              <div style={{ color: skin.subText, fontSize: '.55rem', lineHeight: 1.5, marginTop: 4 }}>{tx.cloudResetDesc}</div>
            </div>
            <div style={{
              padding: '10px 12px', borderRadius: 9,
              border: `1px solid ${skin.border}`, background: skin.panel,
            }}>
              <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{tx.version}</div>
              <div style={{ fontSize: '0.55rem', color: skin.subText, marginTop: 4 }}>{APP_VERSION}</div>
            </div>
          </div>

          <SectionTitle skin={skin}>{tx.account}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${skin.border}`, background: skin.panel }}>
              <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{tx.email}</div>
              <div style={{ fontSize: '0.55rem', color: skin.subText, marginTop: 4 }}>{account?.email || user?.email || '—'}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${skin.border}`, background: skin.panel }}>
              <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{tx.providers}</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: skin.subText, fontSize: '.56rem' }}><Icon name="mail" size={14} /> {tx.passwordProvider} · {providers.includes('password') ? tx.linked : tx.notLinked}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: skin.subText, fontSize: '.56rem' }}>GH {tx.githubProvider} · {providers.includes('github.com') ? tx.linked : tx.notLinked}</span>
                  <button type="button" onClick={() => void runAccountAction(() => providers.includes('github.com') ? unlinkGitHub(currentPassword) : linkGitHub(currentPassword))} style={{ padding: '6px 8px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${providers.includes('github.com') ? '#c77c7860' : `${skin.accent}65`}`, background: 'transparent', color: providers.includes('github.com') ? '#dda29a' : skin.accent, fontFamily: 'monospace', fontSize: '.5rem' }}>{providers.includes('github.com') ? tx.unlinkGithub : tx.linkGithub}</button>
                </div>
              </div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${skin.border}`, background: skin.panel }}>
              <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{providers.includes('password') ? tx.passwordChange : tx.passwordSetup}</div>
              {providers.includes('password') && (
                <>
                  <div style={{ color: skin.subText, fontSize: '.5rem', marginTop: 8 }}>{tx.currentPassword}</div>
                  <input className="td-ui-input" aria-label={tx.currentPassword} type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder={tx.currentPasswordPlaceholder} style={{ width: '100%', marginTop: 5, padding: 8, borderRadius: 7, border: `1px solid ${skin.border}`, background: 'rgba(0,0,0,.25)', color: skin.text, fontFamily: 'monospace', fontSize: '.55rem' }} />
                </>
              )}
              <input className="td-ui-input" aria-label={providers.includes('password') ? tx.passwordChange : tx.passwordSetup} type="password" autoComplete="new-password" minLength={8} maxLength={64} value={accountPassword} onChange={event => setAccountPassword(event.target.value)} placeholder={tx.passwordPlaceholder} style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 7, border: `1px solid ${skin.border}`, background: 'rgba(0,0,0,.25)', color: skin.text, fontFamily: 'monospace', fontSize: '.55rem' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                {[
                  [accountPasswordState.length, tx.passwordRuleLength],
                  [accountPasswordState.letter, tx.passwordRuleLetter],
                  [accountPasswordState.number, tx.passwordRuleNumber],
                ].map(([valid, label]) => <span key={label} style={{ color: accountPassword && valid ? '#8aaa91' : skin.subText, fontSize: '.48rem' }}><Icon name={accountPassword && valid ? 'check' : 'clock'} size={11} label={accountPassword && valid ? (lang === 'zh' ? '已满足' : 'Satisfied') : (lang === 'zh' ? '未满足' : 'Not satisfied')} /> {label}</span>)}
              </div>
              <button type="button" disabled={!accountPasswordState.valid || saving} onClick={() => void runAccountAction(() => providers.includes('password') ? changePassword(accountPassword, currentPassword) : addPassword(accountPassword))} style={{ width: '100%', marginTop: 7, padding: 8, borderRadius: 7, cursor: accountPasswordState.valid && !saving ? 'pointer' : 'not-allowed', opacity: accountPasswordState.valid && !saving ? 1 : .4, border: `1px solid ${skin.accent}65`, background: `${skin.accent}13`, color: skin.accent, fontFamily: 'monospace', fontSize: '.55rem' }}>{tx.passwordSave}</button>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${skin.border}`, background: skin.panel }}>
              <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{tx.sync}</div>
              <div style={{ fontSize: '0.55rem', color: syncColor, marginTop: 4 }}><Icon name="signal" size={14} /> {syncLabel}</div>
            </div>
            <ActionRow skin={skin} danger label={tx.logout} desc={tx.logoutDesc} btnLabel={tx.logoutBtn} onClick={() => void runAccountAction(logout)} />
          </div>
        </div>
      </div>

      {/* 二次确认 */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 210, display: 'grid', placeItems: 'center',
          background: 'rgba(0,3,8,0.72)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            width: 'min(320px, 90vw)', padding: 20, borderRadius: 12, textAlign: 'center',
            background: skin.bg, border: `1px solid ${skin.accent}66`, fontFamily: 'monospace',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: '0.7rem', color: skin.text, lineHeight: 1.7 }}>{confirm.text}</div>
            <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
              <button onClick={() => void runConfirmed()} disabled={saving} style={{
                flex: 1, padding: 9, borderRadius: 8, cursor: 'pointer',
                border: '1px solid #c77c78', background: 'rgba(199, 124, 120,0.16)', color: '#c77c78',
                fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: '0.12em',
              }}>{tx.yes}</button>
              <button onClick={() => setConfirm(null)} disabled={saving} style={{
                flex: 1, padding: 9, borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${skin.border}`, background: 'transparent', color: skin.subText,
                fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: '0.12em',
              }}>{tx.no}</button>
            </div>
          </div>
        </div>
      )}

      <StatusToast toast={toast} successEyebrow={tx.successStatus} errorEyebrow={tx.errorStatus} />

      <style>{`@keyframes settings-in{from{transform:translateX(102%);opacity:0.4}to{transform:translateX(0);opacity:1}}`}</style>
    </>
  );
}
