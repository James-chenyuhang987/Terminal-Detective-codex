import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { useSettings } from '@/lib/settings.jsx';
import SettingsDrawer from '@/components/game/settings/SettingsDrawer';
import { getLevelFromXP, getXPToNextLevel } from '@/game/agentProgression';
import SkillTreePanel from '@/components/game/SkillTreePanel';
import AgentRadarChart from '@/components/game/AgentRadarChart';
import SpecialtyAttrPanel from '@/components/game/SpecialtyAttrPanel';
import SynergyUnlockFX from '@/components/game/SynergyUnlockFX';
import { calcTeamSynergy } from '@/game/specialtySystem';
import AgentLoreTooltip from '@/components/game/AgentLoreTooltip';
import AgentDossierPanel from '@/components/game/AgentDossierPanel';
import PresetChips from '@/components/game/PresetChips';
import DeploySequence from '@/components/game/DeploySequence';
import { getLore } from '@/game/agentLore';
import { calcCaseMatchScore } from '@/game/casePresets';
import { AGENT_DEFS, PRIORITY_ACTIONS, buildTeamConfig } from '@/game/teamConfig';
import { getActiveSupportAgent } from '@/game/agentMarket';
import { useTeamBuilder } from '@/components/game/lobby/useTeamBuilder';

function LobbyAtmosphere() {
  return <div className="td-lobby-atmosphere" aria-hidden="true">
    <i className="td-lobby-aurora td-lobby-aurora-a" />
    <i className="td-lobby-aurora td-lobby-aurora-b" />
    <i className="td-lobby-orbit td-lobby-orbit-a" />
    <i className="td-lobby-orbit td-lobby-orbit-b" />
    <i className="td-lobby-vignette" />
  </div>;
}

// ── Particle Canvas — neural network lines ────────────────────────────────────
function ParticleCanvas({ agents: _agents, selectedIdx, accentColor: _accentColor }) {
  const { settings } = useSettings();
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Spawn floating particles
    particles.current = Array.from({ length: 36 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 1 + Math.random() * 2,
      opacity: 0.2 + Math.random() * 0.5,
      color: AGENT_DEFS[Math.floor(Math.random() * 3)].color,
    }));

    // Agent node positions (roughly center positions of holo figures)
    const getNodePositions = () => {
      const w = canvas.width, h = canvas.height;
      return [
        { x: w * 0.25, y: h * 0.55, color: AGENT_DEFS[0].color },
        { x: w * 0.5,  y: h * 0.45, color: AGENT_DEFS[1].color },
        { x: w * 0.75, y: h * 0.55, color: AGENT_DEFS[2].color },
      ];
    };

    const draw = () => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const nodes = getNodePositions();

      // Draw inter-agent connection lines
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

          // Animated dot traveling along the line
          const t = (Date.now() % 3000) / 3000;
          const tx = a.x + (b.x - a.x) * t;
          const ty = a.y + (b.y - a.y) * t;
          ctx.beginPath();
          ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = a.color;
          ctx.shadowBlur = 8;
          ctx.shadowColor = a.color;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Draw particles + connect nearby ones
      particles.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        // Connect to nearest agent node
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

        // Particle dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(p.opacity * 200).toString(16).padStart(2, '0');
        ctx.fill();
      });

      // Selected agent halo
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
      cancelAnimationFrame(frameRef.current);
    };
  }, [selectedIdx, settings.particles]);

  if (!settings.particles) return null;

  return (
    <canvas ref={canvasRef} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 1,
    }} />
  );
}

// ── Holographic Agent Figure ──────────────────────────────────────────────────
function HoloFigure({ agentDef, isSelected, onClick, index, level, onHover }) {
  return (
    <div className={`td-holo-figure ${isSelected ? 'td-holo-selected' : ''}`} onClick={onClick}
      onMouseEnter={e => onHover?.(index, e.clientX, e.clientY)}
      onMouseMove={e => onHover?.(index, e.clientX, e.clientY)}
      onMouseLeave={() => onHover?.(null)}
      style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      cursor: 'pointer', position: 'relative', zIndex: 3,
      transform: isSelected ? 'scale(1.12) translateY(-10px)' : 'scale(1)',
      transition: 'transform 0.35s cubic-bezier(.22,1,.36,1)',
    }}>
      {/* Selected glow aura */}
      {isSelected && (
        <div style={{
          position: 'absolute', inset: -18,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${agentDef.color}25 0%, transparent 70%)`,
          animation: 'aura-pulse 1.8s ease-in-out infinite',
          pointerEvents: 'none',
        }}/>
      )}

      {/* SVG figure */}
      <div style={{
        width: isSelected ? 86 : 66, height: isSelected ? 134 : 112,
        filter: `drop-shadow(0 0 ${isSelected ? 24 : 10}px ${agentDef.color})`,
        transition: 'all 0.35s ease', position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 64 110" width="100%" height="100%">
          <defs>
            <linearGradient id={`hg-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={agentDef.color} stopOpacity="0.95"/>
              <stop offset="100%" stopColor={agentDef.color} stopOpacity="0.08"/>
            </linearGradient>
            <clipPath id={`clip-${index}`}><rect x="0" y="0" width="64" height="110"/></clipPath>
          </defs>
          {/* Body parts */}
          <ellipse cx="32" cy="12" rx="9" ry="10" fill={`url(#hg-${index})`} opacity="0.88"/>
          <path d="M18 24 L46 24 L52 70 L42 70 L40 90 L24 90 L22 70 L12 70Z" fill={`url(#hg-${index})`} opacity="0.78"/>
          <path d="M18 28 L6 55 L10 57 L20 34" fill={`url(#hg-${index})`} opacity="0.6"/>
          <path d="M46 28 L58 55 L54 57 L44 34" fill={`url(#hg-${index})`} opacity="0.6"/>
          <path d="M22 90 L18 108 L26 108 L30 90" fill={`url(#hg-${index})`} opacity="0.65"/>
          <path d="M42 90 L46 108 L38 108 L34 90" fill={`url(#hg-${index})`} opacity="0.65"/>
          {/* Static scan lines */}
          {[18, 32, 46, 60, 74, 88].map((y, i) => (
            <line key={i} x1="6" y1={y} x2="58" y2={y}
              stroke={agentDef.color} strokeWidth="0.5" opacity="0.18"/>
          ))}
          {/* Animated scan beam */}
          <rect x="0" y="-3" width="64" height="3"
            fill={agentDef.color} opacity="0.35" clipPath={`url(#clip-${index})`}
            style={{ filter: `blur(1px)` }}>
            <animate
              attributeName="y"
              from="-3"
              to="110"
              dur="3.52s"
              begin={`${index * -0.55}s`}
              repeatCount="indefinite"
            />
          </rect>
          {/* Grid overlay */}
          <path d="M0 0 L64 0 M0 55 L64 55 M32 0 L32 110" stroke={agentDef.color} strokeWidth="0.3" opacity="0.12"/>
        </svg>
      </div>

      {/* Name plate */}
      <div style={{ marginTop: 8, textAlign: 'center', fontFamily: 'monospace' }}>
        <div style={{
          fontSize: '0.62rem', fontWeight: 900, color: agentDef.color,
          letterSpacing: '0.08em', textShadow: `0 0 10px ${agentDef.color}`,
        }}>{agentDef.id}</div>
        <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{agentDef.roleZh}</div>
        <div style={{
          display: 'inline-block', marginTop: 4,
          fontSize: '0.42rem', color: agentDef.color,
          border: `1px solid ${agentDef.color}50`, borderRadius: 3,
          padding: '1px 7px', background: `${agentDef.color}12`,
        }}>Lv.{level} · {agentDef.traitEn}</div>
      </div>

      <style>{`
        @keyframes aura-pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
      `}</style>
    </div>
  );
}

// ── Draggable Priority List ───────────────────────────────────────────────────
function PriorityList({ priorityList, onChange }) {
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const getAction = (id) => PRIORITY_ACTIONS.find(a => a.id === id);

  const handleDrop = (targetId) => {
    if (!dragging || dragging === targetId) return;
    const next = [...priorityList];
    const from = next.indexOf(dragging);
    const to = next.indexOf(targetId);
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    onChange(next);
    setDragging(null);
    setDragOver(null);
  };

  const move = (id, offset) => {
    const from = priorityList.indexOf(id);
    const to = Math.max(0, Math.min(priorityList.length - 1, from + offset));
    if (from === to) return;
    const next = [...priorityList];
    next.splice(from, 1);
    next.splice(to, 0, id);
    onChange(next);
  };

  const visiblePriorities = expanded ? priorityList : priorityList.slice(0, 3);

  return (
    <div>
      <div style={{
        fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace',
        letterSpacing: '0.12em', marginBottom: 8,
      }}>
        ◈ 行动优先级 <span style={{ opacity: 0.5 }}>优先执行前 3 项</span>
      </div>
      {visiblePriorities.map((id, idx) => {
        const action = getAction(id);
        if (!action) return null;
        const isOver = dragOver === id;
        return (
          <div className="td-priority-row"
            key={id}
            draggable
            onDragStart={() => setDragging(id)}
            onDragOver={e => { e.preventDefault(); setDragOver(id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(id)}
            onDragEnd={() => { setDragging(null); setDragOver(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', marginBottom: 4, borderRadius: 8,
              border: `1px solid ${isOver ? action.color : action.color + '25'}`,
              background: isOver ? `${action.color}20` : dragging === id ? `${action.color}10` : 'rgba(255,255,255,0.03)',
              cursor: 'grab', transition: 'all 0.15s',
              transform: isOver ? 'translateX(4px)' : 'none',
              boxShadow: isOver ? `0 0 10px ${action.color}40` : 'none',
              opacity: dragging === id ? 0.5 : 1,
            }}
          >
            <div style={{
              fontSize: '0.48rem', color: 'rgba(255,255,255,0.25)',
              fontFamily: 'monospace', width: 16, textAlign: 'center',
            }}>#{idx + 1}</div>
            <span style={{ fontSize: 14 }}>{action.icon}</span>
            <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: action.color, fontWeight: 700, flex: 1 }}>
              {action.label}
            </span>
            <span style={{ fontSize: '0.4rem', color: 'rgba(255,255,255,0.2)' }}>⠿⠿</span>
            <span className="td-mobile-only td-priority-mobile-buttons">
              <button type="button" aria-label="上移" disabled={idx === 0} onClick={event => { event.stopPropagation(); move(id, -1); }}>↑</button>
              <button type="button" aria-label="下移" disabled={priorityList.indexOf(id) === priorityList.length - 1} onClick={event => { event.stopPropagation(); move(id, 1); }}>↓</button>
            </span>
          </div>
        );
      })}
      <button className="td-priority-expand" type="button" onClick={() => setExpanded(value => !value)}>
        {expanded ? '收起次要行动 ↑' : `查看其余 ${Math.max(0, priorityList.length - 3)} 项 ↓`}
      </button>
    </div>
  );
}

// ── Left: Team Roster + Priority ──────────────────────────────────────────────
function TeamRosterPanel({ agents, selectedIdx, onSelect, progression, onPriorityChange, onHover, mobileActive }) {
  const lvls = AGENT_DEFS.map((_, i) => getLevelFromXP(progression[i]?.xp || 0));
  return (
    <div className={`td-lobby-roster ${mobileActive ? 'td-mobile-active' : ''}`} style={{
      width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 0 12px 12px',
    }}>
      {/* Roster card */}
      <div className="td-lobby-panel td-lobby-roster-card" style={{
        border: '1px solid rgba(0,229,255,0.2)', borderRadius: 12, overflow: 'hidden',
        background: 'rgba(0,8,24,0.85)', backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          padding: '7px 12px', borderBottom: '1px solid rgba(0,229,255,0.12)',
          background: 'rgba(0,229,255,0.05)',
          fontSize: '0.52rem', color: '#00e5ff', fontWeight: 700,
          letterSpacing: '0.12em', fontFamily: 'monospace',
        }}>
          TEAM ROSTER · 探员编组
        </div>
        {AGENT_DEFS.map((def, i) => {
          const isSelected = selectedIdx === i;
          const xpInfo = getXPToNextLevel(progression[i]?.xp || 0);
          return (
            <div className={`td-roster-agent ${isSelected ? 'td-roster-agent-selected' : ''}`} key={i} onClick={() => onSelect(i)}
              onMouseEnter={e => onHover?.(i, e.clientX, e.clientY)}
              onMouseMove={e => onHover?.(i, e.clientX, e.clientY)}
              onMouseLeave={() => onHover?.(null)}
              style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', cursor: 'pointer',
              borderLeft: `3px solid ${isSelected ? def.color : 'transparent'}`,
              background: isSelected ? `${def.color}12` : 'transparent',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${def.color}70`,
                background: isSelected ? `${def.color}30` : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.52rem', color: def.color, fontWeight: 900, fontFamily: 'monospace',
                boxShadow: isSelected ? `0 0 10px ${def.color}80` : 'none',
              }}>{lvls[i]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11 }}>{def.icon}</span>
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: def.color, fontFamily: 'monospace', letterSpacing: '0.04em' }}>{def.id}</span>
                </div>
                <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{def.roleZh}</div>
                {/* XP mini bar */}
                <div style={{ marginTop: 3, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                  <div style={{ width: `${xpInfo.pct}%`, height: '100%', background: def.color, borderRadius: 1, transition: 'width 0.5s ease' }}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Priority list card */}
      <div className="td-lobby-panel td-lobby-priority-card" style={{
        border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12,
        background: 'rgba(0,4,20,0.85)', backdropFilter: 'blur(10px)',
        padding: '10px 12px', flex: 1,
      }}>
        <PriorityList
          priorityList={agents[selectedIdx]?.priority_list || PRIORITY_ACTIONS.map(p => p.id)}
          onChange={(list) => onPriorityChange(selectedIdx, list)}
        />
      </div>
    </div>
  );
}

// ── Center: Holographic Stage ─────────────────────────────────────────────────
function HoloStage({ agents, selectedIdx, onSelect, accentColor, progression, synergy, onHover, mobileActive }) {
  const lvls = AGENT_DEFS.map((_, i) => getLevelFromXP(progression[i]?.xp || 0));

  return (
    <div className={`td-lobby-stage td-lobby-panel ${mobileActive ? 'td-mobile-active' : ''}`} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `linear-gradient(${accentColor}12 1px, transparent 1px), linear-gradient(90deg, ${accentColor}12 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
        maskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, black 30%, transparent 100%)',
      }}/>

      {/* Particle network canvas */}
      <ParticleCanvas agents={agents} selectedIdx={selectedIdx} accentColor={accentColor} />

      <div className="td-stage-focus">
        <span>AGENT CONFIGURATION</span>
        <strong style={{ color: AGENT_DEFS[selectedIdx].color }}>{AGENT_DEFS[selectedIdx].icon} {AGENT_DEFS[selectedIdx].id}</strong>
        <small>{synergy.active.length ? `${synergy.active.length} 项协同已激活` : '选择探员并调整专长'}</small>
      </div>

      {/* Agents on stage */}
      <div style={{
        position: 'absolute', bottom: 118, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end',
        padding: '0 30px', zIndex: 3,
      }}>
        {AGENT_DEFS.map((def, i) => (
          <HoloFigure
            key={i} agentDef={def} isSelected={selectedIdx === i}
            index={i} level={lvls[i]} onClick={() => onSelect(i)} onHover={onHover}
          />
        ))}
      </div>

      {/* Platform ellipse */}
      <div style={{ position: 'absolute', bottom: 58, left: '10%', right: '10%', zIndex: 2 }}>
        <svg viewBox="0 0 400 50" width="100%" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="plat-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.7"/>
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.05"/>
            </linearGradient>
          </defs>
          <ellipse cx="200" cy="14" rx="198" ry="16" fill="url(#plat-g)" opacity="0.85"/>
          <ellipse cx="200" cy="14" rx="198" ry="16" fill="none" stroke={accentColor} strokeWidth="1.2" opacity="0.6"/>
          <ellipse cx="200" cy="14" rx="148" ry="12" fill="none" stroke={accentColor} strokeWidth="0.6" strokeDasharray="6 5" opacity="0.3"
            style={{ animation: 'spin-ring 10s linear infinite', transformOrigin: '200px 14px' }}/>
          {[0, 72, 144, 216, 288].map((angle, i) => {
            const r = (angle * Math.PI) / 180;
            return <circle key={i} cx={200 + 180 * Math.cos(r)} cy={14 + 14 * Math.sin(r)} r="3"
              fill={accentColor} opacity="0.8" style={{ animation: `plat-dot 2.5s ${i * 0.5}s ease-in-out infinite` }}/>;
          })}
          <text x="200" y="38" textAnchor="middle" fill={accentColor} fontSize="6"
            fontFamily="monospace" opacity="0.4" letterSpacing="4">
            AGENT DISPATCH CENTER · AI INVESTIGATION UNIT
          </text>
        </svg>
      </div>

      <style>{`
        @keyframes spin-ring { from{stroke-dashoffset:0} to{stroke-dashoffset:100} }
        @keyframes plat-dot { 0%,100%{opacity:0.3} 50%{opacity:1} }
      `}</style>
    </div>
  );
}

// ── Right: Attribute Config + Skill Tree ─────────────────────────────────────
function AttributePanel({ agent, agentDef, agentIdx, spec, onSpecChange, allAgents, progression, skillLoadout, onSkillLoadout, mobileActive }) {
  const [tab, setTab] = useState('attrs'); // 'attrs' | 'skills' | 'dossier'

  const tabs = [
    { key: 'attrs',   label: '属性配置', icon: '⚙️' },
    { key: 'skills',  label: '技能树',   icon: '🌐' },
    { key: 'dossier', label: '档案',     icon: '📁' },
  ];

  return (
    <div className={`td-lobby-attributes ${mobileActive ? 'td-mobile-active' : ''}`} style={{
      width: 300, flexShrink: 0, padding: '12px 12px 12px 0',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div className="td-lobby-panel td-lobby-attribute-card" style={{
        border: `1px solid ${agentDef.color}35`, borderRadius: 12, overflow: 'hidden',
        background: 'rgba(0,8,24,0.85)', backdropFilter: 'blur(10px)',
        flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        {/* Agent identity header */}
        <div style={{ padding: '7px 12px', borderBottom: `1px solid ${agentDef.color}20`, background: `${agentDef.color}07` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{agentDef.icon}</span>
            <div>
              <div style={{ fontSize: '0.6rem', color: agentDef.color, fontWeight: 900, fontFamily: 'monospace' }}>{agentDef.id}</div>
              <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{agentDef.roleZh}</div>
            </div>
          </div>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: '0.5rem', fontWeight: 700,
                background: tab === t.key ? agentDef.color + '22' : 'rgba(255,255,255,0.04)',
                color: tab === t.key ? agentDef.color : 'rgba(255,255,255,0.35)',
                borderBottom: `2px solid ${tab === t.key ? agentDef.color : 'transparent'}`,
                transition: 'all 0.2s',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {tab === 'attrs' && (
            <>
              {/* Radar chart */}
              <div style={{
                display: 'flex', justifyContent: 'center',
                padding: '8px 0 4px', marginBottom: 6,
                borderBottom: `1px solid ${agentDef.color}20`,
              }}>
                <AgentRadarChart
                  agent={agent}
                  agentColor={agentDef.color}
                  allAgents={allAgents}
                  size={150}
                />
              </div>
              <SpecialtyAttrPanel
                agentIdx={agentIdx}
                spec={spec}
                onSpecChange={onSpecChange}
                agentColor={agentDef.color}
              />
              <div style={{ marginTop: 8, padding: '8px 10px', border: `1px solid ${agentDef.color}25`, borderRadius: 8, background: `${agentDef.color}07` }}>
                <div style={{ fontSize: '0.48rem', color: agentDef.color, fontWeight: 700, fontFamily: 'monospace', marginBottom: 4 }}>◎ AGENT TRAIT</div>
                <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', lineHeight: 1.55 }}>{agentDef.desc}</div>
              </div>
            </>
          )}
          {tab === 'skills' && (
            <SkillTreePanel agentIdx={agentIdx} progression={progression} loadout={skillLoadout} onChange={onSkillLoadout} />
          )}
          {tab === 'dossier' && (
            <AgentDossierPanel
              agentIdx={agentIdx}
              color={agentDef.color}
              icon={agentDef.icon}
              roleZh={agentDef.roleZh}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status Bar ────────────────────────────────────────────────────────────────
function StatusBar({ onBack, onOpenSettings, profile, readOnly }) {
  const [time, setTime] = useState(new Date());
  const { lang } = useLang();
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div className="td-lobby-status" style={{
      height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', borderBottom: '1px solid rgba(0,229,255,0.15)',
      background: 'rgba(0,0,0,0.65)', fontFamily: 'monospace', fontSize: '0.5rem', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{
            padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(0,229,255,0.45)', background: 'rgba(0,229,255,0.1)',
            color: '#00e5ff', fontFamily: 'monospace', fontSize: '0.5rem', letterSpacing: '0.12em',
            whiteSpace: 'nowrap',
          }}>◄ {lang === 'zh' ? '侦探之家' : 'HOME'}</button>
        )}
        <span className="td-lobby-brand">TD<span>//</span>07</span>
        <span className="td-lobby-user">
          {profile?.avatar || '🕵️'} <strong>{profile?.detective_name || (lang === 'zh' ? '未命名侦探' : 'UNNAMED')}</strong>
          <em>LV.{profile?.level || 1}</em>
        </span>
      </div>
      <div className="td-lobby-status-right" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="td-lobby-wallet-pill">⚡ <b>{profile?.energy || 0}</b></span>
        <span className="td-lobby-wallet-pill">💎 <b>{(profile?.diamonds || 0).toLocaleString('en-US')}</b></span>
        <span className="td-lobby-wallet-pill">🪙 <b>{(profile?.gold || 0).toLocaleString('en-US')}</b></span>
        <span className={`td-lobby-link-state ${readOnly ? 'is-readonly' : ''}`}>● {readOnly ? (lang === 'zh' ? '只读' : 'READ ONLY') : (lang === 'zh' ? '云端在线' : 'CLOUD ONLINE')}</span>
        <span style={{ color: '#00e5ff', fontWeight: 700 }}>
          {time.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <button onClick={onOpenSettings} title={lang === 'zh' ? '设置' : 'Settings'} style={{
          padding: '2px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          border: '1px solid rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.1)', color: '#00e5ff',
        }}>⚙️</button>
      </div>
    </div>
  );
}

// ── Deploy Controls ───────────────────────────────────────────────────────────
function DeployControls({ onDeploy, onSave, onLoad, onTutorial, synergyOver, synergy, onApplyPreset, disabled = false }) {
  const [deploying, setDeploying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const prevSynergy = useRef(synergy);

  // Flash animation whenever synergy changes
  useEffect(() => {
    if (prevSynergy.current !== synergy) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 350);
      prevSynergy.current = synergy;
      return () => clearTimeout(t);
    }
  }, [synergy]);

  const handleDeploy = async () => {
    if (disabled || deploying) return;
    setDeploying(true);
    try { await onDeploy(); } catch { /* parent displays the sync failure */ } finally { setDeploying(false); }
  };

  const handleSave = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try { await onSave(); } catch { /* parent displays the sync failure */ } finally { setSaving(false); }
  };

  const c = synergyOver ? '#ff3860' : '#00e5ff';
  const barPct = Math.min(synergy, 100);

  const btns = [
    { label: saving ? '同步中' : '保存编队', icon: '💾', onClick: async () => { await handleSave(); setToolsOpen(false); }, color: '#00e5ff', disabled: saving || disabled },
    { label: '加载预设', icon: '📂', onClick: () => { onLoad(); setToolsOpen(false); }, color: '#a78bfa' },
    { label: '大厅教程', icon: '❓', onClick: () => { onTutorial(); setToolsOpen(false); }, color: 'rgba(255,255,255,0.58)' },
  ];

  return (
    <div className="td-lobby-controls" style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
      borderTop: `1px solid ${synergyOver ? '#ff386040' : 'rgba(0,229,255,0.15)'}`,
      background: synergyOver ? 'rgba(30,0,8,0.85)' : 'rgba(0,0,0,0.75)',
      flexShrink: 0, transition: 'background 0.4s, border-color 0.4s',
    }}>
      <div className="td-lobby-tools-wrap">
        <button className="td-lobby-tools-toggle" type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen(value => !value)}>
          <span>☰</span><span>编队工具</span><small>{toolsOpen ? '收起' : '预设 / 保存'}</small>
        </button>
        {toolsOpen && <div className="td-lobby-tools-popover">
          <div className="td-lobby-tool-actions">{btns.map((button) => <button key={button.label} onClick={button.onClick} disabled={button.disabled} style={{ color: button.color, borderColor: `${button.color}45`, background: `${button.color}0d` }}><span>{button.icon}</span>{button.label}</button>)}</div>
          <PresetChips onApply={preset => { onApplyPreset(preset); setToolsOpen(false); }} />
        </div>}
      </div>

      <div className="td-lobby-synergy-compact" style={/** @type {React.CSSProperties & {'--synergy-color': string}} */ ({ '--synergy-color': c })}>
        <span>{synergyOver ? '⚠ 专长过载' : '队伍协同'}</span>
        <strong style={{ transform: flash ? 'scale(1.08)' : 'scale(1)' }}>{synergy}<small>%</small></strong>
        <i><b style={{ width: `${barPct}%` }} /></i>
      </div>

      {/* Main deploy */}
      <button
        onClick={handleDeploy}
        disabled={deploying || disabled}
        title={disabled ? '当前设备为只读，请先接管此设备' : synergyOver ? '专长过载：三人专长雷同，部署后将承受协同惩罚（混乱增长 +15%）' : ''}
        style={{
          flex: 1, maxWidth: 330, marginLeft: 'auto',
          padding: '11px 24px', borderRadius: 10,
          border: `2px solid ${synergyOver ? '#ff386070' : deploying ? 'rgba(0,229,255,0.3)' : '#00e5ffaa'}`,
          background: synergyOver
            ? 'rgba(255,56,96,0.12)'
            : deploying
            ? 'rgba(0,229,255,0.15)'
            : 'linear-gradient(135deg, rgba(0,80,160,0.7) 0%, rgba(0,200,255,0.45) 100%)',
          color: synergyOver ? '#ff3860' : '#fff',
          cursor: disabled ? 'not-allowed' : deploying ? 'wait' : 'pointer',
          fontFamily: 'monospace', fontWeight: 900, fontSize: '0.78rem', letterSpacing: '0.2em',
          textShadow: synergyOver ? '0 0 12px rgba(255,56,96,0.9)' : '0 0 12px rgba(0,229,255,0.9)',
          boxShadow: synergyOver
            ? '0 0 24px rgba(255,56,96,0.3)'
            : '0 0 24px rgba(0,200,255,0.35), 0 0 50px rgba(0,200,255,0.1)',
          transition: 'all 0.3s', position: 'relative', overflow: 'hidden',
          opacity: disabled ? .42 : synergyOver ? 0.85 : 1,
        }}>
        {!synergyOver && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, transparent, rgba(0,229,255,0.12), transparent)',
            animation: 'btn-shimmer 2.2s linear infinite',
          }}/>
        )}
        <span style={{ position: 'relative', zIndex: 1 }}>
          {synergyOver ? '⚠ 专长过载 · 仍可部署' : deploying ? '⟳  DEPLOYING...' : '▶  部署探员'}
        </span>
      </button>
      <style>{`
        @keyframes btn-shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
        @keyframes synergy-warn{0%,100%{opacity:1}50%{opacity:0.35}}
      `}</style>
    </div>
  );
}

// ── Main HolographicLobby ─────────────────────────────────────────────────────
export default function HolographicLobby({ profile, readOnly = false, onDeploy, onBack, onTeamSave, onSkillLoadout }) {
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const noticeTimerRef = useRef(null);
  const {
    agents, specs, selectedIdx, setSelectedIdx, skillLoadout, setSkillLoadout,
    updateSpec, updatePriority, applyPreset, currentConfig, loadSaved,
  } = useTeamBuilder(profile);
  const progression = profile?.agent_progression || [];
  const activeSupport = getActiveSupportAgent(profile);
  const [mobileTab, setMobileTab] = useState('stage');

  const accentColor = '#00e5ff';

  const showNotice = useCallback((message, duration = 1800) => {
    window.clearTimeout(noticeTimerRef.current);
    setSaveNotice(message);
    noticeTimerRef.current = window.setTimeout(() => setSaveNotice(''), duration);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  const synergy = calcTeamSynergy(specs);

  // ── 协同技能解锁：检测新激活的技能并播放全屏特效 ──
  const [unlockQueue, setUnlockQueue] = useState([]);
  const prevActiveRef = useRef([]);
  useEffect(() => {
    const ids = synergy.active.map(s => s.id);
    const fresh = synergy.active.filter(s => !prevActiveRef.current.includes(s.id));
    prevActiveRef.current = ids;
    if (fresh.length) setUnlockQueue(q => [...q, ...fresh]);
  }, [synergy.active.map(s => s.id).join(',')]);

  const [hover, setHover] = useState(null); // { idx, x, y }
  const handleHover = useCallback((idx, x, y) => {
    setHover(idx === null || idx === undefined ? null : { idx, x, y });
  }, []);

  const [showSequence, setShowSequence] = useState(false);
  const matchForecast = calcCaseMatchScore(agents).score;

  const prepareDeploy = async () => {
    const config = currentConfig();
    try {
      await onTeamSave?.(config);
      setShowSequence(true);
    } catch (cause) {
      showNotice('⚠ 编队同步失败，请重试', 2400);
      throw cause;
    }
  };

  return (
    <div className="td-lobby" style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 30% 15%, #050e22 0%, #020810 55%, #010408 100%)',
      fontFamily: "'Courier New', monospace", color: 'white',
      overflow: 'hidden', position: 'relative',
    }}>
      <LobbyAtmosphere />
      {/* Scanlines */}
      {settings.scanlines && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
        }}/>
      )}

      {/* Corner brackets */}
      {[
        { top: 0, left: 0, borderTop: '2px solid #00e5ff40', borderLeft: '2px solid #00e5ff40' },
        { top: 0, right: 0, borderTop: '2px solid #a78bfa40', borderRight: '2px solid #a78bfa40' },
        { bottom: 54, left: 0, borderBottom: '2px solid #00e5ff40', borderLeft: '2px solid #00e5ff40' },
        { bottom: 54, right: 0, borderBottom: '2px solid #a78bfa40', borderRight: '2px solid #a78bfa40' },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 36, height: 36, pointerEvents: 'none', zIndex: 10, ...s }}/>
      ))}

      <StatusBar profile={profile} readOnly={readOnly} onBack={onBack} onOpenSettings={() => setShowSettings(true)} />

      {showSettings && <SettingsDrawer onClose={() => setShowSettings(false)} />}

      {showTutorial && (
        <div onClick={() => setShowTutorial(false)} style={{
          position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center',
          padding: 20, background: 'rgba(0,4,12,.82)', backdropFilter: 'blur(8px)',
        }}>
          <div onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" style={{
            width: 'min(560px, 94vw)', padding: 24, borderRadius: 16,
            border: '1px solid rgba(0,229,255,.45)', background: '#06101d',
            boxShadow: '0 0 45px rgba(0,229,255,.18)', fontFamily: 'monospace',
          }}>
            <div style={{ color: '#7df1ff', fontWeight: 900, fontSize: '1rem' }}>探员大厅快速指南</div>
            <ol style={{ color: 'rgba(235,249,255,.7)', fontSize: '.68rem', lineHeight: 1.9, paddingLeft: 20 }}>
              <li>选择一名探员，为其分配专长点数。</li>
              <li>拖动行动优先级，决定 AI 调查顺序。</li>
              <li>保持三名探员专长互补，可激活协同能力。</li>
              <li>点击“保存”记录预设，再部署进入案件簿。</li>
            </ol>
            <button onClick={() => setShowTutorial(false)} style={{
              width: '100%', padding: 10, borderRadius: 8, cursor: 'pointer',
              border: '1px solid #00e5ff80', background: 'rgba(0,229,255,.12)', color: '#7df1ff',
              fontFamily: 'monospace', fontWeight: 900,
            }}>明白了 · CONTINUE</button>
          </div>
        </div>
      )}

      {saveNotice && <div role="status" style={{
        position: 'fixed', right: 18, bottom: 78, zIndex: 70, padding: '9px 14px',
        borderRadius: 9, border: '1px solid rgba(0,255,136,.45)',
        background: 'rgba(0,24,18,.94)', color: '#00ff88', fontSize: '.58rem', fontFamily: 'monospace',
      }}>{saveNotice}</div>}

      {/* 协同技能解锁特效 */}
      <SynergyUnlockFX
        skill={unlockQueue[0] || null}
        onDone={() => setUnlockQueue(q => q.slice(1))}
      />

      {/* Title */}
      <div className="td-lobby-title" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 20px', borderBottom: '1px solid rgba(0,229,255,0.1)',
        background: 'rgba(0,0,0,0.35)', flexShrink: 0, zIndex: 1,
      }}>
        <div className="td-lobby-title-copy">
          <span className="td-lobby-heading" style={{ fontSize: '1.05rem', fontWeight: 900, color: '#00e5ff', textShadow: '0 0 14px #00e5ff80', fontFamily: 'monospace', letterSpacing: '0.06em' }}>探员编组</span>
          <small>{activeSupport ? `支援 ${activeSupport.icon} ${activeSupport.id} 已接入 · 选择探员、调整专长，然后部署` : '选择探员、调整专长，然后部署'}</small>
        </div>
        <div className="td-lobby-readiness">
          <div><small>CASE MATCH</small><strong>{matchForecast}<em>%</em></strong></div>
          <i />
          <div className="td-lobby-primary"><small>PRIMARY AGENT</small><strong style={{ color: AGENT_DEFS[selectedIdx].color }}>{AGENT_DEFS[selectedIdx].icon} {AGENT_DEFS[selectedIdx].id}</strong></div>
        </div>
      </div>

      <div className="td-lobby-mobile-tabs" role="tablist">
        {[['agents', '探员'], ['stage', '舞台'], ['attrs', '属性']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={mobileTab === key} onClick={() => setMobileTab(key)}>{label}</button>
        ))}
      </div>

      {/* Main */}
      <div className="td-lobby-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <TeamRosterPanel
          agents={agents} selectedIdx={selectedIdx}
          onSelect={setSelectedIdx} progression={progression}
          onPriorityChange={updatePriority}
          onHover={handleHover}
          mobileActive={mobileTab === 'agents'}
        />
        <HoloStage
          agents={agents} selectedIdx={selectedIdx}
          onSelect={setSelectedIdx} accentColor={accentColor}
          progression={progression}
          synergy={synergy}
          onHover={handleHover}
          mobileActive={mobileTab === 'stage'}
        />
        <AttributePanel
          agent={agents[selectedIdx]}
          agentDef={AGENT_DEFS[selectedIdx]}
          agentIdx={selectedIdx}
          spec={specs[selectedIdx]}
          onSpecChange={updateSpec}
          allAgents={agents}
          progression={progression}
          skillLoadout={skillLoadout}
          onSkillLoadout={async next => {
            if (readOnly) return;
            setSkillLoadout(next);
            try { await onSkillLoadout?.(next); } catch { setSkillLoadout(profile?.skill_loadout || []); }
          }}
          mobileActive={mobileTab === 'attrs'}
        />
      </div>

      {/* 探员档案悬浮预览 */}
      {hover && (
        <AgentLoreTooltip
          lore={getLore(hover.idx)}
          color={AGENT_DEFS[hover.idx].color}
          icon={AGENT_DEFS[hover.idx].icon}
          roleZh={AGENT_DEFS[hover.idx].roleZh}
          x={hover.x} y={hover.y}
        />
      )}

      {/* 部署过场动画 */}
      {showSequence && (
        <DeploySequence
          matchScore={matchForecast}
          onComplete={() => {
            setShowSequence(false);
            onDeploy(buildTeamConfig(currentConfig(), selectedIdx, skillLoadout, activeSupport?.id));
          }}
        />
      )}

      <DeployControls
        onApplyPreset={applyPreset}
        onDeploy={prepareDeploy}
        onSave={async () => {
          const config = currentConfig();
          try {
            await onTeamSave?.(config);
            showNotice('✓ 编队预设已保存');
          } catch (cause) {
            showNotice('⚠ 编队同步失败，请重试', 2400);
            throw cause;
          }
        }}
        onLoad={loadSaved}
        synergy={Math.round(synergy.matchScore * 100)}
        synergyOver={synergy.overload}
        onTutorial={() => setShowTutorial(true)}
        disabled={readOnly}
      />
    </div>
  );
}
