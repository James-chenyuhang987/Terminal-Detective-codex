import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/Icon';
import { noirColor } from '@/components/ui/palette';

const weightColors = {
  CRITICAL: { color: '#c77c78', glow: '#c77c7840' },
  HIGH:     { color: '#c19a63', glow: '#c19a6340' },
  MEDIUM:   { color: '#709f9a', glow: '#709f9a40' },
  LOW:      { color: '#9b9aae', glow: '#9b9aae40' },
};

export default function ClueCard({ clue, isNew = false, compact = false }) {
  const [flash, setFlash] = useState(isNew);
  const weightStyle = weightColors[clue.weight] || weightColors.MEDIUM;
  const wc = { color: noirColor(weightStyle.color), glow: noirColor(weightStyle.glow) };

  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => setFlash(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  if (compact) {
    return (
      <div
        className="td-clue-card is-compact flex items-center gap-2 p-2 rounded text-xs transition-all duration-300"
        style={{
          backgroundColor: flash ? `${wc.glow}` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${wc.color}30`,
          boxShadow: flash ? `inset 3px 0 0 ${wc.color}` : 'none',
        }}
      >
        <Icon name={clue.visual_icon} size={18} style={{ color: wc.color }} />
        <div>
          <div className="font-bold" style={{ color: wc.color }}>{clue.keyword}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="td-clue-card p-3 rounded-lg border transition-all duration-500 cursor-default"
      style={{
        backgroundColor: flash ? `${wc.glow}` : 'rgba(10,15,30,0.8)',
        borderColor: flash ? wc.color : `${wc.color}50`,
        boxShadow: flash ? `inset 3px 0 0 ${wc.color}` : '0 4px 12px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-start gap-2">
        <Icon name={clue.visual_icon} size={22} style={{ color: wc.color }} />
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
