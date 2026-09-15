import React, { useEffect, useRef } from 'react';
import { noirColor } from '@/components/ui/palette';
import { useSettings } from '@/lib/settings.jsx';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';
import { AGENT_DEFS } from '@/game/teamConfig';

// Keeps the low-cost neural network alive while the stage is visible. The
// observer matters on mobile because the stage is mounted while its tab is hidden.
export default function ParticleCanvas({ agentDefs = AGENT_DEFS, selectedIdx, hasTarget = false }) {
  const { settings } = useSettings();
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const frameRef = useRef(null);
  const { motionEnabled } = usePresentationMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !motionEnabled || !settings.particles) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);

    particles.current = Array.from({ length: 36 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 1 + Math.random() * 2,
      opacity: 0.2 + Math.random() * 0.5,
      color: noirColor(agentDefs[Math.floor(Math.random() * 3)]?.color || AGENT_DEFS[0].color),
    }));

    const getNodePositions = () => {
      const w = canvas.width, h = canvas.height;
      return [0, 1, 2].map((index, nodeIndex) => ({
        x: w * [0.25, 0.5, 0.75][nodeIndex],
        y: h * [0.55, 0.45, 0.55][nodeIndex],
        color: noirColor(agentDefs[index]?.color || AGENT_DEFS[index].color),
      }));
    };

    const draw = () => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!w || !h) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }
      const nodes = getNodePositions();
      const commandNode = { x: w * 0.5, y: h * 0.9, color: '#c5a66f' };
      const targetNode = { x: w * 0.5, y: h * 0.16, color: hasTarget ? '#dda29a' : '#709f9a' };

      nodes.forEach((node, index) => {
        const selected = index === selectedIdx;
        const commandGradient = ctx.createLinearGradient(commandNode.x, commandNode.y, node.x, node.y);
        commandGradient.addColorStop(0, commandNode.color + (selected ? 'a0' : '45'));
        commandGradient.addColorStop(1, node.color + (selected ? 'a0' : '45'));
        ctx.beginPath();
        ctx.moveTo(commandNode.x, commandNode.y);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = commandGradient;
        ctx.lineWidth = selected ? 1.8 : 0.75;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.strokeStyle = node.color + (selected ? '6f' : '28');
        ctx.lineWidth = selected ? 1.2 : 0.6;
        ctx.setLineDash([4, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      const pulseT = (Date.now() % 1900) / 1900;
      [commandNode, targetNode].forEach((node, index) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 8 + Math.sin(pulseT * Math.PI * 2 + index) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = node.color + '80';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, a.color + '60');
          grad.addColorStop(1, b.color + '60');
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = (i === selectedIdx || j === selectedIdx) ? 1.5 : 0.7;
          ctx.setLineDash([6, 8]);
          ctx.stroke();
          ctx.setLineDash([]);

          const t = (Date.now() % 3000) / 3000;
          const tx = a.x + (b.x - a.x) * t;
          const ty = a.y + (b.y - a.y) * t;
          ctx.beginPath();
          ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = noirColor(a.color);
          ctx.shadowBlur = 8;
          ctx.shadowColor = noirColor(a.color);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      particles.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        nodes.forEach(n => {
          const dx = p.x - n.x, dy = p.y - n.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const alpha = (1 - dist / 140) * 0.35;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(n.x, n.y);
            ctx.strokeStyle = n.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(p.opacity * 200).toString(16).padStart(2, '0');
        ctx.fill();
      });

      const selNode = nodes[selectedIdx];
      if (selNode) {
        const t = (Date.now() % 2000) / 2000;
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        ctx.beginPath();
        ctx.arc(selNode.x, selNode.y, 55 + pulse * 15, 0, Math.PI * 2);
        ctx.strokeStyle = selNode.color + '30';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(selNode.x, selNode.y, 40 + pulse * 8, 0, Math.PI * 2);
        ctx.strokeStyle = selNode.color + '50';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [agentDefs, hasTarget, motionEnabled, selectedIdx, settings.particles]);

  if (!settings.particles || !motionEnabled) return null;

  return <canvas ref={canvasRef} aria-hidden="true" style={{
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: 1,
  }} />;
}
