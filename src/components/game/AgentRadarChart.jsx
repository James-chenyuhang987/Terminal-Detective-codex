import React, { useMemo } from 'react';

const AXES = [
  { key: 'logic_power',         label: 'LOGIC',   labelZh: '逻辑', max: 100, color: '#00e5ff' },
  { key: 'observation_focus',   label: 'OBS',     labelZh: '观察', max: 100, color: '#a78bfa' },
  { key: 'confusion_resistance',label: 'CHAOS',   labelZh: '抗扰', max: 100, color: '#00ff88' },
  { key: 'ap_cost_discount',    label: 'AP',      labelZh: '折扣', max: 30,  color: '#ffaa00' },
  { key: 'hack_level',          label: 'HACK',    labelZh: '黑客', max: 100, color: '#ff6b35' },
];

const N = AXES.length;
const CX = 80, CY = 80, R = 62;

// angle for axis i: start from top (-90°), evenly spaced
const angleOf = (i) => (Math.PI * 2 * i) / N - Math.PI / 2;

const polarToXY = (r, angle) => ({
  x: CX + r * Math.cos(angle),
  y: CY + r * Math.sin(angle),
});

export default function AgentRadarChart({ agent, agentColor, allAgents, size = 160 }) {
  // Build polygon points for one agent's data
  const buildPoints = (a) =>
    AXES.map((axis, i) => {
      const val = (a?.[axis.key] || 0) / axis.max;
      return polarToXY(R * val, angleOf(i));
    });

  const currentPoints = useMemo(() => buildPoints(agent), [agent]);

  // Build team avg polygon (faint background)
  const avgPoints = useMemo(() => {
    if (!allAgents?.length) return null;
    return AXES.map((axis, i) => {
      const avg = allAgents.reduce((s, a) => s + (a?.[axis.key] || 0), 0) / allAgents.length / axis.max;
      return polarToXY(R * avg, angleOf(i));
    });
  }, [allAgents]);

  // Grid rings (25%, 50%, 75%, 100%)
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        width={size} height={size}
        viewBox="0 0 160 160"
        style={{ overflow: 'visible', display: 'block' }}
      >
        {/* ── Grid rings ── */}
        {rings.map((frac) => {
          const pts = AXES.map((_, i) => polarToXY(R * frac, angleOf(i)));
          return (
            <polygon
              key={frac}
              points={pts.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={frac === 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'}
              strokeWidth={frac === 0.5 ? 0.8 : 0.5}
              strokeDasharray={frac === 0.5 ? '3 3' : 'none'}
            />
          );
        })}

        {/* ── Axis lines ── */}
        {AXES.map((axis, i) => {
          const end = polarToXY(R, angleOf(i));
          return (
            <line
              key={i}
              x1={CX} y1={CY} x2={end.x} y2={end.y}
              stroke="rgba(255,255,255,0.1)" strokeWidth="0.6"
            />
          );
        })}

        {/* ── Team avg background polygon ── */}
        {avgPoints && (
          <polygon
            points={avgPoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.8"
            strokeDasharray="3 4"
          />
        )}

        {/* ── Current agent filled polygon ── */}
        <polygon
          points={currentPoints.map(p => `${p.x},${p.y}`).join(' ')}
          fill={`${agentColor}22`}
          stroke={agentColor}
          strokeWidth="1.5"
          style={{ filter: `drop-shadow(0 0 4px ${agentColor}80)`, transition: 'all 0.25s ease' }}
        />

        {/* ── Vertex dots ── */}
        {currentPoints.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y} r="2.8"
            fill={AXES[i].color}
            style={{ filter: `drop-shadow(0 0 4px ${AXES[i].color})`, transition: 'all 0.25s ease' }}
          />
        ))}

        {/* ── Axis labels ── */}
        {AXES.map((axis, i) => {
          const labelR = R + 14;
          const pos = polarToXY(labelR, angleOf(i));
          return (
            <g key={i}>
              <text
                x={pos.x} y={pos.y + 3}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="7.5" fontFamily="monospace" fontWeight="700"
                fill={axis.color}
              >
                {axis.label}
              </text>
              <text
                x={pos.x} y={pos.y + 11}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="6" fontFamily="monospace"
                fill={`${axis.color}80`}
              >
                {axis.labelZh}
              </text>
            </g>
          );
        })}

        {/* ── Center dot ── */}
        <circle cx={CX} cy={CY} r="2" fill={agentColor} opacity="0.5" />
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 10, height: 2, background: `${agentColor}`, borderRadius: 1 }} />
          <span style={{ fontSize: '0.38rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>当前探员</span>
        </div>
        {avgPoints && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 10, height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 1, borderTop: '1px dashed rgba(255,255,255,0.4)' }} />
            <span style={{ fontSize: '0.38rem', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>队伍均值</span>
          </div>
        )}
      </div>
    </div>
  );
}
