import React, { useEffect, useRef, useState } from 'react';

// 高能音效：上升扫频 → 撞击和弦 → 熔炼余韵
function playForgeSound(isCore) {
  try {
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);

    // 1. 上升扫频（蓄力）
    const sweep = ctx.createOscillator();
    const sg = ctx.createGain();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(90, now);
    sweep.frequency.exponentialRampToValueAtTime(1400, now + 0.85);
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.22, now + 0.8);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, now);
    lp.frequency.exponentialRampToValueAtTime(6000, now + 0.9);
    sweep.connect(lp); lp.connect(sg); sg.connect(master);
    sweep.start(now); sweep.stop(now + 1.05);

    // 2. 撞击和弦（熔炼瞬间）
    const chord = isCore ? [220, 330, 440, 660] : [196, 294, 392];
    chord.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + 0.88);
      g.gain.exponentialRampToValueAtTime(0.2, now + 0.93);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      o.connect(g); g.connect(master);
      o.start(now + 0.88); o.stop(now + 2.3);
    });

    // 3. 白噪撞击
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const noise = ctx.createBufferSource();
    const ng = ctx.createGain();
    ng.gain.value = 0.3;
    noise.buffer = buf;
    noise.connect(ng); ng.connect(master);
    noise.start(now + 0.88);

    setTimeout(() => ctx.close(), 2800);
  } catch { /* 静音环境下忽略 */ }
}

// 熔炼合体视效：两张线索卡向中心撞击 → 熔融粒子 → 冲击波 → 凝成印记
export default function FusionForgeFX({ clueA, clueB, isCore, onDone }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const [stage, setStage] = useState('charge'); // charge → impact → sigil

  useEffect(() => {
    playForgeSound(isCore);
    const t1 = setTimeout(() => setStage('impact'), 880);
    const t2 = setTimeout(() => setStage('sigil'), 1500);
    const t3 = setTimeout(() => onDone?.(), 2600);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    const hot = isCore ? ['#ff3860', '#ff8a00', '#ffe066'] : ['#00e5ff', '#a78bfa', '#ffffff'];
    const sparks = [];
    startRef.current = performance.now();

    const draw = () => {
      const w = canvas.width, h = canvas.height;
      const cx = w / 2, cy = h / 2;
      const el = (performance.now() - startRef.current) / 1000;
      ctx.clearRect(0, 0, w, h);

      // 熔融流线：两侧向中心汇聚
      const conv = Math.min(1, el / 0.88);
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 22; i++) {
          const p = ((el * 1.6 + i / 22) % 1);
          const x = cx + s * (1 - p) * (w * 0.42) * (1 - conv * 0.35);
          const y = cy + Math.sin(i * 1.7 + el * 5) * 46 * (1 - p);
          ctx.beginPath();
          ctx.arc(x, y, 1.6 + p * 2.4, 0, Math.PI * 2);
          ctx.fillStyle = hot[i % hot.length] + 'cc';
          ctx.shadowBlur = 14; ctx.shadowColor = hot[i % hot.length];
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // 撞击瞬间：喷射火星 + 冲击波
      if (el > 0.86 && sparks.length === 0) {
        for (let i = 0; i < 160; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 9;
          sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: hot[i % hot.length] });
        }
      }
      sparks.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.985; p.life -= 0.014;
        if (p.life <= 0) return;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.strokeStyle = p.c + Math.floor(p.life * 220).toString(16).padStart(2, '0');
        ctx.lineWidth = 1.6;
        ctx.stroke();
      });

      if (el > 0.86) {
        [0, 0.16, 0.32].forEach((off, k) => {
          const t = el - 0.86 - off;
          if (t < 0 || t > 0.8) return;
          ctx.beginPath();
          ctx.arc(cx, cy, t * (420 + k * 90), 0, Math.PI * 2);
          ctx.strokeStyle = hot[k % hot.length] + Math.floor((1 - t / 0.8) * 200).toString(16).padStart(2, '0');
          ctx.lineWidth = 3 - k;
          ctx.stroke();
        });
      }

      // 中心熔核
      const coreR = el < 0.86 ? 6 + conv * 26 : 34 + Math.sin(el * 12) * 5;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, hot[2]);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(rafRef.current); };
  }, [isCore]);

  const charging = stage === 'charge';
  const accent = isCore ? '#ff3860' : '#00e5ff';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 220, background: '#000',
      fontFamily: 'monospace', overflow: 'hidden',
      animation: 'forge-in 0.2s ease both',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* 撞击白闪 */}
      {stage !== 'charge' && (
        <div style={{ position: 'absolute', inset: 0, background: '#fff', animation: 'forge-flash 0.55s ease-out both' }} />
      )}

      {/* 两张线索卡向中心熔炼 */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: charging ? 260 : 0,
        transition: 'gap 0.85s cubic-bezier(.7,0,.3,1)',
      }}>
        {[clueA, clueB].map((c, i) => (
          <div key={i} style={{
            width: 108, padding: '12px 8px', textAlign: 'center',
            border: `1px solid ${accent}90`, background: 'rgba(6,8,16,0.9)',
            boxShadow: `0 0 24px ${accent}70`,
            transform: charging ? 'scale(1)' : 'scale(0.25) rotate(' + (i ? 14 : -14) + 'deg)',
            opacity: charging ? 1 : 0,
            filter: charging ? 'none' : 'blur(3px) brightness(2.4)',
            transition: 'all 0.6s cubic-bezier(.7,0,.3,1)',
          }}>
            <div style={{ fontSize: 26, filter: `drop-shadow(0 0 10px ${accent})` }}>{c?.visual_icon || '🔍'}</div>
            <div style={{ fontSize: '0.48rem', color: '#e8e8f5', marginTop: 6 }}>{c?.keyword}</div>
          </div>
        ))}
      </div>

      {/* 凝成印记 */}
      {stage === 'sigil' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          animation: 'sigil-in 0.5s cubic-bezier(.22,1,.36,1) both',
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            border: `2px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 60px ${accent}, inset 0 0 40px ${accent}80`,
            fontSize: 34,
          }}>🧩</div>
          <div style={{
            fontSize: '0.62rem', letterSpacing: '0.34em', color: '#fff',
            textShadow: `0 0 18px ${accent}`,
          }}>
            {isCore ? 'CORE FUSION' : 'EVIDENCE FUSED'}
          </div>
          <div style={{ fontSize: '0.48rem', letterSpacing: '0.2em', color: `${accent}cc` }}>
            {clueA?.keyword} ⟺ {clueB?.keyword}
          </div>
        </div>
      )}

      <style>{`
        @keyframes forge-in{from{opacity:0}to{opacity:1}}
        @keyframes forge-flash{0%{opacity:0.95}100%{opacity:0}}
        @keyframes sigil-in{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
      `}</style>
    </div>
  );
}
