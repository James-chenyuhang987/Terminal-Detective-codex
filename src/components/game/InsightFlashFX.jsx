import React, { useEffect, useRef } from 'react';

// 推理突破高潮特效 — 全息闪光 + WebAudio 音效
function playBreakthroughChord() {
  try {
    const ctx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.07 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 1.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 1.5);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch {}
}

export default function InsightFlashFX({ event, onDone }) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!event) return;
    doneRef.current = false;
    playBreakthroughChord();
    const t = setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onDone(); }
    }, 4200);
    return () => clearTimeout(t);
  }, [event]);

  if (!event) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
    }}>
      {/* Holo flash layers */}
      <div style={{ position: 'absolute', inset: 0, background: '#00e5ff', animation: 'if-flash 0.5s ease-out both' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 50%, rgba(0,229,255,0.25) 0%, transparent 60%)',
        animation: 'if-glow 4s ease-out both',
      }} />
      {/* Scan sweep */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 3,
        background: 'linear-gradient(to right, transparent, #00ffff, transparent)',
        boxShadow: '0 0 30px #00ffff',
        animation: 'if-sweep 0.8s ease-out both',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', width: 560, maxWidth: '90vw',
        border: '1px solid #00ffffaa', borderRadius: 14,
        background: 'rgba(2,10,24,0.95)',
        boxShadow: '0 0 80px #00ffff40, inset 0 0 40px rgba(0,255,255,0.06)',
        padding: '24px 26px', textAlign: 'center',
        animation: 'if-card 0.5s 0.25s cubic-bezier(.22,1,.36,1) both',
      }}>
        <div style={{
          fontSize: '1.4rem', fontWeight: 900, color: '#00ffff',
          letterSpacing: '0.25em', textShadow: '0 0 24px #00ffff',
          animation: 'if-title 1.2s ease-in-out infinite alternate',
        }}>
          ⚡ 推理突破！
        </div>
        <div style={{ fontSize: '0.5rem', color: 'rgba(0,255,255,0.5)', letterSpacing: '0.3em', marginTop: 4, marginBottom: 14 }}>
          DEDUCTION BREAKTHROUGH
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
          <ClueChip icon={event.iconA} label={event.keywordA} />
          <div style={{ color: '#00ffff', fontSize: '1.1rem', animation: 'if-link 0.8s ease-in-out infinite alternate' }}>⟺</div>
          <ClueChip icon={event.iconB} label={event.keywordB} />
        </div>
        <div style={{
          color: '#e0f7ff', fontSize: '0.68rem', lineHeight: 1.8,
          padding: '12px 14px', borderRadius: 10,
          border: '1px solid rgba(0,255,255,0.25)', background: 'rgba(0,255,255,0.05)',
        }}>
          {event.reveal}
        </div>
        {event.synergy && (
          <div style={{ marginTop: 10, fontSize: '0.5rem', color: '#00ff88' }}>
            🔗 协同技能「交叉验证」已生效 — 推理难度降低
          </div>
        )}
      </div>

      <style>{`
        @keyframes if-flash { 0%{opacity:0.7} 100%{opacity:0} }
        @keyframes if-glow { 0%{opacity:1} 100%{opacity:0} }
        @keyframes if-sweep { 0%{top:0;opacity:1} 100%{top:100%;opacity:0} }
        @keyframes if-card { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        @keyframes if-title { from{text-shadow:0 0 16px #00ffff} to{text-shadow:0 0 40px #00ffff,0 0 80px #00ffff60} }
        @keyframes if-link { from{transform:scale(1)} to{transform:scale(1.3)} }
      `}</style>
    </div>
  );
}

function ClueChip({ icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      border: '1px solid rgba(0,255,255,0.4)', borderRadius: 8,
      padding: '6px 12px', background: 'rgba(0,255,255,0.08)',
      color: '#00ffff', fontSize: '0.6rem', fontWeight: 700,
    }}>
      <span>{icon}</span>{label}
    </div>
  );
}
