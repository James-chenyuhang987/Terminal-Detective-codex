import React, { useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';

// 协同技能解锁全屏特效 — 冲击波 + 光束 + 技能卡 + 音效
function playUnlockChord() {
  try {
    const ctx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
    const now = ctx.currentTime;
    [392, 523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.1, now + i * 0.06 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 1.2);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch {}
}

export default function SynergyUnlockFX({ skill, onDone }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const timerRef = useRef(null);

  useEffect(() => {
    if (!skill) return;
    playUnlockChord();
    timerRef.current = setTimeout(onDone, 2800);
    return () => clearTimeout(timerRef.current);
  }, [skill]);

  if (!skill) return null;
  const c = skill.color;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
    }}>
      {/* 边缘染色 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, transparent 40%, ${c}30 100%)`,
        animation: 'su-tint 2.6s ease-out both',
      }} />

      {/* 冲击波环 */}
      {[0, 0.18, 0.36].map((d, i) => (
        <div key={i} style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          border: `2px solid ${c}`, boxShadow: `0 0 40px ${c}`,
          animation: `su-ring 1.5s ${d}s cubic-bezier(.2,.7,.3,1) both`,
        }} />
      ))}

      {/* 放射光束 */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={`b${i}`} style={{
          position: 'absolute', width: 2, height: '46vh',
          background: `linear-gradient(to top, transparent, ${c})`,
          transformOrigin: 'bottom center',
          transform: `rotate(${i * 30}deg) translateY(-50%)`,
          animation: `su-beam 1.1s ${i * 0.03}s ease-out both`,
        }} />
      ))}

      {/* 技能卡 */}
      <div style={{
        position: 'relative', width: 420, maxWidth: '88vw',
        border: `1px solid ${c}`, borderRadius: 16,
        background: 'rgba(2,8,20,0.95)',
        boxShadow: `0 0 70px ${c}55, inset 0 0 40px ${c}12`,
        padding: '22px 26px', textAlign: 'center',
        animation: 'su-card 0.55s 0.2s cubic-bezier(.22,1,.36,1) both',
      }}>
        <div style={{ fontSize: '0.5rem', color: `${c}aa`, letterSpacing: '0.35em', marginBottom: 10 }}>
          {zh ? '协同技能激活' : 'SYNERGY UNLOCKED'}
        </div>
        <div style={{
          fontSize: '3rem', lineHeight: 1, marginBottom: 8,
          filter: `drop-shadow(0 0 22px ${c})`,
          animation: 'su-icon 1.4s ease-in-out infinite alternate',
        }}>{skill.icon}</div>
        <div style={{
          fontSize: '1.35rem', fontWeight: 900, color: c,
          letterSpacing: '0.2em', textShadow: `0 0 26px ${c}`,
        }}>{zh ? skill.name : skill.nameEn}</div>
        <div style={{
          marginTop: 6, display: 'inline-block',
          fontSize: '0.46rem', color: `${c}cc`,
          border: `1px solid ${c}50`, borderRadius: 5,
          padding: '2px 9px', background: `${c}12`,
        }}>{zh ? skill.condition : skill.conditionEn}</div>
        <div style={{
          marginTop: 14, padding: '11px 14px', borderRadius: 10,
          border: `1px solid ${c}35`, background: `${c}0a`,
          color: '#e6f7ff', fontSize: '0.66rem', lineHeight: 1.75,
        }}>
          <span style={{ color: '#00ff88', fontWeight: 900 }}>◉ {zh ? '增益效果 ' : 'BONUS EFFECT '}</span>
          {zh ? skill.desc : skill.descEn}
        </div>
      </div>

      <style>{`
        @keyframes su-tint { 0%{opacity:0} 25%{opacity:1} 100%{opacity:0} }
        @keyframes su-ring { from{transform:scale(0.2);opacity:1} to{transform:scale(4.5);opacity:0} }
        @keyframes su-beam { 0%{opacity:0} 40%{opacity:0.75} 100%{opacity:0} }
        @keyframes su-card { from{opacity:0;transform:scale(0.82) translateY(14px)} to{opacity:1;transform:none} }
        @keyframes su-icon { from{transform:scale(1)} to{transform:scale(1.14)} }
      `}</style>
    </div>
  );
}
