import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SKILL_TREES, getLevelFromXP, loadProgression } from '@/game/agentProgression';

// ── 每个探员的技能链定义（线性解锁关系）─────────────────────────────────────
// skills[0] → skills[1] → skills[2] → ...
// prerequisite: 每个技能需要前一个技能已解锁才能装备

const AGENT_NAMES  = ['NEXUS-01', 'AURORA-09', 'CIPHER-47'];
const AGENT_COLORS = ['#00e5ff', '#a78bfa', '#ff6b35'];
const AGENT_ICONS  = ['👁️', '🔬', '💻'];

// Node layout — 5 nodes arranged in a branching diagonal chain
// We'll compute positions in a zig-zag pattern inside the canvas
const NODE_RADIUS = 28;
const CANVAS_W = 320;
const CANVAS_H = 360;

function getNodePositions(count) {
  // Zig-zag vertical layout
  const positions = [];
  const yStep = (CANVAS_H - 80) / (count - 1);
  for (let i = 0; i < count; i++) {
    const x = i % 2 === 0 ? CANVAS_W * 0.35 : CANVAS_W * 0.65;
    const y = 48 + i * yStep;
    positions.push({ x, y });
  }
  return positions;
}

// ── Animated connector canvas ─────────────────────────────────────────────────
function SkillConnectorCanvas({ skills, equippedIds, unlockedByLevel, positions, color }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      for (let i = 0; i < skills.length - 1; i++) {
        const from = positions[i];
        const to   = positions[i + 1];
        const fromUnlocked = equippedIds.includes(skills[i].id);
        const toUnlocked   = unlockedByLevel.includes(skills[i + 1].id);

        // Base line
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = fromUnlocked ? color + 'cc' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = fromUnlocked ? 2 : 1;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated energy packet along unlocked edges
        if (fromUnlocked && toUnlocked) {
          const progress = ((t * 0.012) + i * 0.4) % 1;
          const px = from.x + (to.x - from.x) * progress;
          const py = from.y + (to.y - from.y) * progress;
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowBlur = 12;
          ctx.shadowColor = color;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      t++;
      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [skills, equippedIds, unlockedByLevel, color, positions]);

  return (
    <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
  );
}

// ── Single skill node ─────────────────────────────────────────────────────────
function SkillNode({ skill, position, color, state, onClick, isHovered, onHover }) {
  // state: 'locked' | 'available' | 'equipped'
  const stateConfig = {
    locked:    { border: 'rgba(255,255,255,0.12)', bg: 'rgba(255,255,255,0.03)', opacity: 0.45, glow: 0 },
    available: { border: color + '60',              bg: color + '0a',             opacity: 1,    glow: 8 },
    equipped:  { border: color,                     bg: color + '22',             opacity: 1,    glow: 18 },
  };
  const cfg = stateConfig[state];

  return (
    <div
      onClick={() => state !== 'locked' && onClick(skill)}
      onMouseEnter={() => onHover(skill.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: 'absolute',
        left: position.x - NODE_RADIUS,
        top:  position.y - NODE_RADIUS,
        width: NODE_RADIUS * 2,
        height: NODE_RADIUS * 2,
        borderRadius: '50%',
        border: `2px solid ${cfg.border}`,
        background: cfg.bg,
        opacity: cfg.opacity,
        cursor: state === 'locked' ? 'not-allowed' : 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.25s ease',
        boxShadow: state !== 'locked' && isHovered
          ? `0 0 ${cfg.glow + 12}px ${color}, 0 0 ${cfg.glow * 2}px ${color}60`
          : `0 0 ${cfg.glow}px ${color}80`,
        transform: isHovered && state !== 'locked' ? 'scale(1.12)' : 'scale(1)',
        zIndex: 5,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{skill.icon}</span>
      {state === 'equipped' && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          width: 14, height: 14, borderRadius: '50%',
          background: color, border: '2px solid #000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.45rem', fontWeight: 900, color: '#000',
        }}>✓</div>
      )}
      {state === 'locked' && (
        <div style={{ position: 'absolute', bottom: -2, fontSize: '0.42rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
          Lv{skill.unlock_level}
        </div>
      )}
    </div>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function SkillTooltip({ skill, position, color, state, canvasW }) {
  if (!skill) return null;
  const isLeft = position.x > canvasW / 2;
  return (
    <div style={{
      position: 'absolute',
      top: position.y - 50,
      [isLeft ? 'right' : 'left']: canvasW - position.x + 16,
      width: 160,
      background: 'rgba(2,6,20,0.97)',
      border: `1px solid ${color}60`,
      borderRadius: 10,
      padding: '10px 12px',
      fontFamily: 'monospace',
      zIndex: 20,
      pointerEvents: 'none',
      boxShadow: `0 0 20px ${color}30`,
      animation: 'tt-in 0.15s ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 18 }}>{skill.icon}</span>
        <div>
          <div style={{ color, fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.04em' }}>{skill.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.45rem' }}>需要 Lv.{skill.unlock_level}</div>
        </div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.52rem', lineHeight: 1.6 }}>{skill.desc}</div>
      {state === 'equipped' && (
        <div style={{
          marginTop: 6, padding: '4px 7px', borderRadius: 4,
          border: '1px solid #00ff8840', background: '#00ff8810',
        }}>
          <span style={{ color: '#00ff88', fontSize: '0.44rem', fontWeight: 900 }}>◉ 本局效果</span>
          <div style={{ color: '#00ff88cc', fontSize: '0.46rem', marginTop: 2, lineHeight: 1.5 }}>
            部署后真实生效：{skill.desc}
          </div>
        </div>
      )}
      {state === 'available' && (
        <div style={{ marginTop: 6, color, fontSize: '0.48rem', background: color + '15', borderRadius: 4, padding: '3px 6px', textAlign: 'center' }}>
          点击装备
        </div>
      )}
      {state === 'equipped' && (
        <div style={{ marginTop: 6, color: '#ff3860', fontSize: '0.48rem', background: '#ff386015', borderRadius: 4, padding: '3px 6px', textAlign: 'center' }}>
          点击卸下
        </div>
      )}
      <style>{`@keyframes tt-in{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

// ── Main SkillTreePanel ────────────────────────────────────────────────────────
export default function SkillTreePanel({ agentIdx }) {
  const color = AGENT_COLORS[agentIdx];
  const skills = SKILL_TREES[agentIdx] || [];
  const positions = getNodePositions(skills.length);

  // Load state from localStorage
  const [progression] = useState(() => loadProgression());
  const [equipped, setEquipped] = useState(() => {
    try {
      const raw = localStorage.getItem(`skill_equipped_v1`);
      return raw ? JSON.parse(raw) : [[], [], []];
    } catch { return [[], [], []]; }
  });
  const [hoveredId, setHoveredId] = useState(null);

  const xp = progression[agentIdx]?.xp || 0;
  const level = getLevelFromXP(xp);
  const unlockedByLevel = skills.filter(s => level >= s.unlock_level).map(s => s.id);
  const equippedIds = equipped[agentIdx] || [];

  const saveEquipped = useCallback((next) => {
    localStorage.setItem('skill_equipped_v1', JSON.stringify(next));
  }, []);

  const handleSkillClick = useCallback((skill) => {
    setEquipped(prev => {
      const current = [...(prev[agentIdx] || [])];
      const idx = current.indexOf(skill.id);
      let next;
      if (idx >= 0) {
        // Unequip — also unequip all that depend on this (higher index)
        const skillIdx = skills.findIndex(s => s.id === skill.id);
        const toRemove = skills.slice(skillIdx).map(s => s.id);
        next = current.filter(id => !toRemove.includes(id));
      } else {
        // Equip — require all previous skills equipped
        const skillIdx = skills.findIndex(s => s.id === skill.id);
        const prereqsMet = skillIdx === 0 || current.includes(skills[skillIdx - 1].id);
        if (!prereqsMet) return prev; // can't equip out of order
        next = [...current, skill.id];
      }
      const updated = prev.map((arr, i) => i === agentIdx ? next : arr);
      saveEquipped(updated);
      return updated;
    });
  }, [agentIdx, skills, saveEquipped]);

  // Determine node state
  const getNodeState = (skill, idx) => {
    if (!unlockedByLevel.includes(skill.id)) return 'locked';
    // Can only equip if previous is equipped (or it's the first)
    const prereqMet = idx === 0 || equippedIds.includes(skills[idx - 1].id);
    if (equippedIds.includes(skill.id)) return 'equipped';
    if (prereqMet) return 'available';
    return 'available'; // show as available but equip blocked by prereq check
  };

  const hoveredSkill = skills.find(s => s.id === hoveredId);
  const hoveredPos   = hoveredSkill ? positions[skills.indexOf(hoveredSkill)] : null;
  const hoveredState = hoveredSkill ? getNodeState(hoveredSkill, skills.indexOf(hoveredSkill)) : null;

  return (
    <div style={{ fontFamily: 'monospace', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: '0.52rem', color, fontWeight: 700, letterSpacing: '0.12em' }}>
            {AGENT_ICONS[agentIdx]} {AGENT_NAMES[agentIdx]} · SKILL TREE
          </div>
          <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            Lv.{level} · 已装备 {equippedIds.length}/{skills.length} 技能
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: color + '80', fontSize: '0.42rem' }}>装备槽</div>
          <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
            {skills.map((s, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: equippedIds.includes(s.id) ? color : 'rgba(255,255,255,0.1)',
                boxShadow: equippedIds.includes(s.id) ? `0 0 6px ${color}` : 'none',
                transition: 'all 0.3s',
              }}/>
            ))}
          </div>
        </div>
      </div>

      {/* Tree canvas area */}
      <div style={{
        position: 'relative', width: CANVAS_W, height: CANVAS_H,
        border: `1px solid ${color}18`, borderRadius: 12,
        background: `radial-gradient(ellipse at 50% 30%, ${color}06 0%, transparent 70%)`,
        overflow: 'visible',
        margin: '0 auto',
      }}>
        {/* Animated connector lines */}
        <SkillConnectorCanvas
          skills={skills} equippedIds={equippedIds}
          unlockedByLevel={unlockedByLevel}
          positions={positions} color={color}
        />

        {/* Level milestone labels */}
        {skills.map((skill, i) => {
          const pos = positions[i];
          const isLeft = i % 2 === 0;
          return (
            <div key={`lv-${i}`} style={{
              position: 'absolute',
              top: pos.y - 10,
              [isLeft ? 'right' : 'left']: isLeft ? CANVAS_W - pos.x + NODE_RADIUS + 6 : pos.x + NODE_RADIUS + 6,
              fontSize: '0.5rem', fontFamily: 'monospace',
              color: unlockedByLevel.includes(skill.id) ? color + 'cc' : 'rgba(255,255,255,0.2)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.6rem' }}>{skill.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.42rem', marginTop: 1 }}>Lv.{skill.unlock_level}</div>
            </div>
          );
        })}

        {/* Nodes */}
        {skills.map((skill, i) => (
          <SkillNode
            key={skill.id} skill={skill}
            position={positions[i]} color={color}
            state={getNodeState(skill, i)}
            onClick={handleSkillClick}
            isHovered={hoveredId === skill.id}
            onHover={setHoveredId}
          />
        ))}

        {/* Tooltip */}
        {hoveredSkill && hoveredPos && (
          <SkillTooltip
            skill={hoveredSkill} position={hoveredPos}
            color={color} state={hoveredState}
            canvasW={CANVAS_W}
          />
        )}
      </div>

      {/* Equipped skills summary */}
      {equippedIds.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 6 }}>◎ 已激活效果</div>
          {equippedIds.map(id => {
            const s = skills.find(sk => sk.id === id);
            if (!s) return null;
            return (
              <div key={id} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '5px 9px', marginBottom: 4, borderRadius: 7,
                border: `1px solid ${color}30`, background: `${color}08`,
                animation: 'skill-row-in 0.3s ease both',
              }}>
                <span style={{ fontSize: 12 }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.58rem', color, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{s.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes skill-row-in { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
      `}</style>
    </div>
  );
}
