import React, { useState } from 'react';
import { LocalStorage } from '@/game/gameState';

const STANCES = ['aggressive', 'cautious', 'analytical'];
const ROLES = ['Lead_Investigator', 'Forensic', 'Hacker'];

function NeonSlider({ label, value, onChange, color = '#00ffff' }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-bold tracking-widest opacity-70">{label}</span>
        <span className="text-sm font-bold" style={{ color, textShadow: `0 0 8px ${color}` }}>
          {value.toString().padStart(3, '0')}
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="w-full h-1 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        <div
          className="absolute h-1 rounded"
          style={{
            width: `${value}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}`,
            left: 0,
          }}
        />
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          className="absolute w-full h-6 opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div
          className="absolute w-3 h-3 rounded-full border-2 pointer-events-none"
          style={{
            left: `calc(${value}% - 6px)`,
            borderColor: color,
            backgroundColor: '#0a0f1e',
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      </div>
    </div>
  );
}

export default function AgentConfigPanel({ onSave, initialConfig }) {
  const [config, setConfig] = useState(initialConfig || LocalStorage.loadStrategy());
  const [rules, setRules] = useState(config.custom_rules || []);
  const [newCondition, setNewCondition] = useState('');
  const [newAction, setNewAction] = useState('');

  // Derive visual params from attributes
  const auraColor = (() => {
    const obs = config.combat_attributes?.observation_focus || 50;
    // interpolate between cold blue (#00aaff) and alarm red (#ff3860)
    const r = Math.round(0 + (obs / 100) * 255);
    const g = Math.round(170 - (obs / 100) * 170);
    const b = Math.round(255 - (obs / 100) * 255);
    return `rgb(${r},${g},${b})`;
  })();
  const pulseRate = ((100 - (config.combat_attributes?.logic_power || 70)) * 0.05 + 1).toFixed(2);

  const update = (path, value) => {
    setConfig(prev => {
      const clone = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let obj = clone;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;
      return clone;
    });
  };

  const addRule = () => {
    if (!newCondition || !newAction) return;
    const updated = [...rules, { condition: newCondition, action: newAction }];
    setRules(updated);
    setConfig(prev => ({ ...prev, custom_rules: updated }));
    setNewCondition(''); setNewAction('');
  };

  const removeRule = (idx) => {
    const updated = rules.filter((_, i) => i !== idx);
    setRules(updated);
    setConfig(prev => ({ ...prev, custom_rules: updated }));
  };

  const handleSave = () => {
    const finalConfig = {
      ...config,
      custom_rules: rules,
      visual_parameters: {
        base_color: auraColor,
        pulse_rate_ms: parseFloat(pulseRate) * 1000,
      },
      engine_modifiers: {
        confusion_resistance: (config.combat_attributes?.logic_power || 70) / 100,
        ap_cost_discount: (config.combat_attributes?.observation_focus || 60) / 200,
      }
    };
    LocalStorage.saveStrategy(finalConfig);
    onSave(finalConfig);
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto" style={{ fontFamily: 'monospace' }}>
      {/* Agent Identity */}
      <div className="p-4 rounded-lg border" style={{ borderColor: '#00ffff30', backgroundColor: 'rgba(0,255,255,0.03)' }}>
        <div className="text-xs font-bold tracking-widest mb-3" style={{ color: '#00ffff' }}>◈ AGENT IDENTITY</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-50 block mb-1">AGENT ID</label>
            <input
              value={config.agent_id || ''}
              onChange={e => update('agent_id', e.target.value)}
              className="w-full bg-transparent border rounded px-2 py-1 text-xs text-white"
              style={{ borderColor: '#00ffff40' }}
            />
          </div>
          <div>
            <label className="text-xs opacity-50 block mb-1">ROLE</label>
            <select
              value={config.role || 'Lead_Investigator'}
              onChange={e => update('role', e.target.value)}
              className="w-full bg-gray-900 border rounded px-2 py-1 text-xs text-white"
              style={{ borderColor: '#00ffff40' }}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Live preview hologram */}
      <div
        className="flex items-center justify-center p-6 rounded-lg border relative overflow-hidden"
        style={{ borderColor: auraColor + '60', minHeight: '120px' }}
      >
        <div className="absolute inset-0 opacity-20" style={{
          background: `radial-gradient(circle at center, ${auraColor}40, transparent 70%)`,
        }} />
        <div className="relative text-center">
          <div
            className="text-5xl mb-2"
            style={{
              animation: `pulse ${pulseRate}s ease-in-out infinite`,
              filter: `drop-shadow(0 0 20px ${auraColor})`,
            }}
          >
            🤖
          </div>
          <div className="text-xs font-bold tracking-widest" style={{ color: auraColor }}>
            {config.agent_id || 'AGENT'}
          </div>
          <div className="text-xs opacity-50 mt-1">PULSE: {pulseRate}s</div>
        </div>
      </div>

      {/* Base Stance */}
      <div className="p-4 rounded-lg border" style={{ borderColor: '#bf5fff30', backgroundColor: 'rgba(191,95,255,0.03)' }}>
        <div className="text-xs font-bold tracking-widest mb-3" style={{ color: '#bf5fff' }}>◈ BASE STANCE</div>
        <div className="flex gap-2">
          {STANCES.map(s => (
            <button
              key={s}
              onClick={() => update('base_stance', s)}
              className="flex-1 py-2 rounded text-xs font-bold border transition-all duration-300"
              style={{
                borderColor: config.base_stance === s ? '#bf5fff' : '#bf5fff20',
                backgroundColor: config.base_stance === s ? '#bf5fff20' : 'transparent',
                color: config.base_stance === s ? '#bf5fff' : '#ffffff60',
                boxShadow: config.base_stance === s ? '0 0 12px #bf5fff40' : 'none',
              }}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Combat Attributes */}
      <div className="p-4 rounded-lg border" style={{ borderColor: '#ffaa0030', backgroundColor: 'rgba(255,170,0,0.03)' }}>
        <div className="text-xs font-bold tracking-widest mb-3" style={{ color: '#ffaa00' }}>◈ NEURAL ATTRIBUTES</div>
        <NeonSlider
          label="LOGIC POWER"
          value={config.combat_attributes?.logic_power || 70}
          onChange={v => update('combat_attributes.logic_power', v)}
          color="#00ffff"
        />
        <NeonSlider
          label="OBSERVATION FOCUS"
          value={config.combat_attributes?.observation_focus || 60}
          onChange={v => update('combat_attributes.observation_focus', v)}
          color={auraColor}
        />
      </div>

      {/* IF-THEN Rules */}
      <div className="p-4 rounded-lg border" style={{ borderColor: '#ff386030', backgroundColor: 'rgba(255,56,96,0.03)' }}>
        <div className="text-xs font-bold tracking-widest mb-3" style={{ color: '#ff3860' }}>◈ IF-THEN DIRECTIVES</div>
        {rules.map((rule, idx) => (
          <div key={idx} className="flex items-start gap-2 mb-2 p-2 rounded text-xs" style={{ backgroundColor: 'rgba(255,56,96,0.05)', border: '1px solid #ff386020' }}>
            <div className="flex-1">
              <span className="opacity-50">IF </span>
              <span style={{ color: '#ff3860' }}>{rule.condition}</span>
              <span className="opacity-50"> → THEN </span>
              <span style={{ color: '#00ffff' }}>{rule.action}</span>
            </div>
            <button onClick={() => removeRule(idx)} className="opacity-40 hover:opacity-100 text-red-400">✕</button>
          </div>
        ))}
        <div className="space-y-2 mt-2">
          <input
            value={newCondition}
            onChange={e => setNewCondition(e.target.value)}
            placeholder="IF condition (e.g. NPC refuses)..."
            className="w-full bg-transparent border rounded px-2 py-1 text-xs"
            style={{ borderColor: '#ff386040', color: 'white' }}
          />
          <input
            value={newAction}
            onChange={e => setNewAction(e.target.value)}
            placeholder="THEN action (e.g. present evidence)..."
            className="w-full bg-transparent border rounded px-2 py-1 text-xs"
            style={{ borderColor: '#00ffff40', color: 'white' }}
          />
          <button
            onClick={addRule}
            className="w-full py-1 rounded text-xs font-bold border transition-all"
            style={{ borderColor: '#ff3860', color: '#ff3860' }}
          >
            + ADD DIRECTIVE
          </button>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full py-3 rounded-lg font-bold tracking-widest text-sm border-2 transition-all duration-300 hover:scale-105"
        style={{
          borderColor: '#00ffff',
          color: '#00ffff',
          backgroundColor: 'rgba(0,255,255,0.1)',
          boxShadow: '0 0 20px rgba(0,255,255,0.3)',
          textShadow: '0 0 10px #00ffff',
        }}
      >
        ◈ DEPLOY AGENT CONFIGURATION
      </button>
    </div>
  );
}