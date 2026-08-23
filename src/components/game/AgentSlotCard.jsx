import React, { useState } from 'react';
import AgentSkillPanel from '@/components/game/AgentSkillPanel';
import PotentialPreview from '@/components/game/PotentialPreview';

const AGENT_COLORS = ['#00e5ff', '#ff6b6b', '#a78bfa'];
const AGENT_BG     = ['rgba(0,229,255,0.08)', 'rgba(255,107,107,0.08)', 'rgba(167,139,250,0.08)'];
const STANCES      = ['analytical', 'aggressive', 'cautious'];

const ATTRS = [
  { key: 'logic_power',       label: '逻辑推理',  icon: '🧠', desc: '影响推理质量与混乱抵抗' },
  { key: 'observation_focus', label: '观察力',    icon: '👁️', desc: '降低行动AP消耗' },
  { key: 'hack_level',        label: '黑客技术',  icon: '💻', desc: '解锁数字系统与加密数据' },
];

const TOTAL_POOL = 100;

function NeonSlider({ label, icon, desc, value, color, onChange, max }) {
  const pct = (value / max) * 100;
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>
          {icon} {label}
          <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 4, fontSize: '0.6rem' }}>{desc}</span>
        </span>
        <span style={{ color, fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace' }}>
          {value}<span style={{ opacity: 0.4 }}>/{max}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-200"
          style={{ width: `${pct}%`, background: `linear-gradient(to right, ${color}66, ${color})`, boxShadow: `0 0 8px ${color}80` }} />
        <input type="range" min={0} max={max} value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
    </div>
  );
}

export default function AgentSlotCard({ agent, idx, isActive, onUpdate, onClick, xp }) {
  const [showPotential, setShowPotential] = useState(false);
  const color = AGENT_COLORS[idx];
  const icons = ['👁️', '🔥', '💻'];
  const roles = ['观察型 · OBSERVER', '审讯型 · ENFORCER', '黑客型 · PHANTOM'];
  const specialties = [
    '专精现场扫描与细节发现，减少行动AP消耗',
    '专精心理审讯与对峙，混乱抵抗强',
    '专精数字渗透与加密破解，解锁隐藏线索',
  ];

  const setAttr = (key, val) => {
    // Clamp: total of this attr across all agents can't exceed 100
    const clamped = Math.max(0, Math.min(TOTAL_POOL, val));
    onUpdate(idx, { ...agent, [key]: clamped });
  };

  const usedPoints = (agent.logic_power || 0) + (agent.observation_focus || 0) + (agent.hack_level || 0);
  const maxForSlider = TOTAL_POOL;

  return (
    <div
      onClick={onClick}
      className="rounded-2xl border-2 p-4 cursor-pointer transition-all duration-300"
      style={{
        borderColor: isActive ? color : 'rgba(255,255,255,0.07)',
        background: isActive ? AGENT_BG[idx] : 'rgba(255,255,255,0.02)',
        boxShadow: isActive ? `0 0 24px ${color}40, inset 0 0 20px ${color}08` : 'none',
        transform: isActive ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: `2px solid ${color}`,
          background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
          boxShadow: isActive ? `0 0 16px ${color}80` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
          transition: 'box-shadow 0.3s',
        }}>
          {icons[idx]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate" style={{ color, textShadow: isActive ? `0 0 8px ${color}` : 'none', fontFamily: 'monospace' }}>
            {agent.agent_id}
          </div>
          <div style={{ color: `${color}99`, fontSize: '0.6rem', fontFamily: 'monospace' }}>{roles[idx]}</div>
        </div>
        {/* Point budget badge */}
        <div className="text-xs px-2 py-0.5 rounded-full border font-mono font-bold"
          style={{
            borderColor: usedPoints > 100 ? '#ff3860' : `${color}50`,
            color: usedPoints > 100 ? '#ff3860' : color,
            background: usedPoints > 100 ? '#ff386015' : `${color}10`,
          }}>
          {usedPoints}pt
        </div>
      </div>

      {/* Specialty text */}
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.6rem', fontFamily: 'monospace', marginBottom: 10, lineHeight: 1.4 }}>
        {specialties[idx]}
      </div>

      {/* Attribute sliders */}
      <div onClick={e => e.stopPropagation()}>
        {ATTRS.map(attr => (
          <NeonSlider
            key={attr.key}
            label={attr.label}
            icon={attr.icon}
            desc={''}
            value={agent[attr.key] || 0}
            color={color}
            max={maxForSlider}
            onChange={val => setAttr(attr.key, val)}
          />
        ))}
      </div>

      {/* Stance selector */}
      <div className="flex gap-1 mt-2" onClick={e => e.stopPropagation()}>
        {STANCES.map(s => (
          <button
            key={s}
            onClick={() => onUpdate(idx, { ...agent, base_stance: s })}
            className="flex-1 py-1 rounded-lg text-xs border transition-all"
            style={{
              borderColor: agent.base_stance === s ? color : 'rgba(255,255,255,0.08)',
              background: agent.base_stance === s ? `${color}18` : 'transparent',
              color: agent.base_stance === s ? color : 'rgba(255,255,255,0.25)',
              fontFamily: 'monospace',
            }}
          >
            {s === 'analytical' ? '分析' : s === 'aggressive' ? '强攻' : '谨慎'}
          </button>
        ))}
      </div>

      {/* ── Skill / Level Panel ── */}
      <AgentSkillPanel agentIdx={idx} xp={xp || 0} color={color} />

      {/* ── Potential Preview Toggle ── */}
      <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setShowPotential(v => !v)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl transition-all"
          style={{
            background: showPotential ? `${color}15` : 'rgba(255,255,255,0.03)',
            border: `1px solid ${showPotential ? color + '50' : 'rgba(255,255,255,0.07)'}`,
          }}
        >
          <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: showPotential ? color : 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.06em' }}>
            ◈ 养成潜能预览
          </span>
          {/* Toggle pill */}
          <div style={{
            width: 28, height: 14, borderRadius: 7,
            background: showPotential ? color : 'rgba(255,255,255,0.12)',
            position: 'relative',
            transition: 'background 0.2s',
            flexShrink: 0,
            boxShadow: showPotential ? `0 0 8px ${color}80` : 'none',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 2,
              left: showPotential ? 16 : 2,
              transition: 'left 0.2s',
            }} />
          </div>
        </button>

        {showPotential && (
          <PotentialPreview
            agent={agent}
            agentIdx={idx}
            xp={xp || 0}
            color={color}
          />
        )}
      </div>
    </div>
  );
}
