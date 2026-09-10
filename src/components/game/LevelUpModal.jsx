import Icon, { IconText } from '@/components/ui/Icon';
import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';
import { useSettings } from '@/lib/settings.jsx';
import { noirColor } from '@/components/ui/palette';

// ── Full-screen particle burst canvas ────────────────────────────────────────
function BurstCanvas({ color }) {
  const ref = useRef(null);
  const { motionEnabled } = usePresentationMotion();
  const { settings } = useSettings();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !motionEnabled || !settings.particles) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const particles = Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 2 + Math.random() * 4;
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.012 + Math.random() * 0.018,
        r: 2 + Math.random() * 5,
        trail: [],
      };
    });

    // Radiating rings
    const rings = [
      { r: 0, maxR: Math.max(canvas.width, canvas.height) * 0.7, life: 1, speed: 6 },
      { r: 0, maxR: Math.max(canvas.width, canvas.height) * 0.5, life: 1, speed: 9, delay: 8 },
    ];
    let frame = 0;
    let raf;

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Rings
      rings.forEach(ring => {
        if (frame < (ring.delay || 0)) return;
        ring.r += ring.speed;
        ring.life = Math.max(0, 1 - ring.r / ring.maxR);
        if (ring.life <= 0) return;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = color + Math.floor(ring.life * 160).toString(16).padStart(2, '0');
        ctx.lineWidth = 2.5 * ring.life;
        ctx.shadowBlur = 18 * ring.life;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // Particles
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.vy += 0.12; // gravity
        p.life -= p.decay;
        if (p.life <= 0) return;

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 7) p.trail.shift();

        // Trail
        p.trail.forEach((pt, ti) => {
          const ta = (ti / p.trail.length) * p.life * 0.7;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, p.r * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = color + Math.floor(ta * 255).toString(16).padStart(2, '0');
          ctx.fill();
        });

        // Main dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color + Math.floor(p.life * 255).toString(16).padStart(2, '0');
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Center nova flash
      if (frame < 20) {
        const alpha = (1 - frame / 20) * 0.12;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120 * (frame / 20));
        grad.addColorStop(0, color + 'ff');
        grad.addColorStop(1, color + '00');
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(cx, cy, 120 * (frame / 20), 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      const alive = particles.some(p => p.life > 0) || rings.some(r => r.life > 0 && r.r < r.maxR);
      if (alive) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); };
  }, [color, motionEnabled, settings.particles]);

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none',
    }} />
  );
}

// ── Skill slot card ───────────────────────────────────────────────────────────
function SkillCard({ skill, color, delay }) {
  const { lang } = useLang();
  const { motionEnabled } = usePresentationMotion();
  const zh = lang === 'zh';
  const [visible, setVisible] = useState(!motionEnabled);
  useEffect(() => {
    if (!motionEnabled) { setVisible(true); return; }
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay, motionEnabled]);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px', borderRadius: 10,
      border: `1px solid ${color}60`,
      background: `linear-gradient(135deg, ${color}18 0%, ${color}06 100%)`,
      boxShadow: `0 0 20px ${color}30`,
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : 'scale(0.88) translateY(10px)',
      transition: 'all 0.45s cubic-bezier(.22,1,.36,1)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        border: `2px solid ${color}80`,
        background: `${color}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        boxShadow: `0 0 14px ${color}60`,
      }}>
        <Icon name={skill.icon} />
      </div>
      <div>
        <div style={{
          color, fontSize: '0.72rem', fontWeight: 900, fontFamily: 'monospace',
          letterSpacing: '0.04em', marginBottom: 3,
          textShadow: 'none',
        }}>
          {zh ? skill.name : (skill.nameEn || skill.name)}
        </div>
        <div style={{
          fontSize: '0.55rem', color: 'rgba(255,255,255,0.55)',
          fontFamily: 'monospace', lineHeight: 1.5,
        }}>
          {zh ? skill.desc : (skill.descEn || skill.desc)}
        </div>
        <div style={{
          marginTop: 5, fontSize: '0.45rem', color: `${color}80`,
          fontFamily: 'monospace', border: `1px solid ${color}30`,
          borderRadius: 4, padding: '1px 7px', display: 'inline-block',
          background: `${color}10`,
        }}>
          Lv.{skill.unlock_level} {zh ? '解锁' : 'UNLOCKED'}
        </div>
      </div>
    </div>
  );
}

// ── Spinning level ring ───────────────────────────────────────────────────────
function LevelRing({ fromLevel, toLevel, color }) {
  const { motionEnabled } = usePresentationMotion();
  const [shown, setShown] = useState(!motionEnabled);
  const [flipped, setFlipped] = useState(!motionEnabled);

  useEffect(() => {
    if (!motionEnabled) { setShown(true); setFlipped(true); return; }
    const t1 = setTimeout(() => setShown(true), 100);
    const t2 = setTimeout(() => setFlipped(true), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [motionEnabled]);

  return (
    <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 20px' }}>
      {/* Outer spinning ring */}
      <svg style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        animation: 'none',
      }} viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="65" fill="none" stroke={color + '30'} strokeWidth="2"/>
        <circle cx="70" cy="70" r="65" fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray="40 370" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}/>
      </svg>
      {/* Inner spinning ring (opposite) */}
      <svg style={{
        position: 'absolute', inset: 8, width: 'calc(100% - 16px)', height: 'calc(100% - 16px)',
        animation: 'none',
      }} viewBox="0 0 124 124">
        <circle cx="62" cy="62" r="58" fill="none" stroke={color + '20'} strokeWidth="1.5"/>
        <circle cx="62" cy="62" r="58" fill="none" stroke={color + '80'} strokeWidth="1.5"
          strokeDasharray="20 360" strokeLinecap="round"/>
      </svg>

      {/* Center badge */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        {/* Old level fades out */}
        <div style={{
          position: 'absolute',
          opacity: flipped ? 0 : shown ? 1 : 0,
          transform: flipped ? 'scale(0.4) translateY(-20px)' : shown ? 'scale(1)' : 'scale(0.4)',
          transition: 'all 0.5s cubic-bezier(.22,1,.36,1)',
          color: `${color}80`, fontSize: '2.2rem', fontWeight: 900,
          textShadow: 'none',
        }}>
          {fromLevel}
        </div>
        {/* New level bursts in */}
        <div style={{
          position: 'absolute',
          opacity: flipped ? 1 : 0,
          transform: flipped ? 'scale(1)' : 'scale(2)',
          transition: 'all 0.5s cubic-bezier(.22,1,.36,1)',
          color, fontSize: '2.8rem', fontWeight: 900,
          textShadow: 'none',
        }}>
          {toLevel}
        </div>
        <div style={{
          position: 'absolute', bottom: 28,
          fontSize: '0.42rem', color: `${color}70`, letterSpacing: '0.2em',
          fontFamily: 'monospace', opacity: flipped ? 1 : 0,
          transition: 'opacity 0.4s 0.6s ease',
        }}>
          LEVEL UP
        </div>
      </div>
    </div>
  );
}

// ── Main LevelUpModal ─────────────────────────────────────────────────────────
export default function LevelUpModal({ agentName, agentIcon, fromLevel, toLevel, color: legacyColor, newSkills, onClose }) {
  const color = noirColor(legacyColor);
  const { lang } = useLang();
  const zh = lang === 'zh';
  const { motionEnabled } = usePresentationMotion();
  const [show, setShow] = useState(!motionEnabled);
  const closeTimer = useRef(null);
  const closing = useRef(false);
  const dialogRef = useRef(null);
  const dismissRef = useRef(null);

  useEffect(() => {
    if (!motionEnabled) { setShow(true); return; }
    const t = setTimeout(() => setShow(true), 30);
    return () => clearTimeout(t);
  }, [motionEnabled]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const handleClose = () => {
    if (closing.current) return;
    closing.current = true;
    setShow(false);
    if (!motionEnabled) { onClose(); return; }
    closeTimer.current = setTimeout(onClose, 300);
  };
  dismissRef.current = handleClose;

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); dismissRef.current(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener('keydown', onKeyDown);
    return () => {
      dialog?.removeEventListener('keydown', onKeyDown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: show ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0)',
      backdropFilter: show ? 'blur(6px)' : 'none',
      transition: 'background 0.3s ease',
      paddingBlock: 16, overflowY: 'auto',
    }} onClick={handleClose}>

      {/* Burst canvas behind modal */}
      <BurstCanvas color={color} />

      {/* Modal card */}
      <div
        ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={zh ? '探员晋升' : 'Agent advancement'}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 10,
          width: '100%', maxWidth: 460,
          margin: '0 16px',
          background: 'rgba(2, 6, 20, 0.96)',
          border: `1.5px solid ${color}70`,
          borderRadius: 20,
          boxShadow: '0 24px 80px #0007',
          maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
          opacity: show ? 1 : 0,
          transform: show ? 'scale(1) translateY(0)' : 'scale(0.85) translateY(30px)',
          transition: 'all 0.45s cubic-bezier(.22,1,.36,1)',
          fontFamily: "'Courier New', monospace",
        }}
      >
        {/* Scanlines */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.12) 2px,rgba(0,0,0,0.12) 4px)',
        }}/>

        {/* Header stripe */}
        <div style={{
          padding: '10px 20px',
          background: `linear-gradient(135deg, ${color}25 0%, ${color}08 100%)`,
          borderBottom: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '0.5rem', color: `${color}80`, letterSpacing: '0.25em', fontFamily: 'monospace' }}>
            ◈ {zh ? '探员晋升' : 'AGENT ADVANCEMENT'}
          </div>
          <button type="button" onClick={handleClose} aria-label={zh ? '关闭晋升面板' : 'Close advancement panel'} title={zh ? '关闭' : 'Close'} style={{
            background: 'none', border: 'none', color,
            cursor: 'pointer', fontSize: '1rem', lineHeight: 1, minWidth: 44, minHeight: 44,
          }}>✕</button>
        </div>

        <div style={{ padding: '24px 24px 20px' }}>
          {/* Agent name */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}><Icon name={agentIcon} /></div>
            <div style={{ color, fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.08em', textShadow: 'none' }}>
              {agentName}
            </div>
          </div>

          {/* Level ring */}
          <LevelRing fromLevel={fromLevel} toLevel={toLevel} color={color} />

          {/* Arrow label */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span style={{
              display: 'inline-block',
              fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
              color: '#fff',
              background: `linear-gradient(135deg, ${color}60, ${color}30)`,
              border: `1px solid ${color}50`,
              borderRadius: 8, padding: '5px 18px',
              boxShadow: `0 0 16px ${color}40`,
            }}>
              Lv.{fromLevel} &nbsp;→&nbsp; Lv.{toLevel}
            </span>
          </div>

          {/* New skills */}
          {newSkills.length > 0 && (
            <>
              <div style={{
                fontSize: '0.52rem', color: `${color}80`, letterSpacing: '0.18em',
                fontFamily: 'monospace', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ flex: 1, height: 1, background: `${color}30` }}/>
                ✦ {zh ? '新技能解锁' : 'NEW SKILL UNLOCKED'}
                <div style={{ flex: 1, height: 1, background: `${color}30` }}/>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {newSkills.map((skill, i) => (
                  <SkillCard key={skill.id} skill={skill} color={color} delay={600 + i * 200} />
                ))}
              </div>
            </>
          )}

          {/* Continue button */}
          <button onClick={handleClose} className="td-ui-button td-button-primary" style={{
            width: '100%', marginTop: 20, minHeight: 44,
            padding: '12px', borderRadius: 10,
            fontFamily: 'monospace', fontWeight: 900, fontSize: '0.72rem',
            letterSpacing: '0.12em', cursor: 'pointer',
          }}><IconText text={" ▶ "} />{zh ? '继续' : 'CONTINUE'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes lvl-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes lvl-spin-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes go-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
