// 全局设置：主题(面板浅色) · 音效 · 视觉特效 · 数据管理
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const KEY = 'td_settings_v1';

export const DEFAULT_SETTINGS = {
  panelLight: false,      // 文字密集面板浅色化
  sfxEnabled: true,       // 音效总开关
  scanlines: true,        // CRT 扫描线
  glitchLevel: 'high',    // off | low | high
  particles: true,        // 粒子动画
  investigationTutorialEnabled: true, // 每次进入调查显示七步教程
  cinematicsEnabled: true,// 调查行动 3D 过场
  cinematicQuality: 'auto', // 自动按设备能力选择质量
};

export const APP_VERSION = 'TERMINAL DETECTIVE · v2.2.0';

// 本地存档键位（数据管理用）
export const SAVE_KEYS = [
  'save_strategy_current',
  'save_checkpoints',
  'td_team_presets',
  'td_onboarding_seen_v1',
  'td_onboarding_seen_v2',
  'td_onboarding_nova_seen_v1',
];

export const LEGACY_CLOUD_KEYS = [
  'save_team_config', 'agent_progression_v1', 'agent_rewarded_runs_v1', 'skill_equipped_v1',
];

function readStored() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  setSetting: (_key, _value) => {},
  resetSettings: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readStored);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  const setSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return (
    <SettingsContext.Provider value={{ settings, setSetting, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() { return useContext(SettingsContext); }

// ── 面板配色（仅作用于文字密集面板） ──────────────────────────────────────
export function panelSkin(light, accent = '#00e5ff') {
  if (!light) {
    return {
      bg: 'rgba(4,10,18,0.92)',
      panel: 'rgba(0,0,0,0.4)',
      text: '#cfefff',
      subText: 'rgba(255,255,255,0.45)',
      border: `${accent}40`,
      accent,
    };
  }
  return {
    bg: 'rgba(244,247,250,0.97)',
    panel: 'rgba(255,255,255,0.85)',
    text: '#122033',
    subText: 'rgba(18,32,51,0.6)',
    border: 'rgba(18,32,51,0.18)',
    accent: '#0b6d8a',
  };
}

// ── 简易音效（无资源依赖，WebAudio 合成） ────────────────────────────────
export function playSfx(enabled, kind = 'click') {
  if (!enabled) return;
  try {
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const freqs = kind === 'success' ? [660, 880] : kind === 'error' ? [220, 165] : [520];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.02 + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22 + i * 0.08);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + 0.3 + i * 0.08);
    });
    setTimeout(() => ctx.close(), 700);
  } catch { /* ignore */ }
}
