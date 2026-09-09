import Icon from '@/components/ui/Icon';
import React, { useRef, useEffect, useState, useCallback, useId } from 'react';
import { SKILL_TREES, getLevelFromXP } from '@/game/agentProgression';
import { useLang } from '@/lib/lang.jsx';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';

// ── 每个探员的技能链定义（线性解锁关系）─────────────────────────────────────
// skills[0] → skills[1] → skills[2] → ...
// prerequisite: 每个技能需要前一个技能已解锁才能装备

const AGENT_NAMES  = ['NEXUS-01', 'AURORA-09', 'CIPHER-47'];
const AGENT_COLORS = ['#709f9a', '#9b9aae', '#c19a63'];
const AGENT_ICONS  = ['👁️', '🔬', '💻'];

// Canvas coordinates scale horizontally; node centers share that scale, not their 56px hit areas.
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
  const { motionEnabled, foreground } = usePresentationMotion();
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !foreground) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
        if (motionEnabled && t < 89 && fromUnlocked && toUnlocked) {
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
      if (motionEnabled && t < 90) frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [skills, equippedIds, unlockedByLevel, color, positions, motionEnabled, foreground]);

  return (
    <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
  );
}

// ── Single skill node ─────────────────────────────────────────────────────────
function SkillNode({ skill, position, color, state, onClick, onHover, onFocus, onDismiss, tooltipId }) {
  const { lang } = useLang();
  // state: 'locked' | 'available' | 'equipped'
  const stateConfig = {
    locked:    { border: 'rgba(255,255,255,0.12)', bg: 'rgba(255,255,255,0.03)', opacity: 0.45, glow: 0 },
    available: { border: color + '60',              bg: color + '0a',             opacity: 1,    glow: 8 },
    equipped:  { border: color,                     bg: color + '22',             opacity: 1,    glow: 18 },
  };
  const cfg = stateConfig[state];

  return (
    <button type="button" className="td-skill-node" disabled={state === 'locked'}
      aria-label={lang === 'zh' ? skill.name : (skill.nameEn || skill.name)}
      aria-pressed={state === 'equipped'}
      aria-describedby={tooltipId}
      onClick={() => onClick(skill)}
      onFocus={() => onFocus(skill.id)} onBlur={() => onFocus(null)}
      onMouseEnter={() => onHover(skill.id)}
      onMouseLeave={() => onHover(null)}
      onKeyDown={event => { if (event.key === 'Escape') onDismiss(skill.id); }}
      style={{
        position: 'absolute',
        left: `calc(${position.x / CANVAS_W * 100}% - ${NODE_RADIUS}px)`,
        top:  position.y - NODE_RADIUS,
        width: NODE_RADIUS * 2,
        height: NODE_RADIUS * 2,
        boxSizing: 'border-box',
        borderRadius: '50%',
        border: `2px solid ${cfg.border}`,
        background: cfg.bg,
        color, padding: 0,
        opacity: cfg.opacity,
        cursor: state === 'locked' ? 'not-allowed' : 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.25s ease',
        boxShadow: state === 'equipped' ? `inset 0 0 0 3px ${color}20` : 'none',
        zIndex: 5,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}><Icon name={skill.icon} /></span>
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
    </button>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function SkillTooltip({ id, skill, position, color, state }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  if (!skill) return null;
  const name = zh ? skill.name : (skill.nameEn || skill.name);
  const desc = zh ? skill.desc : (skill.descEn || skill.desc);
  const belowNode = position.y < CANVAS_H / 2;
  return (
    <div id={id} role="tooltip" className="td-skill-tooltip" style={{
      position: 'absolute',
      [belowNode ? 'top' : 'bottom']: belowNode ? position.y + NODE_RADIUS + 8 : CANVAS_H - position.y + NODE_RADIUS + 8,
      left: 8,
      right: 8,
      width: 'calc(100% - 16px)',
      maxWidth: 280,
      boxSizing: 'border-box',
      margin: '0 auto',
      overflowWrap: 'anywhere',
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
        <span style={{ fontSize: 18, flexShrink: 0 }}><Icon name={skill.icon} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color, fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.04em' }}>{name}</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.45rem' }}>{zh ? '需要' : 'REQUIRES'} Lv.{skill.unlock_level}</div>
        </div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.52rem', lineHeight: 1.6 }}>{desc}</div>
      {state === 'equipped' && (
        <div style={{
          marginTop: 6, padding: '4px 7px', borderRadius: 4,
          border: '1px solid #8aaa9140', background: '#8aaa9110',
        }}>
          <span style={{ color: '#8aaa91', fontSize: '0.44rem', fontWeight: 900 }}>◉ {zh ? '本局效果' : 'ACTIVE EFFECT'}</span>
          <div style={{ color: '#8aaa91cc', fontSize: '0.46rem', marginTop: 2, lineHeight: 1.5 }}>
            {zh ? '部署后真实生效：' : 'Applies after deployment: '}{desc}
          </div>
        </div>
      )}
      {state === 'available' && (
        <div style={{ marginTop: 6, color, fontSize: '0.48rem', background: color + '15', borderRadius: 4, padding: '3px 6px', textAlign: 'center' }}>
          {zh ? '点击装备' : 'CLICK TO EQUIP'}
        </div>
      )}
      {state === 'equipped' && (
        <div style={{ marginTop: 6, color: '#c77c78', fontSize: '0.48rem', background: '#c77c7815', borderRadius: 4, padding: '3px 6px', textAlign: 'center' }}>
          {zh ? '点击卸下' : 'CLICK TO UNEQUIP'}
        </div>
      )}
      <style>{`@keyframes tt-in{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

// ── Main SkillTreePanel ────────────────────────────────────────────────────────
export default function SkillTreePanel({ agentIdx, progression = [], loadout = [], onChange }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const color = AGENT_COLORS[agentIdx];
  const skills = SKILL_TREES[agentIdx] || [];
  const positions = getNodePositions(skills.length);

  const equipped = [0, 1, 2].map(index => {
    const agentId = ['NEXUS-01', 'AURORA-09', 'CIPHER-47'][index];
    return loadout.find(row => row?.agent_id === agentId)?.skill_ids || loadout[index] || [];
  });
  const [hoveredId, setHoveredId] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const [dismissedId, setDismissedId] = useState(null);
  const tooltipId = useId();

  const xp = progression[agentIdx]?.xp || 0;
  const level = getLevelFromXP(xp);
  const unlockedByLevel = skills.filter(s => level >= s.unlock_level).map(s => s.id);
  const equippedIds = equipped[agentIdx] || [];

  const handleSkillClick = useCallback((skill) => {
    const current = [...(equipped[agentIdx] || [])];
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
        if (!prereqsMet) return;
        next = [...current, skill.id];
      }
      const ids = ['NEXUS-01', 'AURORA-09', 'CIPHER-47'];
      const updated = ids.map((agentId, i) => ({ agent_id: agentId, skill_ids: i === agentIdx ? next : equipped[i] }));
      onChange?.(updated);
  }, [agentIdx, equipped, onChange, skills]);

  // Determine node state
  const getNodeState = (skill, idx) => {
    if (!unlockedByLevel.includes(skill.id)) return 'locked';
    // Can only equip if previous is equipped (or it's the first)
    const prereqMet = idx === 0 || equippedIds.includes(skills[idx - 1].id);
    if (equippedIds.includes(skill.id)) return 'equipped';
    if (prereqMet) return 'available';
    return 'available'; // show as available but equip blocked by prereq check
  };

  const activeId = focusedId || hoveredId;
  const activeSkill = activeId !== dismissedId ? skills.find(s => s.id === activeId) : null;
  const activePos = activeSkill ? positions[skills.indexOf(activeSkill)] : null;
  const activeState = activeSkill ? getNodeState(activeSkill, skills.indexOf(activeSkill)) : null;

  return (
    <div style={{ fontFamily: 'monospace', position: 'relative', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: '0.52rem', color, fontWeight: 700, letterSpacing: '0.12em' }}>
            <Icon name={AGENT_ICONS[agentIdx]} /> {AGENT_NAMES[agentIdx]} · SKILL TREE
          </div>
          <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
            Lv.{level} · {zh ? `已装备 ${equippedIds.length}/${skills.length} 技能` : `${equippedIds.length}/${skills.length} EQUIPPED`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: color + '80', fontSize: '0.42rem' }}>{zh ? '装备槽' : 'LOADOUT'}</div>
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
      <div className="td-skill-tree" style={{
        position: 'relative', width: '100%', maxWidth: CANVAS_W, height: CANVAS_H,
        borderRadius: 12, boxShadow: `inset 0 0 0 1px ${color}18`,
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
            <div key={`lv-${i}`} className="td-skill-label" style={{
              position: 'absolute',
              top: pos.y,
              left: isLeft ? `calc(${pos.x / CANVAS_W * 100}% + ${NODE_RADIUS + 8}px)` : 8,
              right: isLeft ? 8 : `calc(${100 - pos.x / CANVAS_W * 100}% + ${NODE_RADIUS + 8}px)`,
              transform: 'translateY(-50%)',
              fontSize: '0.5rem', fontFamily: 'monospace', lineHeight: 1.4,
              color: unlockedByLevel.includes(skill.id) ? color + 'cc' : 'rgba(255,255,255,0.2)',
              textAlign: isLeft ? 'left' : 'right',
              whiteSpace: 'normal', overflowWrap: 'anywhere',
              pointerEvents: 'none',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.6rem' }}>{zh ? skill.name : (skill.nameEn || skill.name)}</div>
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
            onHover={id => { setHoveredId(id); if (id) setDismissedId(null); }}
            onFocus={id => { setFocusedId(id); if (id) setDismissedId(null); }}
            onDismiss={setDismissedId}
            tooltipId={activeSkill?.id === skill.id ? tooltipId : undefined}
          />
        ))}

        {/* Tooltip */}
        {activeSkill && activePos && (
          <SkillTooltip
            id={tooltipId} skill={activeSkill} position={activePos}
            color={color} state={activeState}
          />
        )}
      </div>

      {/* Equipped skills summary */}
      {equippedIds.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 6 }}>◎ {zh ? '已激活效果' : 'ACTIVE EFFECTS'}</div>
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
                <span style={{ fontSize: 12 }}><Icon name={s.icon} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.58rem', color, fontWeight: 700 }}>{zh ? s.name : (s.nameEn || s.name)}</span>
                  <span style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{zh ? s.desc : (s.descEn || s.desc)}</span>
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
