import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCaseXP,
  getRejectedReportPenalty,
  isPassingCaseScore,
  normalizeJudgeResult,
} from '../src/game/caseEvaluation.js';

const caseData = { clue_dictionary: Array.from({ length: 9 }, (_, index) => ({ clue_id: `c_${index}` })) };

test('C is the accessible closure threshold while D remains a failed conclusion', () => {
  assert.equal(isPassingCaseScore('C'), true);
  assert.equal(isPassingCaseScore('D'), false);
  assert.deepEqual(normalizeJudgeResult({ score: 'c', is_passed: false, critique: 'Incomplete.' }), {
    score: 'C', is_passed: true, critique: 'Incomplete.',
  });
  assert.equal(normalizeJudgeResult({ score: 'D', is_passed: true }).is_passed, false);
});

test('a rejected report retains bounded process XP instead of zeroing the run', () => {
  const result = calculateCaseXP({ score: 'D', is_passed: false }, {
    unlocked_clues: ['c_0', 'c_1', 'c_2'],
    action_points_left: 14,
    confusion_score: 10,
  }, caseData, true);

  assert.equal(result.passed, false);
  assert.ok(result.total >= 50 && result.total <= 100, result.total);
  assert.ok(result.clueBonus > 0);
  assert.ok(result.apBonus > 0);
  assert.ok(result.confusionBonus > 0);
  assert.equal(result.outcomeAdjustment, -25);
});

test('process rewards cannot outperform solving the same investigation', () => {
  const state = {
    unlocked_clues: caseData.clue_dictionary.map(clue => clue.clue_id),
    action_points_left: 14,
    confusion_score: 10,
  };
  const failed = calculateCaseXP({ score: 'D' }, state, caseData, true);
  const passed = calculateCaseXP({ score: 'C' }, state, caseData, true);
  assert.ok(failed.total > 0);
  assert.ok(failed.total < passed.total);
  assert.equal(calculateCaseXP({ score: 'D' }, state, caseData, false).total, 0);
});

test('rejected report penalties are gentler and bounded', () => {
  assert.deepEqual(getRejectedReportPenalty({ action_points_left: 14 }), {
    apLoss: 3, reputationLoss: 8, confusionIncrease: 4,
  });
  assert.equal(getRejectedReportPenalty({ action_points_left: 2 }).apLoss, 1);
  assert.equal(getRejectedReportPenalty({ action_points_left: 0 }).apLoss, 0);
});
