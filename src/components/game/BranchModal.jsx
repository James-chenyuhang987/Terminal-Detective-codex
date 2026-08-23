import React, { useEffect, useState } from 'react';

export default function BranchModal({ branch, onRollback, onRestart }) {
  const [visible, setVisible] = useState(false);
  const [glitching, setGlitching] = useState(true);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    const timer = setTimeout(() => setGlitching(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const fxColor = branch?.visual_fx === 'glitch-red' ? '#ff0040' : '#ff6600';

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center"
      style={{
        backgroundColor: glitching ? '#000' : 'rgba(0,0,0,0.9)',
        transition: 'background-color 0.5s',
      }}
    >
      {/* Glitch lines */}
      {glitching && (
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-px"
              style={{
                top: `${Math.random() * 100}%`,
                left: 0, right: 0,
                backgroundColor: fxColor,
                opacity: Math.random(),
                transform: `translateX(${(Math.random() - 0.5) * 40}px)`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className="relative max-w-md w-full mx-4 rounded-xl border-2 overflow-hidden transition-all duration-700"
        style={{
          borderColor: fxColor,
          backgroundColor: '#050005',
          boxShadow: `0 0 80px ${fxColor}60`,
          transform: visible ? 'scale(1)' : 'scale(1.1)',
          opacity: visible ? 1 : 0,
          filter: glitching ? `hue-rotate(${Math.random() * 360}deg)` : 'none',
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px" style={{ backgroundColor: fxColor, boxShadow: `0 0 20px ${fxColor}` }} />

        <div className="p-8">
          <div className="text-4xl mb-4 text-center">⚡</div>
          <div
            className="text-lg font-black tracking-widest text-center mb-6"
            style={{ color: fxColor, textShadow: `0 0 20px ${fxColor}`, fontFamily: 'monospace' }}
          >
            TIME-SPACE FRACTURE DETECTED
          </div>

          <div
            className="p-4 rounded-lg text-sm leading-relaxed mb-6"
            style={{
              backgroundColor: `${fxColor}08`,
              border: `1px solid ${fxColor}30`,
              color: 'rgba(255,255,255,0.8)',
              fontFamily: 'monospace',
            }}
          >
            {branch?.text}
          </div>

          <div className="text-xs opacity-50 text-center mb-4" style={{ color: fxColor }}>
            CHOOSE YOUR FATE:
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={onRollback}
              className="w-full py-3 rounded-lg font-bold tracking-widest border-2 text-sm transition-all hover:scale-105"
              style={{
                borderColor: '#00ffff',
                color: '#00ffff',
                backgroundColor: 'rgba(0,255,255,0.1)',
                boxShadow: '0 0 20px rgba(0,255,255,0.3)',
              }}
            >
              ◈ RECONSTRUCT LOGIC — ROLL BACK TIME
            </button>
            <button
              onClick={onRestart}
              className="w-full py-3 rounded-lg font-bold tracking-widest border-2 text-sm transition-all hover:scale-105"
              style={{
                borderColor: fxColor,
                color: fxColor,
                backgroundColor: `${fxColor}10`,
              }}
            >
              ACCEPT FATE — RESTART CASE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}