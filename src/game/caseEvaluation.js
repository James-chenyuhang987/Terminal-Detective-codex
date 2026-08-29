const SCORE_ORDER = Object.freeze({ D: 0, C: 1, B: 2, A: 3, S: 4 });

export const PASSING_CASE_SCORES = Object.freeze(['C', 'B', 'A', 'S']);

const SCORE_XP = Object.freeze({ S: 300, A: 220, B: 160, C: 110, D: 35 });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function normalizeCaseScore(value) {
  const score = String(value || '').trim().toUpperCase();
  return Object.hasOwn(SCORE_ORDER, score) ? score : 'D';
}

export function isPassingCaseScore(value) {
  return PASSING_CASE_SCORES.includes(normalizeCaseScore(value));
}

/**
 * The report grade is authoritative for closure. Efficiency can improve XP,
 * but it must never turn a wrong conclusion into a solved case.
 */
export function normalizeJudgeResult(result, fallbackCritique = '') {
  const score = normalizeCaseScore(result?.score);
  return {
    ...(result || {}),
    score,
    is_passed: isPassingCaseScore(score),
    critique: String(result?.critique || fallbackCritique || ''),
  };
}

/**
 * Process XP remains available after a rejected report, at deliberately lower
 * rates. This rewards investigation without making repeated failed runs more
 * efficient than actually solving a case.
 */
export function calculateCaseXP(judgeResult, gameState = {}, caseData = {}, eligible = true) {
  if (!eligible || !judgeResult?.score) {
    return {
      base: 0, clueBonus: 0, apBonus: 0, confusionBonus: 0,
      noBSoD: 0, outcomeAdjustment: 0, total: 0, passed: false,
    };
  }

  const score = normalizeCaseScore(judgeResult.score);
  const passed = isPassingCaseScore(score);
  const clueIds = [...new Set((gameState.unlocked_clues || []).filter(Boolean))];
  const clueTotal = Math.max(1, caseData?.clue_dictionary?.length || 0);
  const clueRatio = clamp(clueIds.length / clueTotal, 0, 1);
  const progressWeight = clueIds.length > 0 ? 0.25 + clueRatio * 0.75 : 0;
  const apLeft = clamp(gameState.action_points_left, 0, 99);
  const confusion = clamp(gameState.confusion_score, 0, 100);
  const processRate = passed ? 1 : 0.5;

  const base = SCORE_XP[score];
  const clueBonus = Math.round(clueRatio * 90 * processRate);
  const apBonus = Math.round(Math.min(apLeft * 4, 60) * progressWeight * processRate);
  const confusionBonus = Math.round((1 - confusion / 100) * 45 * progressWeight * processRate);
  const noBSoD = clueIds.length > 0 && confusion < 100 ? (passed ? 30 : 15) : 0;
  const outcomeAdjustment = passed ? 0 : -25;
  const total = Math.max(0, base + clueBonus + apBonus + confusionBonus + noBSoD + outcomeAdjustment);

  return {
    base, clueBonus, apBonus, confusionBonus, noBSoD,
    outcomeAdjustment, total, passed,
  };
}

export function getRejectedReportPenalty(gameState = {}) {
  const apLeft = clamp(gameState.action_points_left, 0, 99);
  return {
    apLoss: apLeft > 0 ? Math.min(3, Math.max(1, Math.ceil(apLeft * 0.15))) : 0,
    reputationLoss: 8,
    confusionIncrease: 4,
  };
}
