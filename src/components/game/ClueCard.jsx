import React, { useState, useEffect } from 'react';

const weightColors = {
  CRITICAL: { color: '#ff3860', glow: '#ff386040' },
  HIGH:     { color: '#ffaa00', glow: '#ffaa0040' },
  MEDIUM:   { color: '#00ffff', glow: '#00ffff40' },
  LOW:      { color: '#8888aa', glow: '#8888aa40' },
};

export default function ClueCard({ clue, isNew = false, compact = false }) {
  const [flash, setFlash] = useState(isNew);
  const wc = weightColors[clue.weight] || weightColors.MEDIUM;

  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => setFlash(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 p-2 rounded text-xs transition-all duration-300"
        style={{
          backgroundColor: flash ? `${wc.glow}` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${wc.color}30`,
          boxShadow: flash ? `0 0 12px ${wc.color}60` : 'none',
        }}
      >
        <span className="text-base">{clue.visual_icon}</span>
        <div>
          <div className="font-bold" style={{ color: wc.color }}>{clue.keyword}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-3 rounded-lg border transition-all duration-500 cursor-default"
      style={{
        backgroundColor: flash ? `${wc.glow}` : 'rgba(10,15,30,0.8)',
        borderColor: flash ? wc.color : `${wc.color}50`,
        boxShadow: flash ? `0 0 20px ${wc.color}80, inset 0 0 20px ${wc.glow}` : `0 0 8px ${wc.glow}`,
        transform: flash ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-xl">{clue.visual_icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold tracking-widest" style={{ color: wc.color }}>
              {clue.keyword}
            </span>
            <span
              className="text-xs px-1 rounded"
              style={{
                backgroundColor: `${wc.color}20`,
                color: wc.color,
                border: `1px solid ${wc.color}40`,
              }}
            >
              {clue.weight}
            </span>
            <span className="text-xs opacity-30 ml-auto">{clue.clue_id}</span>
          </div>
          <p className="text-xs opacity-70 leading-relaxed">{clue.description}</p>
        </div>
      </div>
    </div>
  );
}