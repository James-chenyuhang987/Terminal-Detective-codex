import React from 'react';

export default function StatBar({ label, value, max = 100, color = '#00ffff', warning = false }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isLow = pct < 25;
  const displayColor = isLow ? '#ff3860' : warning ? '#ffaa00' : color;

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs opacity-60" style={{ fontFamily: 'monospace' }}>{label}</span>
        <span
          className="text-xs font-bold"
          style={{
            color: displayColor,
            textShadow: `0 0 6px ${displayColor}`,
            fontFamily: 'monospace',
          }}
        >
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: displayColor,
            boxShadow: `0 0 6px ${displayColor}`,
            animation: isLow ? 'pulse 1s ease-in-out infinite' : 'none',
          }}
        />
      </div>
    </div>
  );
}