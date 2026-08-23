import React, { useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { useSettings, panelSkin, playSfx, APP_VERSION, SAVE_KEYS } from '@/lib/settings.jsx';
import { ToggleRow, SegmentRow, ActionRow, SectionTitle } from '@/components/game/settings/SettingRow';

const TX = {
  zh: {
    title: '设置中心', close: '关闭',
    general: '通用 · GENERAL', language: '界面语言', languageDesc: '切换全部界面文字与 AI 叙事语言',
    panelLight: '面板浅色模式', panelLightDesc: '文字密集面板（设置/报告/日志/证物板）使用浅色底，主场景保持深色',
    av: '音效与视觉 · AUDIO & FX',
    sfx: '音效', sfxDesc: '按钮与关键事件提示音',
    scanlines: 'CRT 扫描线', scanlinesDesc: '复古显示器横向扫描纹理',
    glitch: '故障特效强度', glitchDesc: '混乱值升高时的画面撕裂程度',
    particles: '粒子动画', particlesDesc: '大厅神经网络粒子与浮动光点',
    data: '游戏数据 · DATA',
    exportL: '导出配置', exportDesc: '将设置与探员配置保存为 JSON 文件', exportBtn: '导出',
    importL: '导入配置', importDesc: '从 JSON 文件恢复设置与探员配置', importBtn: '导入',
    resetSet: '重置设置', resetSetDesc: '恢复语言之外的全部设置为默认值', resetSetBtn: '重置',
    clearL: '清除本地存档', clearDesc: '删除探员配置、成长进度与新手引导记录', clearBtn: '清除',
    version: '版本信息',
    confirmClear: '确认清除全部本地存档？此操作不可撤销。',
    confirmReset: '确认将设置恢复为默认值？',
    okClear: '本地存档已清除', okReset: '设置已恢复默认', okExport: '配置已导出',
    okImport: '配置导入成功', errImport: '导入失败：文件格式无效',
    off: '关闭', low: '低', high: '高',
    yes: '确认', no: '取消',
  },
  en: {
    title: 'SETTINGS', close: 'CLOSE',
    general: 'GENERAL', language: 'Language', languageDesc: 'Switch all UI text and AI narration language',
    panelLight: 'Light Panel Mode', panelLightDesc: 'Text-heavy panels (settings/report/log/board) go light; main scene stays dark',
    av: 'AUDIO & FX',
    sfx: 'Sound Effects', sfxDesc: 'Button and key-event cues',
    scanlines: 'CRT Scanlines', scanlinesDesc: 'Retro monitor scanline texture',
    glitch: 'Glitch Intensity', glitchDesc: 'Screen tearing as confusion rises',
    particles: 'Particle FX', particlesDesc: 'Lobby neural particles and floating motes',
    data: 'DATA',
    exportL: 'Export Config', exportDesc: 'Save settings and agent config as JSON', exportBtn: 'EXPORT',
    importL: 'Import Config', importDesc: 'Restore settings and agent config from JSON', importBtn: 'IMPORT',
    resetSet: 'Reset Settings', resetSetDesc: 'Restore all settings except language to defaults', resetSetBtn: 'RESET',
    clearL: 'Clear Local Saves', clearDesc: 'Delete agent config, progression and onboarding state', clearBtn: 'CLEAR',
    version: 'Version',
    confirmClear: 'Clear all local saves? This cannot be undone.',
    confirmReset: 'Restore settings to defaults?',
    okClear: 'Local saves cleared', okReset: 'Settings restored', okExport: 'Config exported',
    okImport: 'Config imported', errImport: 'Import failed: invalid file',
    off: 'OFF', low: 'LOW', high: 'HIGH',
    yes: 'CONFIRM', no: 'CANCEL',
  },
};

export default function SettingsDrawer({ onClose }) {
  const { lang, setLang } = useLang();
  const { settings, setSetting, resetSettings } = useSettings();
  const skin = panelSkin(settings.panelLight);
  const tx = TX[lang] || TX.zh;
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState(null); // { text, run }
  const fileRef = useRef(null);

  const notify = (msg, kind = 'click') => {
    playSfx(settings.sfxEnabled, kind);
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  const change = (key, value) => { setSetting(key, value); playSfx(settings.sfxEnabled, 'click'); };

  const handleExport = () => {
    const payload = { version: APP_VERSION, settings, saves: {} };
    SAVE_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) payload.saves[k] = v; });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'terminal-detective-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
    notify(tx.okExport, 'success');
  };

  const handleImport = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.settings) throw new Error('bad');
      Object.entries(data.settings).forEach(([k, v]) => setSetting(k, v));
      Object.entries(data.saves || {}).forEach(([k, v]) => {
        if (SAVE_KEYS.includes(k)) localStorage.setItem(k, v);
      });
      notify(tx.okImport, 'success');
    } catch {
      notify(tx.errImport, 'error');
    }
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,4,10,0.6)', backdropFilter: 'blur(3px)',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 'min(400px, 92vw)', display: 'flex', flexDirection: 'column',
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
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${skin.border}`, borderRadius: 7,
            color: skin.subText, cursor: 'pointer', padding: '4px 9px', fontSize: '0.58rem',
            fontFamily: 'monospace',
          }}>✕ {tx.close}</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 20px' }}>
          <SectionTitle skin={skin}>{tx.general}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SegmentRow skin={skin} label={tx.language} desc={tx.languageDesc}
              value={lang}
              options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'ENGLISH' }]}
              onChange={(v) => { setLang(v); playSfx(settings.sfxEnabled, 'click'); }} />
            <ToggleRow skin={skin} label={tx.panelLight} desc={tx.panelLightDesc}
              value={settings.panelLight} onChange={(v) => change('panelLight', v)} />
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
                  notify(tx.okClear, 'error');
                },
              })} />
            <div style={{
              padding: '10px 12px', borderRadius: 9,
              border: `1px solid ${skin.border}`, background: skin.panel,
            }}>
              <div style={{ fontSize: '0.7rem', color: skin.text, fontWeight: 700 }}>{tx.version}</div>
              <div style={{ fontSize: '0.55rem', color: skin.subText, marginTop: 4 }}>{APP_VERSION}</div>
            </div>
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
              <button onClick={() => { const run = confirm.run; setConfirm(null); run(); }} style={{
                flex: 1, padding: 9, borderRadius: 8, cursor: 'pointer',
                border: '1px solid #ff3860', background: 'rgba(255,56,96,0.16)', color: '#ff3860',
                fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: '0.12em',
              }}>{tx.yes}</button>
              <button onClick={() => setConfirm(null)} style={{
                flex: 1, padding: 9, borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${skin.border}`, background: 'transparent', color: skin.subText,
                fontFamily: 'monospace', fontSize: '0.62rem', letterSpacing: '0.12em',
              }}>{tx.no}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 220,
          padding: '10px 18px', borderRadius: 10, fontFamily: 'monospace', fontSize: '0.66rem',
          border: '1px solid rgba(0,255,136,0.5)', background: 'rgba(0,20,10,0.94)', color: '#00ff88',
        }}>{toast}</div>
      )}

      <style>{`@keyframes settings-in{from{transform:translateX(102%);opacity:0.4}to{transform:translateX(0);opacity:1}}`}</style>
    </>
  );
}