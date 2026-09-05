import React, { useId } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { normalizeStoryMode, STORY_MODES } from '@/game/storyMode';

export default function StoryModeControl({ value, onChange, disabled = false, light = false }) {
  const { lang } = useLang();
  const name = useId();
  const selected = normalizeStoryMode(value);
  const accent = light ? '#0b6d8a' : '#7df1ff';
  const text = light ? '#122033' : '#e2f2ff';
  const detail = light ? '#40576c' : '#a7b8cb';
  const labels = {
    theater: lang === 'zh' ? '3D侦探剧情模式' : '3D Detective Story',
    terminal: lang === 'zh' ? '终端文字剧情模式' : 'Terminal Text Story',
  };

  return (
    <fieldset className="td-story-mode-control" disabled={disabled} style={{
      minWidth: 0, margin: 0, padding: 12, borderRadius: 10,
      border: `1px solid ${accent}55`, background: light ? '#f5f8fc' : 'rgba(3,12,23,.85)',
      color: text, fontFamily: 'monospace',
    }}>
      <legend style={{ padding: '0 6px', color: accent, fontSize: '.75rem', fontWeight: 800 }}>
        {lang === 'zh' ? '剧情呈现模式' : 'Story presentation'}
      </legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
        {STORY_MODES.map(mode => (
          <label key={mode} style={{
            minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 7, padding: '12px 8px', borderRadius: 8,
            border: `1px solid ${selected === mode ? accent : `${accent}40`}`,
            background: selected === mode ? `${accent}18` : 'transparent',
            cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .6 : 1,
          }}>
            <input type="radio" name={name} value={mode} checked={selected === mode}
              onChange={() => onChange(mode)} style={{ marginTop: 3, flexShrink: 0, accentColor: accent }} />
            <span style={{ minWidth: 0, fontSize: '.7rem', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
              <strong>{labels[mode]}</strong>
              <span style={{ display: 'block', color: detail, fontSize: '.6rem' }}>{mode === 'theater' ? 'THEATER · 3D' : 'TERMINAL · TEXT'}</span>
            </span>
          </label>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', color: detail, fontSize: '.65rem', lineHeight: 1.7 }}>
        {lang === 'zh'
          ? '同一案件、同一进度，仅改变呈现方式。切换不消耗体力或货币，不重开案件；与行动 3D 过场开关独立。'
          : 'Same case and progress, different presentation. Switching costs no energy or currency and never restarts a case. Separate from 3D action replays.'}
      </p>
    </fieldset>
  );
}
