import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

const NEURAL_CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ∑∆∇∫≈≠∞';

export default function AIProcessingIndicator({ phase = 'THINK', stressLevel = 0 }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [rain, setRain] = useState([]);

  useEffect(() => {
    const cols = 20;
    setRain(Array.from({ length: cols }, (_, i) => ({
      id: i,
      x: (i / cols) * 100,
      chars: Array.from({ length: 8 }, () => NEURAL_CHARS[Math.floor(Math.random() * NEURAL_CHARS.length)]),
      speed: 0.5 + Math.random() * 1.5,
      opacity: 0.3 + Math.random() * 0.7,
    })));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRain(prev => prev.map(col => ({
        ...col,
        chars: col.chars.map(c =>
          Math.random() < 0.1 + stressLevel * 0.01
            ? NEURAL_CHARS[Math.floor(Math.random() * NEURAL_CHARS.length)]
            : c
        )
      })));
    }, 100);
    return () => clearInterval(interval);
  }, [stressLevel]);

  const color = phase === 'THINK' ? '#bf5fff' : '#00ffff';
  const glitchOffset = stressLevel * 0.3;

  return (
    <div
      className="relative rounded-lg overflow-hidden border my-3"
      style={{
        backgroundColor: 'rgba(10,5,20,0.9)',
        borderColor: color,
        boxShadow: `0 0 20px ${color}40, inset 0 0 20px rgba(0,0,0,0.5)`,
        minHeight: '80px',
      }}
    >
      {/* Code rain background */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        {rain.map(col => (
          <div
            key={col.id}
            className="absolute top-0 text-xs leading-4"
            style={{
              left: `${col.x}%`,
              color,
              opacity: col.opacity,
              fontFamily: 'monospace',
              fontSize: '10px',
              transform: stressLevel > 50 ? `translateX(${(Math.random() - 0.5) * glitchOffset}px)` : 'none',
            }}
          >
            {col.chars.join('\n')}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex items-center gap-4 p-4">
        {/* Spinning neural orb */}
        <div className="relative flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{
              borderColor: `${color} transparent ${color} transparent`,
              borderWidth: '2px',
            }}
          />
          <div
            className="absolute inset-2 rounded-full animate-pulse"
            style={{ backgroundColor: `${color}40` }}
          />
        </div>

        <div>
          <div
            className="text-xs font-bold tracking-widest mb-1"
            style={{
              color,
              textShadow: `0 0 10px ${color}`,
              filter: stressLevel > 70 ? `hue-rotate(${stressLevel * 3}deg)` : 'none',
            }}
          >
            {phase === 'THINK'
              ? (zh ? '◈ 本地战术分析' : '◈ LOCAL TACTICAL ANALYSIS')
              : (zh ? '◈ 确定性规则校验' : '◈ DETERMINISTIC RULE VALIDATION')}
          </div>
          <div className="text-xs opacity-50" style={{ color, fontFamily: 'monospace' }}>
            {stressLevel > 50
              ? (zh ? `⚠ 战术负载 ${stressLevel}%` : `⚠ TACTICAL LOAD ${stressLevel}%`)
              : (zh ? '正在校验公开案件数据…' : 'Validating public case data…')
            }
          </div>
        </div>

        {/* Stress bar */}
        {stressLevel > 0 && (
          <div className="ml-auto flex-shrink-0 w-24">
            <div className="text-xs opacity-50 mb-1" style={{ color }}>STRESS</div>
            <div className="h-1 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${stressLevel}%`,
                  backgroundColor: stressLevel > 70 ? '#ff3860' : stressLevel > 40 ? '#ffaa00' : color,
                  boxShadow: `0 0 6px ${stressLevel > 70 ? '#ff3860' : color}`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom scan line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ backgroundColor: color, opacity: 0.5, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}
