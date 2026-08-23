import React, { useEffect, useState } from 'react';
import { useSettings } from '@/lib/settings.jsx';

export default function GlitchOverlay({ intensity = 0, type = 'default' }) {
  const { settings } = useSettings();
  const [lines, setLines] = useState([]);

  const scale = settings.glitchLevel === 'off' ? 0 : settings.glitchLevel === 'low' ? 0.45 : 1;
  const level = intensity * scale;

  useEffect(() => {
    if (level <= 0) return;
    const count = Math.floor(level / 10);
    setLines(Array.from({ length: count }, (_, i) => ({
      id: i,
      top: Math.random() * 100,
      width: 20 + Math.random() * 80,
      height: 1 + Math.random() * 3,
      opacity: 0.3 + Math.random() * 0.7,
      color: type === 'red' ? '#ff0040' : type === 'blue' ? '#0040ff' : '#00ffff',
      delay: Math.random() * 0.5,
    })));
  }, [level, type]);

  if (level <= 0 && !settings.scanlines) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
      style={{ opacity: Math.max(level / 100, settings.scanlines ? 0.35 : 0) }}
    >
      {level > 0 && lines.map(line => (
        <div
          key={line.id}
          className="absolute"
          style={{
            top: `${line.top}%`,
            left: `${Math.random() * 20}%`,
            width: `${line.width}%`,
            height: `${line.height}px`,
            backgroundColor: line.color,
            opacity: line.opacity,
            animation: `glitchLine ${0.1 + Math.random() * 0.3}s ${line.delay}s infinite`,
            boxShadow: `0 0 6px ${line.color}`,
          }}
        />
      ))}
      {/* Scan lines */}
      {settings.scanlines && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)',
            mixBlendMode: 'overlay',
          }}
        />
      )}
      {/* Color aberration */}
      {level > 50 && (
        <>
          <div className="absolute inset-0" style={{
            backgroundColor: 'rgba(255,0,64,0.05)',
            transform: `translateX(${level * 0.02}px)`,
            mixBlendMode: 'screen',
          }} />
          <div className="absolute inset-0" style={{
            backgroundColor: 'rgba(0,255,255,0.05)',
            transform: `translateX(${-level * 0.02}px)`,
            mixBlendMode: 'screen',
          }} />
        </>
      )}
    </div>
  );
}