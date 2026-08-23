import React, { useState } from 'react';
import {
  SKILL_TREES,
  getLevelFromXP,
  getXPToNextLevel,
  getUnlockedSkills,
  MAX_LEVEL,
} from '@/game/agentProgression';

const AGENT_COLORS = ['#00e5ff', '#ff6b6b', '#a78bfa'];

export default function AgentSkillPanel({ agentIdx, xp, color: colorProp }) {
  const [expanded, setExpanded] = useState(false);
  const color = colorProp || AGENT_COLORS[agentIdx];
  const level = getLevelFromXP(xp || 0);
  const { current, needed, pct } = getXPToNextLevel(xp || 0);
  const skills = SKILL_TREES[agentIdx] || [];
  const unlockedIds = new Set(getUnlockedSkills(xp || 0, agentIdx).map(s => s.id));
  const isMaxLevel = level >= MAX_LEVEL;

  return (
    <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
      {/* ── Level bar header (always visible) ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 transition-all"
        style={{
          background: `${color}0d`,
          border: `1px solid ${color}30`,
        }}
      >
        {/* Level badge */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: `2px solid ${color}`,
          background: `${color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', fontWeight: 900, fontSize: '0.7rem',
          color, flexShrink: 0,
          boxShadow: `0 0 8px ${color}60`,
        }}>
          {level}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-0.5">
            <span style={{ color, fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em' }}>
              LV.{level} {isMaxLevel ? '· MAX' : `· ${current}/${needed} XP`}
            </span>
            <span style={{ color: `${color}80`, fontSize: '0.55rem', fontFamily: 'monospace' }}>
              {unlockedIds.size}/{skills.length} 技能 {expanded ? '▲' : '▼'}
            </span>
          </div>
          {/* XP bar */}
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
            {!isMaxLevel && (
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 2,
                background: `linear-gradient(to right, ${color}55, ${color})`,
                boxShadow: `0 0 6px ${color}80`,
                transition: 'width 0.5s ease',
              }} />
            )}
            {isMaxLevel && (
              <div style={{
                width: '100%', height: '100%', borderRadius: 2,
                background: `linear-gradient(to right, ${color}, #fff, ${color})`,
                animation: 'xp-shine 2s linear infinite',
              }} />
            )}
          </div>
        </div>
      </button>

      {/* ── Skill tree (expandable) ── */}
      {expanded && (
        <div style={{
          marginTop: 6, borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${color}20`,
          background: 'rgba(0,0,0,0.3)',
        }}>
          {skills.map((skill, si) => {
            const unlocked = unlockedIds.has(skill.id);
            const isNext = !unlocked && level === skill.unlock_level - 1;
            return (
              <div
                key={skill.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '8px 12px',
                  borderBottom: si < skills.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
                  background: unlocked ? `${color}08` : 'transparent',
                  opacity: unlocked ? 1 : isNext ? 0.55 : 0.28,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Skill icon with lock/unlock state */}
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  border: `1.5px solid ${unlocked ? color : 'rgba(255,255,255,0.12)'}`,
                  background: unlocked ? `${color}20` : 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15,
                  boxShadow: unlocked ? `0 0 10px ${color}50` : 'none',
                  position: 'relative',
                }}>
                  {skill.icon}
                  {!unlocked && (
                    <div style={{
                      position: 'absolute', bottom: -2, right: -2,
                      fontSize: 9, lineHeight: 1,
                    }}>🔒</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div style={{
                    fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
                    color: unlocked ? color : 'rgba(255,255,255,0.4)',
                    marginBottom: 1,
                  }}>
                    {skill.name}
                    <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.2)', marginLeft: 6 }}>
                      Lv.{skill.unlock_level}解锁
                    </span>
                  </div>
                  <div style={{ fontSize: '0.58rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', lineHeight: 1.3 }}>
                    {skill.desc}
                  </div>
                </div>

                {/* Status badge */}
                <div style={{
                  fontSize: '0.55rem', fontFamily: 'monospace', fontWeight: 700,
                  color: unlocked ? '#00ff88' : isNext ? '#ffaa00' : 'rgba(255,255,255,0.15)',
                  whiteSpace: 'nowrap',
                  paddingTop: 2,
                }}>
                  {unlocked ? '✦ 激活' : isNext ? '▶ 次级' : `Lv.${skill.unlock_level}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes xp-shine {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
}