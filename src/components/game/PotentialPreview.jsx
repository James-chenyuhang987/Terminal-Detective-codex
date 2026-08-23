import React, { useMemo } from 'react';
import {
  SKILL_TREES,
  LEVEL_XP_TABLE,
  getLevelFromXP,
  XP_REWARDS,
} from '@/game/agentProgression';

const AGENT_NAMES = ['隼目 · 观察型', '破心 · 审讯型', '幽灵 · 黑客型'];

// Recommended attribute distribution per agent archetype
const OPTIMAL_DIST = [
  // Observer: heavy observation, some logic
  { logic_power: 20, observation_focus: 60, hack_level: 20 },
  // Enforcer: heavy logic, some observation
  { logic_power: 60, observation_focus: 25, hack_level: 15 },
  // Phantom: heavy hack, some logic
  { logic_power: 20, observation_focus: 15, hack_level: 65 },
];

// How many cases at each score grade to reach each level
function xpToReachLevel(targetLevel, currentXP) {
  const needed = LEVEL_XP_TABLE[targetLevel] - currentXP;
  if (needed <= 0) return null;
  const casesS = Math.ceil(needed / XP_REWARDS.case_solved_S);
  const casesA = Math.ceil(needed / XP_REWARDS.case_solved_A);
  return { needed, casesS, casesA };
}

function AttrBar({ label, icon, current, optimal, color, pool }) {
  const pctCurrent = (current / pool) * 100;
  const pctOptimal = (optimal / pool) * 100;
  const gap = optimal - current;
  const isGood = current >= optimal - 5;

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-0.5">
        <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
          {icon} {label}
        </span>
        <span style={{ fontSize: '0.6rem', fontFamily: 'monospace' }}>
          <span style={{ color }}>{current}</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}> → </span>
          <span style={{ color: isGood ? '#00ff88' : '#ffaa00' }}>{optimal}</span>
          {gap > 0 && (
            <span style={{ color: '#ffaa00', marginLeft: 3, fontSize: '0.55rem' }}>(+{gap})</span>
          )}
        </span>
      </div>
      <div className="relative" style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
        {/* Current */}
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pctCurrent}%`,
          borderRadius: 3,
          background: `linear-gradient(to right, ${color}55, ${color})`,
          transition: 'width 0.4s ease',
        }} />
        {/* Optimal target marker */}
        <div style={{
          position: 'absolute',
          left: `${Math.min(pctOptimal, 99)}%`,
          top: -2, bottom: -2, width: 2,
          background: isGood ? '#00ff88' : '#ffaa00',
          borderRadius: 1,
          boxShadow: `0 0 6px ${isGood ? '#00ff88' : '#ffaa00'}`,
        }} />
        {/* Projected fill (ghost) */}
        {gap > 0 && (
          <div style={{
            position: 'absolute', left: `${pctCurrent}%`, top: 0, height: '100%',
            width: `${Math.min(pctOptimal - pctCurrent, 100 - pctCurrent)}%`,
            borderRadius: '0 3px 3px 0',
            background: `repeating-linear-gradient(90deg, ${isGood ? '#00ff88' : '#ffaa00'}40 0px, ${isGood ? '#00ff88' : '#ffaa00'}40 3px, transparent 3px, transparent 6px)`,
          }} />
        )}
      </div>
    </div>
  );
}

function SkillMilestone({ skill, unlocked, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 8px',
      borderRadius: 8,
      background: unlocked ? `${color}12` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${unlocked ? color + '40' : 'rgba(255,255,255,0.06)'}`,
      marginBottom: 3,
      opacity: unlocked ? 1 : 0.5,
    }}>
      <span style={{ fontSize: 12 }}>{unlocked ? skill.icon : '🔒'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.58rem', fontFamily: 'monospace', color: unlocked ? color : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
          {skill.name} <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.2)' }}>Lv.{skill.unlock_level}</span>
        </div>
      </div>
      <div style={{
        fontSize: '0.5rem', fontFamily: 'monospace',
        color: unlocked ? '#00ff88' : 'rgba(255,255,255,0.2)',
      }}>
        {unlocked ? '✦已解锁' : `需Lv.${skill.unlock_level}`}
      </div>
    </div>
  );
}

export default function PotentialPreview({ agent, agentIdx, xp, color }) {
  const skills = SKILL_TREES[agentIdx] || [];
  const currentLevel = getLevelFromXP(xp || 0);
  const optimal = OPTIMAL_DIST[agentIdx];
  const pool = 100;

  const attrs = [
    { key: 'logic_power',       label: '逻辑推理', icon: '🧠' },
    { key: 'observation_focus', label: '观察力',   icon: '👁️' },
    { key: 'hack_level',        label: '黑客技术', icon: '💻' },
  ];

  // Next 3 skills to unlock
  const upcomingSkills = skills.filter(s => s.unlock_level > currentLevel).slice(0, 3);
  const unlockedSkills = skills.filter(s => s.unlock_level <= currentLevel);

  // Attr suggestion score: how close to optimal
  const attrScore = Math.round(
    attrs.reduce((s, a) => s + (1 - Math.abs((agent[a.key] || 0) - optimal[a.key]) / pool), 0) / attrs.length * 100
  );

  // Advice
  const advice = useMemo(() => {
    const tips = [];
    attrs.forEach(a => {
      const cur = agent[a.key] || 0;
      const opt = optimal[a.key];
      if (cur < opt - 10) tips.push(`↑ ${a.label} 距最优差 ${opt - cur}pt`);
      if (cur > opt + 15) tips.push(`↓ ${a.label} 略微过投，可重新分配`);
    });
    if (tips.length === 0) tips.push('当前加点已接近最优配置 ✓');
    return tips;
  }, [agent, agentIdx]);

  // XP to next unlock
  const nextSkill = upcomingSkills[0];
  const xpInfo = nextSkill ? xpToReachLevel(nextSkill.unlock_level, xp || 0) : null;

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        marginTop: 8,
        borderRadius: 12,
        border: `1px solid ${color}30`,
        background: 'rgba(0,0,0,0.35)',
        padding: '10px 12px',
        fontFamily: 'monospace',
      }}
    >
      {/* Header */}
      <div style={{
        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
        color, marginBottom: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>◈ 潜能预览 · {AGENT_NAMES[agentIdx]}</span>
        <span style={{
          fontSize: '0.55rem', padding: '1px 7px', borderRadius: 6,
          border: `1px solid ${attrScore >= 80 ? '#00ff88' : attrScore >= 50 ? '#ffaa00' : '#ff3860'}50`,
          color: attrScore >= 80 ? '#00ff88' : attrScore >= 50 ? '#ffaa00' : '#ff3860',
          background: attrScore >= 80 ? '#00ff8810' : attrScore >= 50 ? '#ffaa0010' : '#ff386010',
        }}>
          配置评分 {attrScore}%
        </span>
      </div>

      {/* Attr growth sim */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: '0.08em' }}>
          属性分配 vs 最优路径 <span style={{ color: '#ffaa00' }}>▶ 橙线=建议目标</span>
        </div>
        {attrs.map(a => (
          <AttrBar
            key={a.key}
            label={a.label}
            icon={a.icon}
            current={agent[a.key] || 0}
            optimal={optimal[a.key]}
            color={color}
            pool={pool}
          />
        ))}
      </div>

      {/* System advice */}
      <div style={{
        marginBottom: 8, padding: '6px 8px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginBottom: 3, letterSpacing: '0.06em' }}>
          🤖 系统建议
        </div>
        {advice.map((tip, i) => (
          <div key={i} style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            {tip}
          </div>
        ))}
      </div>

      {/* Upcoming skill milestones */}
      {upcomingSkills.length > 0 && (
        <div>
          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: '0.06em' }}>
            ◈ 下一步解锁技能路径
          </div>
          {upcomingSkills.map(s => (
            <SkillMilestone key={s.id} skill={s} unlocked={false} color={color} />
          ))}
          {xpInfo && nextSkill && (
            <div style={{
              marginTop: 5, padding: '4px 8px', borderRadius: 8,
              fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              解锁 <span style={{ color }}>{nextSkill.name}</span> 还需{' '}
              <span style={{ color: '#ffaa00' }}>{xpInfo.needed} XP</span>
              {' '}·约 <span style={{ color: '#00ff88' }}>{xpInfo.casesS}次S级</span> 或{' '}
              <span style={{ color: '#ffe600' }}>{xpInfo.casesA}次A级</span> 结案
            </div>
          )}
        </div>
      )}

      {/* Already unlocked summary */}
      {unlockedSkills.length > 0 && upcomingSkills.length === 0 && (
        <div style={{ fontSize: '0.6rem', color: '#00ff88', textAlign: 'center', padding: '6px 0' }}>
          ✦ 全部技能已解锁 · 养成完成
        </div>
      )}
    </div>
  );
}
