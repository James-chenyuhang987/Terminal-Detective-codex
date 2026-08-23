import React, { useEffect, useRef, useState, useCallback } from 'react';

const AGENT_COLORS = ['#00e5ff', '#ff6b6b', '#a78bfa'];
const AGENT_ICONS  = ['👁️', '🔥', '💻'];

// Synergy combo definitions: which agent pair triggers what label
const COMBO_DEFS = [
  { pair: [0, 2], label: '情报·解密', apBonus: 3, color: '#a3ff47' },
  { pair: [0, 1], label: '观察·审讯', apBonus: 2, color: '#ffe600' },
  { pair: [1, 2], label: '审讯·渗透', apBonus: 2, color: '#ff9d00' },
  { pair: [0, 1, 2], label: '三重协同', apBonus: 5, color: '#ff3aff' },
];

export default function DataFlowCanvas({ agents, activeAgent, flowActivity, comboEvent }) {
  const svgRef      = useRef(null);
  const particlesRef = useRef([]);
  const comboFXRef  = useRef([]);   // active combo burst particles
  const animFrameRef = useRef(null);
  const timeRef     = useRef(0);
  const [apToasts, setApToasts] = useState([]); // {id, label, bonus, color, x, y}

  const positions = [
    { x: 0.5,  y: 0.08 },
    { x: 0.08, y: 0.88 },
    { x: 0.92, y: 0.88 },
  ];
  const edges = [[0, 1], [1, 2], [0, 2]];

  // ── Expose triggerCombo imperatively via ref on comboEvent prop ────────────
  const triggerCombo = useCallback((pairAgents) => {
    const svg = svgRef.current;
    if (!svg) return;
    const W = svg.clientWidth || 320;
    const H = svg.clientHeight || 220;
    const px = positions.map(p => ({ x: p.x * W, y: p.y * H }));

    // Find matching combo def (longest match wins)
    const def = [...COMBO_DEFS].reverse().find(c =>
      c.pair.every(i => pairAgents.includes(i))
    ) || COMBO_DEFS[0];

    // Spawn burst particles along the combo edges
    const comboEdges = [];
    for (let i = 0; i < pairAgents.length - 1; i++) {
      comboEdges.push([pairAgents[i], pairAgents[i + 1]]);
    }
    comboEdges.push([pairAgents[pairAgents.length - 1], pairAgents[0]]);

    comboEdges.forEach(([a, b]) => {
      for (let k = 0; k < 12; k++) {
        comboFXRef.current.push({
          from: a, to: b,
          t: Math.random(),
          speed: 0.014 + Math.random() * 0.018,
          size: 2 + Math.random() * 4,
          color: def.color,
          life: 1.0,
          decay: 0.012 + Math.random() * 0.008,
          trail: [],
        });
      }
    });

    // Center of all involved nodes
    const cx = pairAgents.reduce((s, i) => s + px[i].x, 0) / pairAgents.length;
    const cy = pairAgents.reduce((s, i) => s + px[i].y, 0) / pairAgents.length;

    // Show AP toast
    const id = Date.now() + Math.random();
    setApToasts(prev => [...prev, {
      id, label: def.label, bonus: def.apBonus, color: def.color,
      x: (cx / W) * 100, y: (cy / H) * 100,
    }]);
    setTimeout(() => setApToasts(prev => prev.filter(t => t.id !== id)), 2200);
  }, []);

  // React to comboEvent prop changes
  useEffect(() => {
    if (!comboEvent) return;
    triggerCombo(comboEvent.pair);
  }, [comboEvent]);

  // ── Main animation loop ───────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const W = svg.clientWidth || 320;
    const H = svg.clientHeight || 220;
    const px = positions.map(p => ({ x: p.x * W, y: p.y * H }));

    // Init base particles — more particles, faster speed
    particlesRef.current = [];
    edges.forEach(([a, b]) => {
      for (let i = 0; i < 7; i++) {
        particlesRef.current.push({
          from: a, to: b, t: Math.random(),
          speed: 0.012 + Math.random() * 0.014,
          size: 2 + Math.random() * 2.5,
          reverse: i % 3 === 0,
        });
      }
    });

    const drawFrame = () => {
      timeRef.current += 1;
      const t = timeRef.current;

      const existing = svg.querySelectorAll('.dyn');
      existing.forEach(el => el.remove());

      // ── Base edges — solid glow line + animated dash overlay ───────────
      edges.forEach(([a, b]) => {
        const isActive = activeAgent === a || activeAgent === b;
        const colA = AGENT_COLORS[a];
        const colB = AGENT_COLORS[b];

        // Static solid underline (always visible)
        const solidLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        solidLine.setAttribute('class', 'dyn');
        solidLine.setAttribute('x1', px[a].x); solidLine.setAttribute('y1', px[a].y);
        solidLine.setAttribute('x2', px[b].x); solidLine.setAttribute('y2', px[b].y);
        solidLine.setAttribute('stroke', isActive ? colA : 'rgba(255,255,255,0.18)');
        solidLine.setAttribute('stroke-width', isActive ? '1.8' : '1');
        solidLine.setAttribute('opacity', isActive ? '0.7' : '0.35');
        svg.insertBefore(solidLine, svg.firstChild);

        // Animated dash overlay
        const dashLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        dashLine.setAttribute('class', 'dyn');
        dashLine.setAttribute('x1', px[a].x); dashLine.setAttribute('y1', px[a].y);
        dashLine.setAttribute('x2', px[b].x); dashLine.setAttribute('y2', px[b].y);
        dashLine.setAttribute('stroke', isActive ? colB : 'rgba(0,229,255,0.3)');
        dashLine.setAttribute('stroke-width', isActive ? '2.5' : '0.8');
        dashLine.setAttribute('stroke-dasharray', '6 10');
        dashLine.setAttribute('stroke-dashoffset', -(t * 2.2));
        dashLine.setAttribute('opacity', isActive ? '0.6' : '0.2');
        svg.insertBefore(dashLine, svg.firstChild);
      });

      // ── Combo FX burst particles ────────────────────────────────────────
      comboFXRef.current = comboFXRef.current.filter(p => p.life > 0);
      comboFXRef.current.forEach(p => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;
        p.life -= p.decay;

        const fromPt = px[p.from];
        const toPt   = px[p.to];
        const cx = fromPt.x + (toPt.x - fromPt.x) * p.t;
        const cy = fromPt.y + (toPt.y - fromPt.y) * p.t;

        // Trail
        p.trail.push({ x: cx, y: cy });
        if (p.trail.length > 6) p.trail.shift();

        if (p.trail.length > 1) {
          const trail = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          trail.setAttribute('class', 'dyn');
          trail.setAttribute('points', p.trail.map(pt => `${pt.x},${pt.y}`).join(' '));
          trail.setAttribute('fill', 'none');
          trail.setAttribute('stroke', p.color);
          trail.setAttribute('stroke-width', p.size * 0.6);
          trail.setAttribute('stroke-linecap', 'round');
          trail.setAttribute('opacity', p.life * 0.5);
          svg.appendChild(trail);
        }

        // Main glow
        const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        glow.setAttribute('class', 'dyn');
        glow.setAttribute('cx', cx); glow.setAttribute('cy', cy);
        glow.setAttribute('r', p.size * 4);
        glow.setAttribute('fill', p.color);
        glow.setAttribute('opacity', p.life * 0.18);
        svg.appendChild(glow);

        // Core
        const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        core.setAttribute('class', 'dyn');
        core.setAttribute('cx', cx); core.setAttribute('cy', cy);
        core.setAttribute('r', p.size);
        core.setAttribute('fill', p.color);
        core.setAttribute('opacity', p.life);
        svg.appendChild(core);

        // Combo edge flash: bright overlay line while life > 0.6
        if (p.life > 0.6) {
          const flash = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          flash.setAttribute('class', 'dyn');
          flash.setAttribute('x1', fromPt.x); flash.setAttribute('y1', fromPt.y);
          flash.setAttribute('x2', toPt.x);   flash.setAttribute('y2', toPt.y);
          flash.setAttribute('stroke', p.color);
          flash.setAttribute('stroke-width', (p.life - 0.6) * 12);
          flash.setAttribute('opacity', (p.life - 0.6) * 0.8);
          svg.appendChild(flash);
        }
      });

      // ── Base particles ─────────────────────────────────────────────────
      particlesRef.current.forEach(p => {
        p.t += p.reverse ? -p.speed : p.speed;
        if (p.t > 1) p.t = 0;
        if (p.t < 0) p.t = 1;

        const fromPt = px[p.from];
        const toPt = px[p.to];
        const cx = fromPt.x + (toPt.x - fromPt.x) * p.t;
        const cy = fromPt.y + (toPt.y - fromPt.y) * p.t;
        const col = AGENT_COLORS[p.from];

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'dyn');
        circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
        circle.setAttribute('r', p.size);
        circle.setAttribute('fill', col);
        circle.setAttribute('opacity', 0.7 + Math.sin(t * 0.08 + p.t * 10) * 0.3);

        const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        glow.setAttribute('class', 'dyn');
        glow.setAttribute('cx', cx); glow.setAttribute('cy', cy);
        glow.setAttribute('r', p.size * 3);
        glow.setAttribute('fill', col);
        glow.setAttribute('opacity', 0.12);
        svg.appendChild(glow);
        svg.appendChild(circle);
      });

      // ── Active node pulse ring ─────────────────────────────────────────
      if (flowActivity) {
        const ap = px[activeAgent];
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('class', 'dyn');
        ring.setAttribute('cx', ap.x); ring.setAttribute('cy', ap.y);
        ring.setAttribute('r', 24 + Math.sin(t * 0.15) * 6);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', AGENT_COLORS[activeAgent]);
        ring.setAttribute('stroke-width', '1.5');
        ring.setAttribute('opacity', 0.5 + Math.sin(t * 0.12) * 0.3);
        svg.appendChild(ring);
      }

      // ── Combo center burst ring (while particles live) ─────────────────
      if (comboFXRef.current.length > 0) {
        const maxLife = Math.max(...comboFXRef.current.map(p => p.life));
        const cx = positions.reduce((s, p) => s + p.x * W, 0) / 3;
        const cy = positions.reduce((s, p) => s + p.y * H, 0) / 3;
        const burst = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        burst.setAttribute('class', 'dyn');
        burst.setAttribute('cx', cx); burst.setAttribute('cy', cy);
        burst.setAttribute('r', (1 - maxLife) * 60 + 8);
        burst.setAttribute('fill', 'none');
        burst.setAttribute('stroke', '#ff3aff');
        burst.setAttribute('stroke-width', maxLife * 3);
        burst.setAttribute('opacity', maxLife * 0.6);
        svg.appendChild(burst);
      }

      animFrameRef.current = requestAnimationFrame(drawFrame);
    };

    animFrameRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activeAgent, flowActivity]);

  return (
    <div className="relative w-full" style={{ height: 220 }}>
      {/* AP reward toasts */}
      {apToasts.map(toast => (
        <div
          key={toast.id}
          className="absolute pointer-events-none flex flex-col items-center"
          style={{
            left: `${toast.x}%`, top: `${toast.y}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            animation: 'ap-toast-up 2.2s ease-out forwards',
          }}
        >
          <div style={{
            background: `radial-gradient(circle, ${toast.color}30 0%, transparent 70%)`,
            border: `1.5px solid ${toast.color}`,
            borderRadius: 12,
            padding: '4px 12px',
            fontFamily: 'monospace',
            fontWeight: 900,
            fontSize: '0.75rem',
            color: toast.color,
            textShadow: `0 0 12px ${toast.color}`,
            boxShadow: `0 0 20px ${toast.color}60`,
            whiteSpace: 'nowrap',
            letterSpacing: '0.06em',
          }}>
            ⚡ +{toast.bonus} AP · {toast.label}
          </div>
          <div style={{
            marginTop: 2,
            fontSize: '0.55rem',
            fontFamily: 'monospace',
            color: toast.color,
            opacity: 0.7,
            letterSpacing: '0.12em',
          }}>COMBO SYNERGY</div>
        </div>
      ))}

      {/* Agent node labels */}
      {agents.map((agent, i) => {
        const p = positions[i];
        const color = AGENT_COLORS[i];
        const isActive = activeAgent === i;
        return (
          <div
            key={i}
            className="absolute flex flex-col items-center"
            style={{
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <div style={{
              width: 40, height: 40,
              borderRadius: '50%',
              border: `2px solid ${color}`,
              background: `radial-gradient(circle, ${color}25 0%, transparent 70%)`,
              boxShadow: isActive
                ? `0 0 20px ${color}, 0 0 40px ${color}40`
                : `0 0 8px ${color}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
              transition: 'box-shadow 0.3s',
            }}>
              {AGENT_ICONS[i]}
            </div>
            <div style={{
              marginTop: 4,
              fontSize: '0.6rem',
              fontFamily: 'monospace',
              color,
              textShadow: `0 0 6px ${color}`,
              fontWeight: 700,
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
            }}>
              {agent.agent_id}
            </div>
          </div>
        );
      })}

      {/* SVG canvas behind nodes */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 1 }}
        overflow="visible"
      >
        <defs>
          <filter id="particle-glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>

      <style>{`
        @keyframes ap-toast-up {
          0%   { opacity: 0; transform: translate(-50%, -40%); }
          15%  { opacity: 1; }
          70%  { opacity: 1; transform: translate(-50%, -80%); }
          100% { opacity: 0; transform: translate(-50%, -110%); }
        }
      `}</style>
    </div>
  );
}