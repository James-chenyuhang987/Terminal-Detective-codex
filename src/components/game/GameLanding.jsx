import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

// ── Animated matrix rain background ──────────────────────────────────────────
function MatrixRain({ color = '#00ff88' }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ΑΒΓΔΨΩαβγδψω∑∞§#@!'.split('');
    const fontSize = 13;
    let drops = [];
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      drops = Array(Math.ceil(canvas.width / fontSize)).fill(1).map(() => Math.random() * -50);
    };
    resize();
    window.addEventListener('resize', resize);
    const tick = () => {
      ctx.fillStyle = 'rgba(3,6,15,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color + '55';
      ctx.font = `${fontSize}px monospace`;
      drops.forEach((y, i) => {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(ch, i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.5;
      });
    };
    let frameId;
    let lastFrame = 0;
    const animate = (timestamp) => {
      if (timestamp - lastFrame >= 50) {
        tick();
        lastFrame = timestamp;
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frameId); window.removeEventListener('resize', resize); };
  }, [color]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.55 }} />;
}

function Scanlines() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{
      background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px)',
      zIndex: 1,
    }} />
  );
}

function FeatureCard({ icon, title, desc, color, delay }) {
  return (
    <div className="td-ui-card td-feature-card" style={{
      border: `1px solid ${color}30`,
      background: `linear-gradient(135deg, ${color}08 0%, rgba(0,0,0,0.4) 100%)`,
      borderRadius: 16, padding: '20px 18px',
      backdropFilter: 'blur(8px)',
      animation: `card-in 0.6s ${delay}s cubic-bezier(.22,1,.36,1) both`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}`, borderRadius: '14px 0 0 0', opacity: 0.6 }} />
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', color, marginBottom: 6, letterSpacing: '0.04em' }}>{title}</div>
      <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function TitleLogo({ t }) {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    let glitchTimer;
    const id = setInterval(() => {
      setGlitch(true);
      glitchTimer = setTimeout(() => setGlitch(false), 150);
    }, 3500 + Math.random() * 2000);
    return () => {
      clearInterval(id);
      clearTimeout(glitchTimer);
    };
  }, []);

  return (
    <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
      <div style={{
        display: 'inline-block', border: '1px solid rgba(0,229,255,0.4)', borderRadius: 6,
        padding: '3px 14px', fontSize: '0.6rem', fontFamily: 'monospace',
        color: 'rgba(0,229,255,0.7)', letterSpacing: '0.3em', marginBottom: 24,
        background: 'rgba(0,229,255,0.06)', animation: 'badge-blink 3s ease-in-out infinite',
      }}>
        {t.caseBadge}
      </div>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {['TERMINAL','DETECTIVE'].map((word, wi) => (
          <h1 key={word} style={{
            fontSize: 'clamp(3rem, 10vw, 6.5rem)', fontWeight: 900, fontFamily: 'monospace',
            lineHeight: 1, letterSpacing: '0.05em', margin: 0,
            background: wi === 0
              ? 'linear-gradient(135deg, #ff3aff 0%, #00e5ff 50%, #ff3aff 100%)'
              : 'linear-gradient(135deg, #00e5ff 0%, #ff3aff 50%, #00e5ff 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: `title-shimmer 4s linear infinite ${wi === 1 ? 'reverse' : ''}`,
            filter: glitch ? 'blur(2px)' : 'none',
            transform: glitch ? `translateX(${wi === 0 ? 3 : -2}px)` : 'none',
            transition: 'filter 0.05s, transform 0.05s',
          }}>{word}</h1>
        ))}
        {glitch && (
          <h1 style={{
            position: 'absolute', inset: 0,
            fontSize: 'clamp(3rem, 10vw, 6.5rem)', fontWeight: 900, fontFamily: 'monospace',
            lineHeight: 1, letterSpacing: '0.05em', margin: 0, color: '#ff3860',
            opacity: 0.4, transform: 'translateX(-4px) translateY(2px)',
            clipPath: 'polygon(0 30%, 100% 30%, 100% 55%, 0 55%)',
          }}>TERMINAL</h1>
        )}
      </div>
      <div style={{ marginTop: 16, fontSize: '0.75rem', fontFamily: 'monospace', color: 'rgba(200,230,255,0.45)', letterSpacing: '0.4em', animation: 'fade-in 1.5s 0.5s both' }}>
        {t.subtitle}
      </div>
      <div style={{ height: 1, margin: '24px auto', width: '60%', background: 'linear-gradient(to right, transparent, #ff3aff, #00e5ff, #ff3aff, transparent)', boxShadow: '0 0 12px #ff3aff60', animation: 'fade-in 1s 0.8s both' }} />
    </div>
  );
}

function StatRow({ t }) {
  const stats = [
    { label: t.zones, value: '4', unit: 'ZONES' },
    { label: t.suspects, value: '3', unit: 'SUSPECTS' },
    { label: t.clues, value: '9', unit: 'CLUES' },
    { label: t.difficulty, value: 'Ω', unit: 'OMEGA' },
  ];
  return (
    <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', animation: 'fade-in 1s 1s both', position: 'relative', zIndex: 2 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 900, fontFamily: 'monospace', color: '#00e5ff', textShadow: '0 0 20px #00e5ff80', lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: '0.5rem', fontFamily: 'monospace', color: 'rgba(0,229,255,0.5)', letterSpacing: '0.2em', marginTop: 2 }}>{s.unit}</div>
          <div style={{ fontSize: '0.55rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

const PREVIEW_LINES_ZH = [
  { t: '◈ TURN 1 — OBSERVATION PHASE', c: '#a78bfa' },
  { t: '> 现场：47层数据中心，Victor Zhao 陈尸地板。神经接口有EMP灼痕。', c: '#00e5ff' },
  { t: '◈ THINK — 神经推理链激活...', c: '#a78bfa' },
  { t: '检测到高压电磁脉冲特征，推断凶器为改装EMP设备。', c: '#bf5fff' },
  { t: '▶ ACTION ISSUED: [SEARCH_AREA]', c: '#00ff88' },
  { t: '🔍 NEW EVIDENCE: 🧾 染血收据 — 时间戳 23:05', c: '#00ff88' },
  { t: '⚡ AP +2 · COMBO SYNERGY · 情报·解密', c: '#ffaa00' },
];
const PREVIEW_LINES_EN = [
  { t: '◈ TURN 1 — OBSERVATION PHASE', c: '#a78bfa' },
  { t: '> Scene: 47F Data Center, Victor Zhao found dead. Neural port shows EMP burns.', c: '#00e5ff' },
  { t: '◈ THINK — Neural reasoning chain active...', c: '#a78bfa' },
  { t: 'High-voltage EMP signature detected. Weapon: modified EMP device.', c: '#bf5fff' },
  { t: '▶ ACTION ISSUED: [SEARCH_AREA]', c: '#00ff88' },
  { t: '🔍 NEW EVIDENCE: 🧾 Bloody receipt — timestamp 23:05', c: '#00ff88' },
  { t: '⚡ AP +2 · COMBO SYNERGY · Intel·Decrypt', c: '#ffaa00' },
];

function TerminalPreview({ lang }) {
  const lines = lang === 'zh' ? PREVIEW_LINES_ZH : PREVIEW_LINES_EN;
  const [visibleLines, setVisibleLines] = useState(0);
  useEffect(() => {
    setVisibleLines(0);
    let i = 0;
    let timer;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      i++;
      setVisibleLines(i);
      if (i < lines.length) {
        timer = setTimeout(tick, 700);
      } else {
        timer = setTimeout(() => {
          if (cancelled) return;
          i = 0;
          setVisibleLines(0);
          timer = setTimeout(tick, 700);
        }, 1500);
      }
    };
    timer = setTimeout(tick, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lang]);

  return (
    <div className="td-ui-card td-terminal-preview" style={{ border: '1px solid rgba(0,229,255,0.15)', borderRadius: 12, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', padding: '14px 18px', fontFamily: 'monospace', fontSize: '0.68rem', lineHeight: 1.8, maxWidth: 560, margin: '0 auto', animation: 'fade-in 1s 1.2s both', position: 'relative', zIndex: 2 }}>
      <div style={{ color: 'rgba(0,229,255,0.4)', fontSize: '0.55rem', letterSpacing: '0.2em', marginBottom: 8 }}>● TERMINAL PREVIEW · LIVE</div>
      {lines.slice(0, visibleLines).map((l, i) => <div key={i} style={{ color: l.c }}>{l.t}</div>)}
      <span style={{ color: '#00ff88', animation: 'cursor-blink 1s step-end infinite' }}>▊</span>
    </div>
  );
}

function StartButton({ onClick, t }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ textAlign: 'center', position: 'relative', zIndex: 2, animation: 'fade-in 1s 1.5s both' }}>
      <button
        className="td-ui-button td-button-primary td-landing-start"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: '18px 60px', fontSize: '1rem', fontWeight: 900,
          fontFamily: 'monospace', letterSpacing: '0.2em', color: '#fff',
          background: hover ? 'linear-gradient(135deg, #ff3aff 0%, #00e5ff 100%)' : 'linear-gradient(135deg, #00c8ff 0%, #ff3aff 100%)',
          border: 'none', borderRadius: 14, cursor: 'pointer', transition: 'all 0.3s',
          boxShadow: hover ? '0 0 60px rgba(255,58,255,0.6), 0 0 120px rgba(0,229,255,0.3)' : '0 0 30px rgba(0,200,255,0.4), 0 0 60px rgba(255,58,255,0.2)',
          transform: hover ? 'scale(1.06)' : 'scale(1)',
          textShadow: '0 0 12px rgba(255,255,255,0.6)',
        }}
      >
        {t.startBtn}
      </button>
      <div style={{ marginTop: 10, fontSize: '0.55rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.2em' }}>
        {t.startHint}
      </div>
    </div>
  );
}

// ── Language Toggle Button ────────────────────────────────────────────────────
function LangToggle() {
  const { lang, t, setLang } = useLang();
  return (
    <button
      className="td-ui-button td-button-ghost td-button-compact"
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      style={{
        padding: '4px 12px',
        fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700,
        color: '#00e5ff', border: '1px solid rgba(0,229,255,0.4)',
        borderRadius: 6, background: 'rgba(0,229,255,0.08)',
        cursor: 'pointer', letterSpacing: '0.1em',
        transition: 'all 0.2s',
      }}
    >
      {t.langBtn}
    </button>
  );
}

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function GameLanding({ onStart }) {
  const { lang, t } = useLang();

  return (
    <div className="td-page-shell td-landing" style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse at 30% 20%, #0a0a2e 0%, #03060f 60%)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <MatrixRain color="#00e5ff" />
      <Scanlines />

      {/* Corner decorations */}
      {[
        { top: 0, left: 0, borderTop: '2px solid #ff3aff', borderLeft: '2px solid #ff3aff' },
        { top: 0, right: 0, borderTop: '2px solid #00e5ff', borderRight: '2px solid #00e5ff' },
        { bottom: 0, left: 0, borderBottom: '2px solid #00e5ff', borderLeft: '2px solid #00e5ff' },
        { bottom: 0, right: 0, borderBottom: '2px solid #ff3aff', borderRight: '2px solid #ff3aff' },
      ].map((s, i) => (
        <div key={i} style={{ position: 'fixed', ...s, width: 50, height: 50, pointerEvents: 'none', zIndex: 10 }} />
      ))}

      {/* Top status bar */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px',
        borderBottom: '1px solid rgba(0,229,255,0.1)',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
        fontFamily: 'monospace', fontSize: '0.6rem',
      }}>
        <div style={{ color: 'rgba(0,229,255,0.6)', letterSpacing: '0.15em' }}>{t.systemVersion}</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {[t.online, t.secure, t.ready].map((s, i) => (
            <span key={i} style={{ color: i === 0 ? '#00ff88' : i === 1 ? '#00e5ff' : '#ffaa00', animation: `badge-blink ${2 + i * 0.5}s ease-in-out infinite` }}>{s}</span>
          ))}
          <LangToggle />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 36 }}>
        <TitleLogo t={t} />
        <StatRow t={t} />
        <TerminalPreview lang={lang} />
        <StartButton onClick={onStart} t={t} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, width: '100%', maxWidth: 900, animation: 'fade-in 1s 1.8s both' }}>
          {t.features.map((c, i) => (
            <FeatureCard key={i} {...c} color={['#00e5ff','#a78bfa','#ff3aff','#ffaa00'][i]} delay={1.8 + i * 0.12} />
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '12px', borderTop: '1px solid rgba(255,255,255,0.04)', fontFamily: 'monospace', fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.2em' }}>
        {t.bottomBar}
      </div>

      <style>{`
        @keyframes title-shimmer { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }
        @keyframes badge-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes card-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
