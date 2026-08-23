import React, { useEffect, useRef, useState } from 'react';

const AGENT_COLORS = ['#00e5ff', '#ff6b6b', '#a78bfa'];
const AGENT_ICONS = ['🦅', '💔', '⚙️'];
const AGENT_NAMES = ['隼目', '破心', '精算'];

// ── Canvas-based particle convergence effect ─────────────────────────────
function ConvergenceCanvas({ active, clueIcon, type }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const particlesRef = useRef([]);
  const startRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth || 600;
    const H = canvas.height = canvas.offsetHeight || 200;
    startRef.current = performance.now();

    // Spawn particles from 3 agent corners converging to center
    const origins = [
      { x: W * 0.08, y: H * 0.5 },
      { x: W * 0.5,  y: H * 0.1 },
      { x: W * 0.92, y: H * 0.5 },
    ];
    const center = { x: W * 0.5, y: H * 0.5 };

    particlesRef.current = [];
    origins.forEach((o, agentIdx) => {
      for (let i = 0; i < 18; i++) {
        particlesRef.current.push({
          x: o.x + (Math.random() - 0.5) * 30,
          y: o.y + (Math.random() - 0.5) * 30,
          tx: center.x + (Math.random() - 0.5) * 20,
          ty: center.y + (Math.random() - 0.5) * 20,
          color: AGENT_COLORS[agentIdx],
          t: -Math.random() * 0.4,  // staggered start
          size: 2 + Math.random() * 3,
          trail: [],
        });
      }
    });

    function draw(now) {
      const elapsed = (now - startRef.current) / 1000;
      ctx.clearRect(0, 0, W, H);

      // Background glow at center when particles converge
      if (elapsed > 0.6) {
        const intensity = Math.min(1, (elapsed - 0.6) * 1.5);
        const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 80 * intensity);
        const glowColor = type === 'cross_validate' ? '#bf5fff' : '#00ff88';
        grad.addColorStop(0, glowColor + Math.round(intensity * 80).toString(16).padStart(2,'0'));
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 80 * intensity, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw agent origin orbs
      origins.forEach((o, i) => {
        ctx.beginPath();
        ctx.arc(o.x, o.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = AGENT_COLORS[i] + '30';
        ctx.fill();
        ctx.strokeStyle = AGENT_COLORS[i];
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '12px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(AGENT_ICONS[i], o.x, o.y);

        // Pulse ring
        const pRing = (elapsed * 2 + i * 0.4) % 1;
        ctx.beginPath();
        ctx.arc(o.x, o.y, 14 + pRing * 20, 0, Math.PI * 2);
        ctx.strokeStyle = AGENT_COLORS[i] + Math.round((1 - pRing) * 60).toString(16).padStart(2,'0');
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Draw connection lines when converged
      if (elapsed > 0.5) {
        const lineAlpha = Math.min(0.5, (elapsed - 0.5) * 2);
        origins.forEach((o, i) => {
          const grad = ctx.createLinearGradient(o.x, o.y, center.x, center.y);
          grad.addColorStop(0, AGENT_COLORS[i] + Math.round(lineAlpha * 255).toString(16).padStart(2,'0'));
          grad.addColorStop(1, '#ffffff' + Math.round(lineAlpha * 200).toString(16).padStart(2,'0'));
          ctx.beginPath();
          ctx.moveTo(o.x, o.y);
          ctx.lineTo(center.x, center.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      // Update & draw particles
      particlesRef.current.forEach(p => {
        p.t += 0.018;
        if (p.t < 0) return;
        const t = Math.min(1, p.t);
        const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
        const cx = p.x + (p.tx - p.x) * ease;
        const cy = p.y + (p.ty - p.y) * ease;
        const alpha = t < 0.9 ? 1 : 1 - (t - 0.9) * 10;

        // Trail
        p.trail.push({ x: cx, y: cy });
        if (p.trail.length > 6) p.trail.shift();
        p.trail.forEach((tp, ti) => {
          const ta = (ti / p.trail.length) * alpha * 0.6;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color + Math.round(ta * 255).toString(16).padStart(2,'0');
          ctx.fill();
        });

        ctx.beginPath();
        ctx.arc(cx, cy, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(alpha * 255).toString(16).padStart(2,'0');
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(cx, cy, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(alpha * 50).toString(16).padStart(2,'0');
        ctx.fill();
      });

      // Center clue icon burst
      if (elapsed > 0.7) {
        const burstAlpha = Math.min(1, (elapsed - 0.7) * 3);
        const scale = 0.5 + burstAlpha * 0.8;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.scale(scale, scale);
        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = burstAlpha;
        ctx.fillText(clueIcon || '🔍', 0, 0);
        ctx.restore();

        // Radiating rings
        for (let r = 0; r < 3; r++) {
          const ring = (elapsed * 1.5 + r * 0.33) % 1;
          ctx.beginPath();
          ctx.arc(center.x, center.y, 20 + ring * 60, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0,255,136,${(1 - ring) * burstAlpha * 0.4})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (elapsed < 3.5) {
        frameRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, type]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: 200, display: 'block' }}
    />
  );
}

// ── Agent status row shown during synergy ────────────────────────────────
function AgentSynergyRow() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex items-center justify-center gap-4 py-2 transition-all duration-500"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
    >
      {AGENT_NAMES.map((name, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-base border-2"
            style={{
              borderColor: AGENT_COLORS[i],
              backgroundColor: AGENT_COLORS[i] + '20',
              boxShadow: `0 0 12px ${AGENT_COLORS[i]}60`,
              animation: 'synergy-pulse 0.8s ease-in-out infinite alternate',
            }}
          >
            {AGENT_ICONS[i]}
          </div>
          <div className="text-xs font-bold" style={{ color: AGENT_COLORS[i] }}>{name}</div>
          <div className="text-xs opacity-60" style={{ color: AGENT_COLORS[i] }}>锁定</div>
        </div>
      ))}
      <style>{`
        @keyframes synergy-pulse {
          from { transform: scale(1); box-shadow: 0 0 8px currentColor; }
          to   { transform: scale(1.12); box-shadow: 0 0 20px currentColor; }
        }
      `}</style>
    </div>
  );
}

// ── Main exported overlay ────────────────────────────────────────────────
export default function AgentSynergyFX({ event }) {
  // event: null | { type: 'clue_converge' | 'cross_validate', clueIcon, clueKeyword, id }
  const [current, setCurrent] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    setCurrent(event);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCurrent(null), 3800);
    return () => clearTimeout(timerRef.current);
  }, [event?.id]);

  if (!current) return null;

  const isValidate = current.type === 'cross_validate';
  const borderColor = isValidate ? '#bf5fff' : '#00ff88';
  const title = isValidate ? '⚡ 逻辑共鸣 — 交叉验证' : '🔗 线索汇聚 — 集体锁定';

  return (
    <div
      className="absolute inset-x-0 z-50 mx-4 rounded-xl border overflow-hidden"
      style={{
        top: '50%',
        transform: 'translateY(-50%)',
        borderColor: borderColor + '60',
        backgroundColor: 'rgba(0,0,0,0.92)',
        boxShadow: `0 0 60px ${borderColor}40, inset 0 0 40px ${borderColor}08`,
        fontFamily: "'Courier New', monospace",
        animation: 'synergy-appear 0.3s ease-out',
        maxWidth: 640,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2 flex items-center justify-center gap-2 border-b"
        style={{ borderColor: borderColor + '30', backgroundColor: borderColor + '10' }}
      >
        <div className="text-xs font-bold tracking-widest" style={{ color: borderColor }}>
          {title}
        </div>
      </div>

      {/* Canvas fx */}
      <ConvergenceCanvas
        active={!!current}
        clueIcon={current.clueIcon}
        type={current.type}
      />

      {/* Agent rows */}
      <AgentSynergyRow />

      {/* Footer label */}
      <div
        className="text-center text-xs py-2 border-t"
        style={{ borderColor: borderColor + '20', color: borderColor + 'aa' }}
      >
        {current.clueIcon} {current.clueKeyword} — 三名探员达成协同共识
      </div>

      <style>{`
        @keyframes synergy-appear {
          from { opacity: 0; transform: translateY(-50%) scale(0.92); }
          to   { opacity: 1; transform: translateY(-50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
