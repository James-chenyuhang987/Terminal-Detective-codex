import React, { useEffect, useState } from 'react';

const GRADE_CONFIG = {
  S: { color: '#ffd700', label: 'PERFECT CASE', emoji: '🏆', passed: true },
  A: { color: '#00ff88', label: 'CASE SOLVED', emoji: '✅', passed: true },
  B: { color: '#ffaa00', label: 'INSUFFICIENT EVIDENCE', emoji: '⚠️', passed: false },
  C: { color: '#ff6600', label: 'FLAWED REASONING', emoji: '❌', passed: false },
  D: { color: '#ff0040', label: 'CASE DISMISSED', emoji: '💀', passed: false },
};

export default function JudgeModal({ result, onClose, onRetry }) {
  const [visible, setVisible] = useState(false);
  const cfg = GRADE_CONFIG[result?.score] || GRADE_CONFIG.C;

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
    >
      <div
        className="relative max-w-lg w-full mx-4 rounded-xl border-2 overflow-hidden transition-all duration-500"
        style={{
          borderColor: cfg.color,
          backgroundColor: '#050a14',
          boxShadow: `0 0 60px ${cfg.color}60, 0 0 120px ${cfg.color}30`,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(40px)',
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Header glow */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ backgroundColor: cfg.color, boxShadow: `0 0 20px ${cfg.color}` }}
        />

        <div className="p-8 text-center">
          {/* Grade badge */}
          <div
            className="inline-flex items-center justify-center w-24 h-24 rounded-full border-4 text-5xl mb-4"
            style={{
              borderColor: cfg.color,
              backgroundColor: `${cfg.color}15`,
              boxShadow: `0 0 30px ${cfg.color}60, inset 0 0 30px ${cfg.color}10`,
            }}
          >
            {cfg.emoji}
          </div>

          <div
            className="text-6xl font-black mb-2"
            style={{
              color: cfg.color,
              textShadow: `0 0 30px ${cfg.color}`,
              fontFamily: 'monospace',
            }}
          >
            {result?.score}
          </div>

          <div className="text-sm font-bold tracking-widest mb-6 opacity-80" style={{ color: cfg.color }}>
            {cfg.label}
          </div>

          {/* Verdict */}
          <div
            className="p-4 rounded-lg text-left mb-6 text-sm leading-relaxed"
            style={{
              backgroundColor: `${cfg.color}08`,
              border: `1px solid ${cfg.color}30`,
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'monospace',
            }}
          >
            <div className="text-xs font-bold mb-2" style={{ color: cfg.color }}>JUDGE'S VERDICT:</div>
            {result?.critique}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {cfg.passed ? (
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-lg font-bold tracking-widest border-2 transition-all hover:scale-105"
                style={{
                  borderColor: cfg.color,
                  color: cfg.color,
                  backgroundColor: `${cfg.color}15`,
                  boxShadow: `0 0 20px ${cfg.color}40`,
                }}
              >
                ◈ NEXT CASE
              </button>
            ) : (
              <>
                <button
                  onClick={onRetry}
                  className="flex-1 py-3 rounded-lg font-bold tracking-widest border-2 transition-all hover:scale-105"
                  style={{ borderColor: '#00ffff', color: '#00ffff', backgroundColor: 'rgba(0,255,255,0.1)' }}
                >
                  RETRY
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-lg font-bold tracking-widest border-2 transition-all hover:scale-105"
                  style={{ borderColor: '#ff3860', color: '#ff3860', backgroundColor: 'rgba(255,56,96,0.1)' }}
                >
                  CONTINUE
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}