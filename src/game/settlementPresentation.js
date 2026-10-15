import { getLevelFromXP, SKILL_TREES } from './agentProgression.js';

// One item per agent, regardless of how many levels the confirmed settlement
// crossed. Presentation only: XP and rewards are never calculated here.
export function agentAdvancementSummary(oldProgression, newProgression) {
  if (!newProgression) return [];
  return [0, 1, 2].flatMap(agentIdx => {
    const fromLevel = getLevelFromXP(oldProgression?.[agentIdx]?.xp || 0);
    const toLevel = getLevelFromXP(newProgression[agentIdx]?.xp || 0);
    if (toLevel <= fromLevel) return [];
    return [{ agentIdx, fromLevel, toLevel, newSkills: (SKILL_TREES[agentIdx] || [])
      .filter(skill => skill.unlock_level > fromLevel && skill.unlock_level <= toLevel) }];
  });
}
