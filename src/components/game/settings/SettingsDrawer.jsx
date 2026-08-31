import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { useAuth } from '@/lib/AuthContext';
import { useSettings, panelSkin, playSfx, APP_VERSION, SAVE_KEYS } from '@/lib/settings.jsx';
import { useProfile } from '@/lib/ProfileContext.jsx';
import { migrateProfileV2, normalizeProfile, sanitizeProfileWrite } from '@/game/playerProfile';
import { ToggleRow, SegmentRow, ActionRow, SectionTitle } from '@/components/game/settings/SettingRow';
import StatusToast from '@/components/game/StatusToast';

const TX = {
  zh: {
    title: '设置中心', close: '关闭',
    general: '通用 · GENERAL', language: '界面语言', languageDesc: '切换全部界面文字与 AI 叙事语言',
    panelLight: '面板浅色模式', panelLightDesc: '文字密集面板（设置/报告/日志/证物板）使用浅色底，主场景保持深色',
    tutorial: '调查新手教程', tutorialDesc: '每次进入调查终端时显示完整七步教程',
    av: '音效与视觉 · AUDIO & FX',
    sfx: '音效', sfxDesc: '按钮与关键事件提示音',
    scanlines: 'CRT 扫描线', scanlinesDesc: '复古显示器横向扫描纹理',
    glitch: '故障特效强度', glitchDesc: '混乱值升高时的画面撕裂程度',
    particles: '粒子动画', particlesDesc: '大厅神经网络粒子与浮动光点',
    cinematics: '行动 3D 演示', cinematicsDesc: '每两回合及重大事件播放全屏现场重演；关闭后使用快速 2D 结果镜头',
    data: '游戏数据 · DATA',
    exportL: '导出档案', exportDesc: '导出版本化本地设置与合法云端进度字段', exportBtn: '导出',
    importL: '导入档案', importDesc: '校验并预览 JSON 后恢复设置与云端进度', importBtn: '导入',
    resetSet: '重置设置', resetSetDesc: '恢复语言之外的全部设置为默认值', resetSetBtn: '重置',
    clearL: '清除本地偏好', clearDesc: '仅清除设置、现场缓存与新手引导，不影响云端进度', clearBtn: '清除',
    cloudReset: '重置云端进度', cloudResetDesc: '清空经济、任务、案件、编队与探员成长；需要输入侦探代号确认', cloudResetBtn: '重置云端',
    version: '版本信息',
    account: '账户 · ACCOUNT', email: '登录邮箱', sync: '云端同步', syncOk: '已连接 Cloudflare', logout: '退出登录', logoutDesc: '结束当前安全会话并返回登录页', logoutBtn: '退出',
    confirmClear: '确认清除本机偏好和现场缓存？云端档案不会变化。',
    confirmReset: '确认将设置恢复为默认值？',
    okClear: '本地存档已清除', okReset: '设置已恢复默认', okExport: '配置已导出',
    okImport: '档案导入成功', errImport: '导入失败：文件格式或版本无效', importPreview: '确认导入：本地设置与云端进度将被覆盖。',
    resetCode: '请输入当前侦探代号以确认', resetMismatch: '代号不匹配', okCloudReset: '云端进度已重置', syncFailed: '云端同步失败，请重试',
    successStatus: '操作已完成', errorStatus: '操作未完成',
    off: '关闭', low: '低', high: '高',
    yes: '确认', no: '取消',
  },
  en: {
    title: 'SETTINGS', close: 'CLOSE',
    general: 'GENERAL', language: 'Language', languageDesc: 'Switch all UI text and AI narration language',
    panelLight: 'Light Panel Mode', panelLightDesc: 'Text-heavy panels (settings/report/log/board) go light; main scene stays dark',
    tutorial: 'Investigation Tutorial', tutorialDesc: 'Show the complete seven-step guide whenever the investigation terminal opens',
    av: 'AUDIO & FX',
    sfx: 'Sound Effects', sfxDesc: 'Button and key-event cues',
    scanlines: 'CRT Scanlines', scanlinesDesc: 'Retro monitor scanline texture',
    glitch: 'Glitch Intensity', glitchDesc: 'Screen tearing as confusion rises',
    particles: 'Particle FX', particlesDesc: 'Lobby neural particles and floating motes',
    cinematics: '3D Action Replays', cinematicsDesc: 'Play full-screen reenactments every two turns and on major events; disabled mode uses a quick 2D result shot',
    data: 'DATA',
    exportL: 'Export Profile', exportDesc: 'Export versioned local preferences and valid cloud progress fields', exportBtn: 'EXPORT',
    importL: 'Import Profile', importDesc: 'Validate and preview JSON before restoring local and cloud data', importBtn: 'IMPORT',
    resetSet: 'Reset Settings', resetSetDesc: 'Restore all settings except language to defaults', resetSetBtn: 'RESET',
    clearL: 'Clear Local Preferences', clearDesc: 'Clear settings, run cache and onboarding only; cloud progress is preserved', clearBtn: 'CLEAR',
    cloudReset: 'Reset Cloud Progress', cloudResetDesc: 'Clear economy, tasks, cases, squad and agent growth; codename confirmation required', cloudResetBtn: 'RESET CLOUD',
    version: 'Version',
    account: 'ACCOUNT', email: 'Signed-in email', sync: 'Cloud sync', syncOk: 'Connected to Cloudflare', logout: 'Sign out', logoutDesc: 'End the secure session and return to sign in', logoutBtn: 'SIGN OUT',
    confirmClear: 'Clear local preferences and run cache? Cloud progress is preserved.',
    confirmReset: 'Restore settings to defaults?',
    okClear: 'Local saves cleared', okReset: 'Settings restored', okExport: 'Config exported',
    okImport: 'Profile imported', errImport: 'Import failed: invalid format or version', importPreview: 'Import local settings and overwrite cloud progress?',
    resetCode: 'Enter the current detective codename to confirm', resetMismatch: 'Codename does not match', okCloudReset: 'Cloud progress reset', syncFailed: 'Cloud sync failed. Please retry.',
    successStatus: 'OPERATION COMPLETE', errorStatus: 'OPERATION FAILED',
    off: 'OFF', low: 'LOW', high: 'HIGH',
    yes: 'CONFIRM', no: 'CANCEL',
  },
};

export default function SettingsDrawer({ onClose }) {
  const { lang, setLang } = useLang();
  const { user, logout } = useAuth();
  const { settings, setSetting, resetSettings } = useSettings();
  const { profile, account, syncStatus, mutate } = useProfile();
  const skin = panelSkin(settings.panelLight);
  const tx = TX[lang] || TX.zh;
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null); // { text, run }
  const [resetCode, setResetCode] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  const toastTimerRef = useRef(null);

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

  const handleExport = () => {
    const payload = {
      format: 'terminal-detective-profile', schema_version: 2, app_version: APP_VERSION,
      exported_at: new Date().toISOString(), local: { settings, saves: {} },
      cloud_profile: profile ? sanitizeProfileWrite(profile) : null,
    };
    SAVE_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) payload.local.saves[k] = v; });
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
      const data = JSON.parse(await file.text());
      if (data?.format !== 'terminal-detective-profile' || data?.schema_version !== 2 || !data.local?.settings || !data.cloud_profile) throw new Error('bad');
      const previewProfile = migrateProfileV2(data.cloud_profile, null);
      setConfirm({
        text: `${tx.importPreview} · ${previewProfile.detective_name || '—'} · Lv.${previewProfile.level} · 🪙${previewProfile.gold} · 💎${previewProfile.diamonds}`,
        run: async () => {
          await mutate(current => ({ profile: { ...current, ...sanitizeProfileWrite(previewProfile) } }));
          Object.entries(data.local.settings).forEach(([k, v]) => {
            if (Object.prototype.hasOwnProperty.call(settings, k)) setSetting(k, v);
          });
          Object.entries(data.local.saves || {}).forEach(([k, v]) => {
            if (SAVE_KEYS.includes(k) && typeof v === 'string') localStorage.setItem(k, v);
          });
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
      <div role="dialog" aria-modal="true" aria-label={tx.title} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 'min(400px, 100vw)', display: 'flex', flexDirection: 'column',
        background: skin.bg,
        borderLeft: `1px solid ${skin.accent}55`,
        boxShadow: `-18px 0 50px rgba(0,0,0,0.6), inset 1px 0 0 ${skin.accent}30`,
        backdropFilter: 'blur(16px) saturate(150%)',
        fontFamily: 'monospace',
        animation: 'settings-in 0.28s cubic-bezier(.22,1,.36,1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: `1px solid ${skin.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 15 }}>⚙️</span>
            <span style={{
              fontSize: '0.82rem', fontWeight: 900, letterSpacing: '0.2em',
              color: skin.accent, textShadow: settings.panelLight ? 'none' : `0 0 12px ${skin.accent}70`,
            }}>{tx.title}</span>
          </div>
          <button ref={closeRef} onClick={closeSafely} disabled={saving} style={{
            background: 'transparent', border: `1px solid ${skin.border}`, borderRadius: 7,
            color: skin.subText, cursor: 'pointer', padding: '4px 9px', fontSize: '0.58rem',
            fontFamily: 'monospace',
          }}>✕ {tx.close}</button>
        </div>

        {/* Body */}
        <div aria-busy={saving} style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 20px', pointerEvents: saving ? 'none' : 'auto', opacity: saving ? .68 : 1 }}>
          <SectionTitle skin={skin}>{tx.general}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            <div style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,56,96,.28)', background: 'rgba(255,56,96,.05)' }}>
              <div style={{ color: skin.text, fontWeight: 700, fontSize: '.7rem' }}>{tx.cloudReset}</div>
              <div style={{ color: skin.subText, fontSize: '.55rem', lineHeight: 1.5, marginTop: 4 }}>{tx.cloudResetDesc}</div>
              <input value={resetCode} onChange={event => setResetCode(event.target.value)} placeholder={tx.resetCode} style={{ width: '100%', marginTop: 9, padding: 8, borderRadius: 7, border: '1px solid rgba(255,56,96,.3)', background: 'rgba(0,0,0,.25)', color: skin.text, fontFamily: 'monospace' }} />
              <button disabled={!profile?.detective_name || resetCode !== profile.detective_name} onClick={() => setConfirm({
                text: tx.cloudResetDesc,
                run: async () => {
                  const identity = {
                    detective_name: profile.detective_name, avatar: profile.avatar, signature: profile.signature,
                    identity_badge: profile.identity_badge, detective_tags: profile.detective_tags,
                  };
                  await mutate(() => ({ profile: normalizeProfile(identity) }));
                  setResetCode('');
                  notify(tx.okCloudReset, 'success');
                },
              })} style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 7, border: '1px solid #ff386080', background: 'rgba(255,56,96,.12)', color: '#ff7890', fontFamily: 'monospace', cursor: resetCode === profile?.detective_name ? 'pointer' : 'not-allowed', opacity: resetCode === profile?.detective_name ? 1 : .42 }}>{tx.cloudResetBtn}</button>
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
              <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{tx.sync}</div>
              <div style={{ fontSize: '0.55rem', color: syncStatus === 'online' ? '#00b878' : syncStatus === 'syncing' ? '#ffaa00' : '#ff6b84', marginTop: 4 }}>● {syncStatus === 'online' ? tx.syncOk : syncStatus.toUpperCase()}</div>
            </div>
            <ActionRow skin={skin} danger label={tx.logout} desc={tx.logoutDesc} btnLabel={tx.logoutBtn} onClick={logout} />
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
                border: '1px solid #ff3860', background: 'rgba(255,56,96,0.16)', color: '#ff3860',
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
