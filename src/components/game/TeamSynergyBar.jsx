import React from 'react';

// Shows synergy score between agents and team capability radar
const AGENT_COLORS = ['#00e5ff', '#ff6b6b', '#a78bfa'];

function computeSynergy(agents) {
  const totalLogic = agents.reduce((s, a) => s + (a.logic_power || 0), 0);
  const totalObs   = agents.reduce((s, a) => s + (a.observation_focus || 0), 0);
  const totalHack  = agents.reduce((s, a) => s + (a.hack_level || 0), 0);

  // Synergy is higher when attributes are distributed (not all on one agent)
  const logicMax = Math.max(...agents.map(a => a.logic_power || 0));
  const obsMax   = Math.max(...agents.map(a => a.observation_focus || 0));
  const hackMax  = Math.max(...agents.map(a => a.hack_level || 0));

  const diversity = 100 - Math.round(((logicMax + obsMax + hackMax) / Math.max(totalLogic + totalObs + totalHack, 1)) * 60);
  const coverage  = Math.min(100, Math.round((Math.min(totalLogic, 100) + Math.min(totalObs, 100) + Math.min(totalHack, 100)) / 3));
  const synergy   = Math.min(100, Math.round((diversity + coverage) / 2));

  return { totalLogic, totalObs, totalHack, diversity, coverage, synergy };
}

function MiniBar({ label, value, color, icon }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between mb-0.5" style={{ fontSize: '0.6rem', fontFamily: 'monospace' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{icon} {label}</span>
        <span style={{ color, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}>
        <div style={{
          width: `${Math.min(100, value)}%`,
          height: '100%', borderRadius: 2,
          background: `linear-gradient(to right, ${color}66, ${color})`,
          boxShadow: `0 0 6px ${color}80`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

export default function TeamSynergyBar({ agents }) {
  const { totalLogic, totalObs, totalHack, diversity, coverage, synergy } = computeSynergy(agents);

  const synergyColor = synergy >= 75 ? '#00ff88'
    : synergy >= 50 ? '#ffaa00'
    : '#ff3860';

  return (
    <div className="rounded-2xl border p-4"
      style={{ borderColor: `${synergyColor}30`, background: `${synergyColor}06` }}>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
          ◈ 团队协同分析
        </div>
        <div className="flex items-center gap-2">
          <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>协同指数</div>
          <div className="text-xl font-black" style={{
            color: synergyColor,
            textShadow: `0 0 12px ${synergyColor}`,
            fontFamily: 'monospace',
          }}>
            {synergy}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniBar label="逻辑覆盖" value={Math.min(totalLogic, 100)} color={AGENT_COLORS[0]} icon="🧠" />
        <MiniBar label="观察覆盖" value={Math.min(totalObs, 100)}   color={AGENT_COLORS[1]} icon="👁️" />
        <MiniBar label="黑客覆盖" value={Math.min(totalHack, 100)}  color={AGENT_COLORS[2]} icon="💻" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginBottom: 2 }}>专长分散度</div>
          <div style={{ color: '#00e5ff', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem' }}>{diversity}%</div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginBottom: 2 }}>能力覆盖率</div>
          <div style={{ color: '#a78bfa', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem' }}>{coverage}%</div>
        </div>
      </div>

      {synergy < 50 && (
        <div className="mt-2 text-center" style={{ fontSize: '0.6rem', color: '#ff3860', fontFamily: 'monospace', opacity: 0.8 }}>
          ⚠ 专长严重重叠，建议差异化分配属性点
        </div>
      )}
      {synergy >= 80 && (
        <div className="mt-2 text-center" style={{ fontSize: '0.6rem', color: '#00ff88', fontFamily: 'monospace', opacity: 0.8 }}>
          ✦ 团队配置最优化 — 协同效率最大
        </div>
      )}
    </div>
  );
}