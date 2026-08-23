import React, { useState } from 'react';

const LS_KEY = 'td_team_presets';

export function loadPresets() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}

function savePresets(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

const ACCENT = '#00e5ff';

export default function PresetManager({ agents, onLoad }) {
  const [presets, setPresets]   = useState(() => loadPresets());
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving]     = useState(false);
  const [flash, setFlash]       = useState(null); // preset id that just loaded

  const handleSave = () => {
    const name = nameInput.trim();
    if (!name) return;
    const entry = {
      id: Date.now(),
      name,
      agents: JSON.parse(JSON.stringify(agents)),
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...presets].slice(0, 8); // max 8 presets
    setPresets(next);
    savePresets(next);
    setNameInput('');
    setSaving(false);
  };

  const handleDelete = (id) => {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    savePresets(next);
  };

  const handleLoad = (preset) => {
    onLoad(preset.agents);
    setFlash(preset.id);
    setTimeout(() => setFlash(null), 1200);
  };

  // Summary: dominant stance + total pts
  const summary = (agts) => {
    const stances = agts.map(a => a.base_stance);
    const dominant = stances.sort((a, b) =>
      stances.filter(s => s === b).length - stances.filter(s => s === a).length
    )[0];
    const pts = agts.reduce((s, a) => s + (a.logic_power||0) + (a.observation_focus||0) + (a.hack_level||0), 0);
    const stanceLabel = { analytical: '分析型', aggressive: '强攻型', cautious: '谨慎型' }[dominant] || dominant;
    return `${stanceLabel} · ${pts}pt`;
  };

  return (
    <div className="rounded-2xl border mb-4 px-4 py-3"
      style={{ borderColor: 'rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.03)' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(0,229,255,0.7)', fontWeight: 700, letterSpacing: '0.08em' }}>
          ◈ 预设策略库
        </div>
        <button
          onClick={() => setSaving(s => !s)}
          className="text-xs px-2 py-0.5 rounded-lg border transition-all hover:opacity-90"
          style={{ borderColor: 'rgba(0,229,255,0.3)', color: ACCENT, background: saving ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.05)', fontFamily: 'monospace' }}
        >
          {saving ? '✕ 取消' : '＋ 保存当前配置'}
        </button>
      </div>

      {/* Save input */}
      {saving && (
        <div className="flex gap-2 mb-3">
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSaving(false); }}
            placeholder="输入预设名称… (如: 暗网突袭·精英)"
            className="flex-1 bg-transparent border rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{ borderColor: 'rgba(0,229,255,0.3)', color: '#c0e8ff', fontFamily: 'monospace' }}
          />
          <button
            onClick={handleSave}
            disabled={!nameInput.trim()}
            className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-30"
            style={{ borderColor: ACCENT, color: ACCENT, background: 'rgba(0,229,255,0.1)', fontFamily: 'monospace' }}
          >
            确认
          </button>
        </div>
      )}

      {/* Preset list */}
      {presets.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.6rem', fontFamily: 'monospace', textAlign: 'center', padding: '8px 0' }}>
          暂无保存的预设 — 调整好队伍后点击"保存当前配置"
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {presets.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl px-3 py-2 border transition-all"
              style={{
                borderColor: flash === p.id ? ACCENT : 'rgba(255,255,255,0.06)',
                background: flash === p.id ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.02)',
                boxShadow: flash === p.id ? `0 0 14px rgba(0,229,255,0.3)` : 'none',
                transition: 'all 0.3s',
              }}
            >
              {/* Agent color dots */}
              <div className="flex gap-0.5 shrink-0">
                {['#00e5ff','#ff6b6b','#a78bfa'].map((c, i) => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: c, opacity: 0.8,
                    boxShadow: `0 0 4px ${c}`,
                  }} />
                ))}
              </div>

              {/* Name + summary */}
              <div className="flex-1 min-w-0">
                <div style={{ color: '#c0e8ff', fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.55rem', fontFamily: 'monospace' }}>
                  {summary(p.agents)}
                </div>
              </div>

              {/* Stance tags */}
              <div className="flex gap-1 shrink-0">
                {p.agents.map((a, i) => {
                  const lbl = { analytical: '析', aggressive: '攻', cautious: '慎' }[a.base_stance] || '?';
                  const c = ['#00e5ff','#ff6b6b','#a78bfa'][i];
                  return (
                    <span key={i} style={{
                      fontSize: '0.55rem', fontFamily: 'monospace', fontWeight: 700,
                      color: c, border: `1px solid ${c}40`,
                      borderRadius: 4, padding: '0 4px',
                      background: `${c}10`,
                    }}>{lbl}</span>
                  );
                })}
              </div>

              {/* Load / Delete */}
              <button
                onClick={() => handleLoad(p)}
                className="text-xs px-2 py-0.5 rounded-lg border transition-all hover:opacity-90 shrink-0"
                style={{ borderColor: 'rgba(0,229,255,0.3)', color: ACCENT, background: 'rgba(0,229,255,0.06)', fontFamily: 'monospace' }}
              >
                载入
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-xs px-1.5 py-0.5 rounded-lg border transition-all hover:opacity-80 shrink-0"
                style={{ borderColor: 'rgba(255,56,96,0.25)', color: '#ff3860', background: 'rgba(255,56,96,0.05)', fontFamily: 'monospace' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}