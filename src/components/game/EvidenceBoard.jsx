import React, { useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon';
import { drawIcon } from '@/components/ui/iconCanvas';
import { noirColor } from '@/components/ui/palette';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';

const NODE_COLORS = {
  CRITICAL: '#c77c78',
  HIGH: '#c19a63',
  MEDIUM: '#709f9a',
  LOW: '#9b9aae',
};

export default function EvidenceBoard({ clues, unlockedIds, validEdges, caseData: _caseData }) {
  const { lang } = useLang();
  const { motionEnabled, foreground } = usePresentationMotion();
  const zh = lang === 'zh';
  const canvasRef = useRef(null);
  const nodesRef = useRef({});
  const animFrameRef = useRef(null);
  const freshnessTimersRef = useRef(new Map());

  const unlockedClues = clues.filter(c => unlockedIds.includes(c.clue_id));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !foreground) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
        const freshnessTimer = setTimeout(() => {
          if (nodesRef.current[clue.clue_id])
            nodesRef.current[clue.clue_id].isNew = false;
          freshnessTimersRef.current.delete(clue.clue_id);
        }, 2000);
        freshnessTimersRef.current.set(clue.clue_id, freshnessTimer);
      }
    });

    // Remove nodes for unlocked clues no longer in list
    Object.keys(nodesRef.current).forEach(id => {
      if (!unlockedIds.includes(id)) delete nodesRef.current[id];
    });

    let frameCount = 0;
    const animate = () => {
      ctx.clearRect(0, 0, W, H);

      // Background grid
      ctx.strokeStyle = 'rgba(112, 159, 154,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const nodes = Object.values(nodesRef.current);

      // A short settling pass; the board stays still while evidence is read.
      if (motionEnabled) nodes.forEach(n => {
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
        gradient.addColorStop(0, 'rgba(199, 124, 120,0.8)');
        gradient.addColorStop(0.5, 'rgba(199, 124, 120,0.4)');
        gradient.addColorStop(1, 'rgba(199, 124, 120,0.8)');

        ctx.beginPath();
        ctx.moveTo(nA.x, nA.y);
        ctx.lineTo(nB.x, nB.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach(n => {
        const color = noirColor(NODE_COLORS[n.clue.weight] || '#709f9a');
        const radius = 20;

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,15,30,0.9)';
        ctx.strokeStyle = color;
        ctx.lineWidth = n.isNew && motionEnabled && frameCount < 89 ? 3 : 1.5;
        ctx.fill();
        ctx.stroke();

        drawIcon(ctx, n.clue.visual_icon, n.x - 9, n.y - 9, 18, color);

        // Label below
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(n.clue.keyword, n.x, n.y + radius + 12);
      });

      frameCount++;
      if (motionEnabled && frameCount < 90) animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [unlockedIds, validEdges, motionEnabled, foreground]);

  useEffect(() => () => {
    freshnessTimersRef.current.forEach(clearTimeout);
    freshnessTimersRef.current.clear();
  }, []);

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #08121c 0%, #08121c 100%)' }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        role="img"
        aria-label={`${zh ? '证物板' : 'Evidence board'}: ${unlockedClues.map(clue => clue.keyword).join(', ') || (zh ? '尚未保全证据' : 'No evidence secured')}`}
        style={{ display: 'block' }}
      />
      {unlockedClues.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-3 opacity-40"><Icon name="network" size={36} /></div>
            <div className="text-xs tracking-widest opacity-30" style={{ color: '#709f9a', fontFamily: 'monospace' }}>
              {zh ? '尚未保全证据' : 'NO EVIDENCE SECURED'}
            </div>
            <div className="text-xs opacity-20 mt-1" style={{ color: '#709f9a', fontFamily: 'monospace' }}>
              {zh ? '开始调查以填充证物板' : 'Begin investigation to populate the board'}
            </div>
          </div>
        </div>
      )}
      <div className="absolute top-2 left-2 text-xs opacity-30"
        style={{ color: '#709f9a', fontFamily: 'monospace' }}>
        {zh ? '证物板' : 'EVIDENCE BOARD'} · {unlockedClues.length} {zh ? '节点' : 'NODES'}
      </div>
    </div>
  );
}
