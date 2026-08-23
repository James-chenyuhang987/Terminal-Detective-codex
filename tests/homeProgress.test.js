import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACHIEVEMENTS, ENERGY_MAX, achievementProgress, applyCheckin, claimAchievement, claimTask,
  claimWeeklyReward, consumeEnergyCell, dailyIntelCaseId, evaluateAchievements,
  localDateKey, normalizeProfile, purchaseItem, regenEnergy, settleCase, startCase,
  toggleEquipItem, unlockTech, weeklyChallenge,
} from '../src/game/homeProgress.js';

const NOW = new Date('2026-08-23T12:00:00+08:00');

function profile(patch = {}) {
  return normalizeProfile({
    detective_name: '玄影', energy_updated_at: NOW.toISOString(), journey_started_on: '2026-08-17',
    ...patch,
  }, NOW);
}

test('legacy profiles migrate without losing existing progress', () => {
  const migrated = profile({ gold: 321, achievements: ['legacy_badge'], solved_cases: ['Lvl_01'] });
  assert.equal(migrated.gold, 321);
  assert.deepEqual(migrated.achievements, ['legacy_badge']);
  assert.deepEqual(migrated.solved_cases, ['Lvl_01']);
  assert.equal(migrated.unsolved_count, 2);
  assert.deepEqual(migrated.equipped_items, []);
  assert.equal(migrated.inventory.ap_booster, 0);
});

test('unknown legacy cases never inflate the three-case archive or evidence achievements', () => {
  const legacy = evaluateAchievements(profile({
    solved_cases: ['Legacy_01', 'Legacy_02', 'Legacy_03'],
    case_records: ['Legacy_01', 'Legacy_02', 'Legacy_03'].map(caseId => ({
      case_id: caseId, best_score: 'S',
      discovered_clues: Array.from({ length: 12 }, (_, index) => `${caseId}-${index}`),
    })),
  }));
  assert.equal(legacy.unsolved_count, 3);
  assert.equal(legacy.achievements.includes('three_archived'), false);
  assert.equal(legacy.achievements.includes('all_s'), false);
  assert.equal(legacy.achievements.includes('ten_clues'), false);
});

test('energy regeneration preserves partial intervals and stops at base cap', () => {
  const last = new Date(NOW.getTime() - 12 * 60000);
  const regenerated = regenEnergy(profile({ energy: 100, energy_updated_at: last.toISOString() }), NOW);
  assert.equal(regenerated.energy, 102);
  assert.equal(new Date(regenerated.energy_updated_at).getTime(), last.getTime() + 10 * 60000);

  const capped = regenEnergy(profile({ energy: 119, energy_updated_at: last.toISOString() }), NOW);
  assert.equal(capped.energy, ENERGY_MAX);
});

test('check-in follows the seven-day table and cannot be claimed twice', () => {
  const first = applyCheckin(profile({ last_checkin: null, checkin_streak: 0 }), NOW);
  assert.equal(first.day, 1);
  assert.equal(first.profile.gold, 500);
  const duplicate = applyCheckin(first.profile, NOW);
  assert.equal(duplicate.error, 'already_claimed');

  const secondDate = new Date('2026-08-24T12:00:00+08:00');
  const second = applyCheckin(first.profile, secondDate);
  assert.equal(second.day, 2);
  assert.equal(second.profile.diamonds, 10);
  assert.equal(second.profile.checkin_streak, 2);
});

test('warehouse purchase, use and loadout rules are deterministic', () => {
  let current = profile({ gold: 3000, diamonds: 100, energy: 100 });
  current = purchaseItem(current, 'energy_cell').profile;
  assert.equal(current.gold, 2600);
  assert.equal(current.inventory.energy_cell, 1);
  current = consumeEnergyCell(current).profile;
  assert.equal(current.energy, 130);
  assert.equal(current.inventory.energy_cell, 0);

  current = purchaseItem(current, 'ap_booster').profile;
  current = purchaseItem(current, 'firewall_shield').profile;
  current = purchaseItem(current, 'clue_scanner').profile;
  current = toggleEquipItem(current, 'ap_booster').profile;
  current = toggleEquipItem(current, 'firewall_shield').profile;
  assert.equal(toggleEquipItem(current, 'clue_scanner').error, 'equip_limit');
});

test('technology enforces prerequisites and composes with mission items', () => {
  let current = profile({ diamonds: 500, gold: 1000, inventory: { ap_booster: 1 }, equipped_items: ['ap_booster'] });
  assert.equal(unlockTech(current, 'network_2').error, 'prerequisite');
  current = unlockTech(current, 'network_1').profile;
  current = unlockTech(current, 'network_2').profile;
  current = unlockTech(current, 'network_3').profile;

  const started = startCase(current, { case_id: 'Lvl_03', difficulty: 'NORMAL' }, NOW);
  assert.equal(started.profile.energy, 110);
  assert.equal(started.effects.initial_ap_bonus, 5);
  assert.equal(started.effects.skill_effects.ap_cost_discount, 0.1);
  assert.equal(started.profile.inventory.ap_booster, 0);
  assert.deepEqual(started.profile.equipped_items, []);
});

test('case settlement rewards once and merges records without duplicates', () => {
  const current = profile();
  const caseId = 'Lvl_01';
  const summary = {
    run_id: 'run-1', case_id: caseId, difficulty: 'OMEGA', score: 'S', is_passed: true,
    clues: ['c_01', 'c_01', 'c_secret_99'], valid_links: [['c_01', 'c_secret_99']],
    valid_link_count: 1, invalid_link_count: 0, turns: 7, ap_left: 11, confusion: 15,
    bsod_count: 0, clue_ratio: 0.8, xp_gain: 400, best_agent_level: 2, all_agents_min_level: 1,
  };
  const result = settleCase(current, summary, NOW);
  const dailyBonus = dailyIntelCaseId(NOW) === caseId ? 250 : 0;
  assert.equal(result.profile.gold, 1000 + dailyBonus);
  assert.equal(result.profile.diamonds, 50);
  assert.equal(result.profile.case_records[0].best_score, 'S');
  assert.deepEqual(result.profile.case_records[0].discovered_clues.sort(), ['c_01', 'c_secret_99']);
  assert.ok(result.profile.achievements.includes('first_solve'));
  assert.ok(result.profile.achievements.includes('zero_invalid'));
  assert.ok(result.profile.achievements.includes('ap_ten'));

  const duplicate = settleCase(result.profile, summary, NOW);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.profile.gold, result.profile.gold);
});

test('achievement and task rewards require eligibility and are idempotent', () => {
  assert.equal(ACHIEVEMENTS.length, 24);
  let current = evaluateAchievements(profile({ activity_stats: { cases_started: 1 } }));
  assert.ok(current.achievements.includes('first_deploy'));
  current = claimAchievement(current, 'first_deploy').profile;
  assert.equal(current.diamonds, 10);
  assert.equal(claimAchievement(current, 'first_deploy').error, 'already_claimed');

  const tutorial = claimTask(current, 'tutorial', 'register', NOW);
  assert.equal(tutorial.profile.gold, 200);
  assert.equal(claimTask(tutorial.profile, 'tutorial', 'register', NOW).error, 'already_claimed');
});

test('weekly reward requires all three objectives for the current cycle', () => {
  const challenge = weeklyChallenge(NOW);
  const current = profile({ weekly_records: [{
    cycle_id: challenge.cycleId, case_id: challenge.caseId,
    passed: true, clue_target: true, speed_target: true,
  }] });
  const result = claimWeeklyReward(current, NOW);
  assert.equal(result.profile.gold, 1000);
  assert.equal(result.profile.diamonds, 40);
  assert.equal(claimWeeklyReward(result.profile, NOW).error, 'already_claimed');
});

test('all 24 achievements expose bounded progress and can be unlocked', () => {
  const clueSets = [
    ['c_01', 'c_02', 'c_03', 'c_04', 'c_05', 'c_06', 'c_07', 'c_08', 'c_secret_99'],
    ['d_01', 'd_02', 'd_03', 'd_04', 'd_05', 'd_06', 'd_07', 'd_08', 'd_secret_99'],
    ['e_01', 'e_02', 'e_03', 'e_04', 'e_05', 'e_06', 'e_07', 'e_08', 'e_secret_99'],
  ];
  const complete = profile({
    solved_cases: ['Lvl_01', 'Lvl_02', 'Lvl_03'],
    case_records: clueSets.map((clues, index) => ({
      case_id: `Lvl_0${index + 1}`, best_score: 'S', discovered_clues: clues,
      valid_links: [`${clues[0]}|${clues[1]}`], attempts: 1, solves: 1,
    })),
    tech_unlocks: ['forensics_1', 'forensics_2', 'forensics_3', 'network_1', 'network_2', 'network_3', 'psychology_1', 'psychology_2', 'psychology_3'],
    checkin_streak: 7,
    reward_claims: [
      'tutorial:register', 'tutorial:checkin', 'tutorial:team', 'tutorial:case', 'tutorial:clues', 'tutorial:report',
      'seven:day1', 'seven:day2', 'seven:day3', 'seven:day4', 'seven:day5', 'seven:day6', 'seven:day7',
    ],
    activity_stats: {
      cases_started: 3, cases_solved: 3, valid_links: 5, invalid_links: 0,
      best_agent_level: 5, all_agents_min_level: 5,
    },
  });
  const evaluated = evaluateAchievements(complete, {
    is_passed: true, invalid_link_count: 0, ap_left: 10, turns: 8, confusion: 20, bsod_count: 0,
  });
  assert.equal(evaluated.achievements.length, 24);
  ACHIEVEMENTS.forEach(item => {
    const progress = achievementProgress(evaluated, item.id);
    assert.ok(progress.current >= 0 && progress.current <= progress.target, item.id);
  });
});

test('case records retain best rank and merge unique evidence across runs', () => {
  const first = settleCase(profile(), {
    run_id: 'merge-1', case_id: 'Lvl_02', difficulty: 'HARD', score: 'S', is_passed: true,
    clues: ['d_01'], valid_links: [['d_01', 'd_02']], valid_link_count: 1,
    invalid_link_count: 0, turns: 10, confusion: 18, xp_gain: 100,
  }, NOW);
  const second = settleCase(first.profile, {
    run_id: 'merge-2', case_id: 'Lvl_02', difficulty: 'HARD', score: 'B', is_passed: true,
    clues: ['d_02'], valid_links: [['d_02', 'd_03']], valid_link_count: 1,
    invalid_link_count: 1, turns: 7, confusion: 30, xp_gain: 100,
  }, NOW);
  const record = second.profile.case_records.find(item => item.case_id === 'Lvl_02');
  assert.equal(record.best_score, 'S');
  assert.equal(record.best_turns, 7);
  assert.equal(record.lowest_confusion, 18);
  assert.deepEqual(record.discovered_clues.sort(), ['d_01', 'd_02']);
  assert.equal(record.valid_links.length, 2);
  assert.equal(second.firstClear, false);
});

test('local calendar keys and insufficient-balance failures stay deterministic', () => {
  assert.equal(localDateKey(NOW), '2026-08-23');
  const poor = profile({ gold: 399, diamonds: 34 });
  assert.equal(purchaseItem(poor, 'energy_cell').error, 'insufficient_funds');
  assert.equal(purchaseItem(poor, 'firewall_shield').error, 'insufficient_funds');
  assert.equal(claimTask(poor, 'seven', 'day7', NOW).error, 'incomplete');
});
