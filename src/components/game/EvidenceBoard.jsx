import React, { useEffect, useRef } from 'react';

const NODE_COLORS = {
  CRITICAL: '#ff3860',
  HIGH: '#ffaa00',
  MEDIUM: '#00ffff',
  LOW: '#8888aa',
};

export default function EvidenceBoard({ clues, unlockedIds, validEdges, caseData: _caseData }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef({});
  const animFrameRef = useRef(null);
  const particlesRef = useRef([]);

  const unlockedClues = clues.filter(c => unlockedIds.includes(c.clue_id));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    // Initialize nodes
    unlockedClues.forEach((clue, i) => {
      if (!nodesRef.current[clue.clue_id]) {
        const angle = (i / Math.max(unlockedClues.length, 1)) * Math.PI * 2;
        const r = Math.min(W, H) * 0.3;
        nodesRef.current[clue.clue_id] = {
          x: W / 2 + Math.cos(angle) * r,
          y: H / 2 + Math.sin(angle) * r,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          clue,
          isNew: true,
        };
        // Spawn particles for new node
        for (let p = 0; p < 12; p++) {
          particlesRef.current.push({
            x: W / 2 + Math.cos(angle) * r,
            y: H / 2 + Math.sin(angle) * r,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1,
            color: NODE_COLORS[clue.weight] || '#00ffff',
          });
        }
        setTimeout(() => {
          if (nodesRef.current[clue.clue_id])
            nodesRef.current[clue.clue_id].isNew = false;
        }, 2000);
      }
    });

    // Remove nodes for unlocked clues no longer in list
    Object.keys(nodesRef.current).forEach(id => {
      if (!unlockedIds.includes(id)) delete nodesRef.current[id];
    });

    let t = 0;
    const animate = () => {
      ctx.clearRect(0, 0, W, H);

      // Background grid
      ctx.strokeStyle = 'rgba(0,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      t += 0.02;
      const nodes = Object.values(nodesRef.current);

      // Force-directed layout
      nodes.forEach(n => {
        // Center gravity
        n.vx += (W / 2 - n.x) * 0.001;
        n.vy += (H / 2 - n.y) * 0.001;

        // Repulsion between nodes
        nodes.forEach(other => {
          if (other === n) return;
          const dx = n.x - other.x;
          const dy = n.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          if (dist < 120) {
            n.vx += (dx / dist) * 0.8;
            n.vy += (dy / dist) * 0.8;
          }
        });

        n.vx *= 0.92;
        n.vy *= 0.92;
        n.x = Math.max(50, Math.min(W - 50, n.x + n.vx));
        n.y = Math.max(50, Math.min(H - 50, n.y + n.vy));
      });

      // Draw edges
      (validEdges || []).forEach(([idA, idB]) => {
        const nA = nodesRef.current[idA];
        const nB = nodesRef.current[idB];
        if (!nA || !nB) return;

        const gradient = ctx.createLinearGradient(nA.x, nA.y, nB.x, nB.y);
        gradient.addColorStop(0, 'rgba(255,56,96,0.8)');
        gradient.addColorStop(0.5, 'rgba(255,56,96,0.4)');
        gradient.addColorStop(1, 'rgba(255,56,96,0.8)');

        ctx.beginPath();
        ctx.moveTo(nA.x, nA.y);
        ctx.lineTo(nB.x, nB.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Animated pulse along edge
        const pct = (Math.sin(t * 2) + 1) / 2;
        const px = nA.x + (nB.x - nA.x) * pct;
        const py = nA.y + (nB.y - nA.y) * pct;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ff3860';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff3860';
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw particles
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      particlesRef.current.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life -= 0.02;
      });

      // Draw nodes
      nodes.forEach(n => {
        const color = NODE_COLORS[n.clue.weight] || '#00ffff';
        const pulse = n.isNew ? (Math.sin(t * 8) + 1) / 2 : (Math.sin(t * 2 + n.x) + 1) / 2;
        const radius = 18 + pulse * 4;

        // Outer glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = `${color}15`;
        ctx.fill();

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,15,30,0.9)';
        ctx.strokeStyle = color;
        ctx.lineWidth = n.isNew ? 3 : 1.5;
        ctx.shadowBlur = n.isNew ? 20 : 10;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.clue.visual_icon, n.x, n.y);

        // Label below
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.fillText(n.clue.keyword, n.x, n.y + radius + 12);
        ctx.shadowBlur = 0;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [unlockedIds, validEdges]);

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #0a0f20 0%, #040810 100%)' }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      {unlockedClues.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-20">🕸️</div>
            <div className="text-xs tracking-widest opacity-30" style={{ color: '#00ffff', fontFamily: 'monospace' }}>
              NO EVIDENCE SECURED
            </div>
            <div className="text-xs opacity-20 mt-1" style={{ color: '#00ffff', fontFamily: 'monospace' }}>
              Begin investigation to populate the board
            </div>
          </div>
        </div>
      )}
      <div className="absolute top-2 left-2 text-xs opacity-30"
        style={{ color: '#00ffff', fontFamily: 'monospace' }}>
        EVIDENCE BOARD · {unlockedClues.length} NODES
      </div>
    </div>
  );
}
