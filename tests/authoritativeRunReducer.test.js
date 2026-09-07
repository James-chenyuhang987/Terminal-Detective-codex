import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, publicRun, applyRunCommand, deriveRunSummary } from '../server/gameAuthority/runAuthority.js';
import { settleRunAction } from '../server/gameAuthority/runSettlement.js';
import { createRunCrisis, nextRunCrisisTurn } from '../server/gameAuthority/runCrisis.js';
import { Case_Data_Lvl_01, ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig, PRIORITY_ACTIONS } from '../src/game/teamConfig.js';
import { calculateCaseXP, getRejectedReportPenalty } from '../src/game/caseEvaluation.js';
import { applySettlementResult } from '../src/game/gameState.js';
import { applyStaminaToTeam, recoverAgentStaminaTurn } from '../src/game/agentStamina.js';
import { buildExecutingStrategy } from '../src/game/commandSystem.js';
import { getAvailableClueIds } from '../src/game/caseRuntime.js';

const NOW = new Date('2026-09-07T00:00:00.000Z');
function fresh(id = 'authority-test-run-01', options = {}) {
  return createRun({ id, caseData: Case_Data_Lvl_01, teamConfig: buildTeamConfig(), now: NOW, ...options });
}
function act(run, command) { return applyRunCommand(run, command, NOW); }
function reject(run, command, code) {
  const before = JSON.stringify(run);
  assert.throws(() => act(run, command), error => error.status === 400 && (!code || error.code === code));
  assert.equal(JSON.stringify(run), before, 'rejected commands must not modify the stored run');
}
function offered(run) { return act(run, { type: 'decision_options' }).run; }
function firstCard(run, agentId = 'NEXUS-01') { return run.decision_options.packs[agentId].cards[0]; }
function own(run, clues = ['c_01', 'c_02', 'c_03']) {
  return { ...run, state: { ...run.state, unlocked_clues: [...clues] } };
}
function reportCommand(evidence_ids = ['c_01', 'c_02', 'c_03']) {
  return { type: 'report', conclusion_id: 'conclusion:mei', method_id: 'method:emp',
    motive_id: 'motive:revenge', timeline_id: 'timeline:2317', evidence_ids };
}
function resolvePending(run) {
  if (!run.pending_crisis) return run;
  const option_id = { tracker: 'hide', evidence: 'defer', npc_recant: 'ignore' }[run.pending_crisis.type];
  return act(run, { type: 'crisis', option_id }).run;
}

test('createRun is deterministic, isolated, JSON-persistent, and derives only trusted start effects', () => {
  const teamConfig = buildTeamConfig();
  const effects = { initial_ap_bonus: 4, ignore_first_trap: true };
  const first = fresh('immutable-start', { teamConfig, effects });
  assert.deepEqual(first, fresh('immutable-start', { teamConfig, effects }));
  assert.equal(first.revision, 0);
  assert.equal(first.state.action_points_left, 24);
  assert.equal(first.state.trap_shield_charges, 1);
  assert.equal(first.state.run_id, first.id);
  assert.equal(first.state.agent_stamina['NEXUS-01'], 50);
  teamConfig.team[0].logic_power = 999;
  effects.initial_ap_bonus = 999;
  assert.notEqual(first.team_config.team[0].logic_power, 999);
  assert.equal(first.effects.initial_ap_bonus, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test('paid mission bonuses merge with team skills, support AP and one opening clue exactly once', () => {
  const teamConfig = buildTeamConfig();
  teamConfig.skill_effects = { bonus_clue_chance: 0.2, auto_unlock_first: true, bsod_immunity: true };
  teamConfig.support_effects = { initial_ap_bonus: 2 };
  const effects = { initial_ap_bonus: 3, ignore_first_trap: true,
    skill_effects: { bonus_clue_chance: 0.1, auto_unlock_first: false, bsod_immunity: false } };
  const run = fresh('merged-passives', { teamConfig, effects });
  assert.equal(run.state.action_points_left, 25);
  assert.equal(run.state.trap_shield_charges, 1);
  assert.ok(Math.abs(run.team_config.skill_effects.bonus_clue_chance - 0.3) < 1e-10);
  assert.equal(run.team_config.skill_effects.bsod_immunity, true);
  const firstClue = Case_Data_Lvl_01.zone_clue_map[run.state.current_zone][0];
  assert.deepEqual(run.state.unlocked_clues, [firstClue]);
  assert.deepEqual(run, JSON.parse(JSON.stringify(run)));
  assert.deepEqual(offered(offered(run)).state.unlocked_clues, [firstClue]);
  assert.equal(teamConfig.skill_effects.bonus_clue_chance, 0.2);
  const scanner = fresh('mission-scanner', { effects: { skill_effects: { auto_unlock_first: true, bsod_immunity: true } } });
  assert.deepEqual(scanner.state.unlocked_clues, [firstClue]);
  scanner.state.is_crashed = true;
  assert.equal(act(scanner, { type: 'recover' }).run.state.action_points_left, 20);
});

test('public projection reveals only acquired clue descriptions and no protected dictionaries or checkpoints', () => {
  const run = fresh();
  run.state.checkpoint_stack = [{ clue_dictionary: 'SECRET', unlocked_clues: ['c_secret_99'] }];
  run.case_data.server_only_secret = 'DO NOT EXPOSE';
  const empty = publicRun(run);
  assert.deepEqual(empty.state.revealed_clues, []);
  assert.equal(empty.state.checkpoint_count, 1);
  const json = JSON.stringify(empty);
  for (const secret of ['DO NOT EXPOSE', 'c_secret_99', 'clue_dictionary', 'conflict_dictionary', 'checkpoint_stack', 'actualAlignment']) {
    assert.equal(json.includes(secret), false, secret);
  }
  const revealed = publicRun(own(run, ['c_01']));
  assert.deepEqual(revealed.state.revealed_clues.map(clue => clue.clue_id), ['c_01']);
  assert.equal(revealed.state.revealed_clues[0].description, Case_Data_Lvl_01.clue_dictionary[0].description);
  assert.equal(revealed.state.revealed_clues[0].en.description, Case_Data_Lvl_01.en.clue_dictionary[0].description);
  assert.deepEqual(revealed.agent_strategy, run.team_config);
  revealed.agent_strategy.team[0].logic_power = 999;
  assert.notEqual(run.team_config.team[0].logic_power, 999);
  revealed.state.command_state.points = 999;
  assert.equal(run.state.command_state.points, 3);
});

test('untrusted snapshots, fabricated summaries, arbitrary actions and malformed intents fail closed', () => {
  for (const command of [
    null, [], {}, { type: '__proto__' }, { type: ['rest'] }, { type: 'patch', state: {} },
    { type: 'rest', state: { action_points_left: 999 } },
    { type: 'abandon', xp_gain: 999 }, { type: 'rest', lang: 'xx' },
    { type: 'round', option_id: 'anything', action_tag: 'search_area' },
    { type: 'round', option_id: 'anything', executor_agent_id: 'invented' },
    { type: 'round', option_id: 'anything', command_ids: ['emergency_stabilize'] },
    { type: 'round', option_id: 'anything', command_ids: ['joint_action', 'joint_action'] },
    { type: 'round', option_id: 'anything', assist_agent_id: null },
    { type: 'question', npc_id: 'npc_01', question_id: 'q', emotionLevel: 'broken' },
    { type: 'link', clue_ids: ['c_01', 'c_01'] },
    { type: 'report', summary: { score: 'S' } },
    { ...reportCommand(), evidence_ids: ['c_01', 'c_01', 'c_02'] },
    { ...reportCommand(), evidence_ids: ['c_01', 'c_02', 'c_03', 'c_04', 'c_05'] },
  ]) reject(fresh(), command);
});

test('options are server-issued, reconstructible, deterministic and scoped to current canonical state', () => {
  const run = fresh();
  reject(run, { type: 'round', option_id: 'decision:Lvl_01:1:NEXUS-01:analyze_forensics' }, 'STALE_OPTIONS');
  const ready = offered(run);
  assert.deepEqual(ready.decision_options, offered(run).decision_options);
  assert.equal(ready.revision, 1);
  const card = firstCard(ready);
  const first = act(ready, { type: 'round', option_id: card.optionId });
  assert.deepEqual(first, act(JSON.parse(JSON.stringify(ready)), { type: 'round', option_id: card.optionId }));
  assert.equal(first.result.settlement.action_narration, first.result.narration);
  assert.equal(first.result.confusion_delta, first.run.state.confusion_score - ready.state.confusion_score);
  assert.equal(first.run.state.turn_count, 1);
  assert.equal(first.run.state.agent_stamina['NEXUS-01'], 44);
  assert.equal(first.run.state.agent_stamina['AURORA-09'], 54);
  assert.equal(first.run.state.command_state.active_agent_id, 'NEXUS-01');
  assert.equal(ready.state.turn_count, 0);
  reject(first.run, { type: 'round', option_id: card.optionId }, 'STALE_OPTIONS');
  const rested = act(ready, { type: 'rest' }).run;
  reject(rested, { type: 'round', option_id: card.optionId }, 'STALE_OPTIONS');
  assert.equal(JSON.stringify(ready.decision_options).includes('actualAlignment'), false);
});

test('priority accepts only a complete canonical action permutation and projects the derived strategy', () => {
  const original = offered(fresh());
  const priority_list = PRIORITY_ACTIONS.map(action => action.id).reverse();
  const changed = act(original, { type: 'priority', priority_list });
  assert.deepEqual(changed.result.priority_list, priority_list);
  assert.deepEqual(changed.run.team_config.priority_list, priority_list);
  assert.deepEqual(publicRun(changed.run).agent_strategy.priority_list, priority_list);
  assert.equal(changed.run.decision_options, null);
  assert.equal(changed.run.state.action_points_left, original.state.action_points_left);
  assert.equal(changed.run.revision, original.revision + 1);
  for (const invalid of [[], priority_list.slice(1), [...priority_list, priority_list[0]],
    [original.state.current_zone, ...priority_list.slice(1)]]) {
    reject(original, { type: 'priority', priority_list: invalid }, 'INVALID_PRIORITY');
  }
});

test('canonical settlement retains AP credits, trap shield, confusion, bans and stamina', () => {
  const run = fresh();
  run.state.ap_discount_credit = 0.2;
  run.state.command_ap_credit = 0.3;
  const ids = run.team_config.team.map(agent => agent.agent_id);
  const team = applyStaminaToTeam(run.team_config.team, recoverAgentStaminaTurn(run.state.agent_stamina, ids));
  const strategy = buildExecutingStrategy({ ...run.team_config, team, synergy_skills: [], skill_effects: {} },
    'analyze_forensics', 'AURORA-09');
  const state = run.state;
  const result = settleRunAction(state, run.case_data, strategy, { actionTag: 'analyze_forensics', risk_level: 'low' }, 'en');
  const expected = applySettlementResult(state, result.settlement, strategy, run.case_data);
  assert.deepEqual(result.newState, expected.newState);
  assert.deepEqual(result.newClues, expected.newClues);
});

test('server round narratives localize zone and clue names without changing gameplay outcomes', () => {
  const outcomes = new Set();
  for (let i = 0; i < 20; i += 1) {
    const run = fresh(`localized-round-${i}`);
    const strategy = buildExecutingStrategy(run.team_config, 'analyze_forensics', 'AURORA-09');
    const card = { actionTag: 'analyze_forensics', risk_level: 'low' };
    const english = settleRunAction(run.state, run.case_data, strategy, card, 'en');
    const chinese = settleRunAction(run.state, run.case_data, strategy, card, 'zh');
    assert.doesNotMatch(english.settlement.action_narration, /\p{Script=Han}/u);
    assert.match(chinese.settlement.action_narration, /\p{Script=Han}/u);
    for (const field of ['outcome', 'new_clues_unlocked', 'confusion_increase', 'time_cost', 'health_change', 'is_trap', 'next_zone']) {
      assert.deepEqual(english.settlement[field], chinese.settlement[field], field);
    }
    outcomes.add(english.settlement.outcome);
  }
  assert.ok(outcomes.has('clue'), 'localized clue labels must be exercised');
  assert.ok(outcomes.has('progress'), 'localized zone labels must be exercised');
});

test('team abilities, extra evidence, crises and choices never use ambient randomness', (t) => {
  const teamConfig = buildTeamConfig();
  teamConfig.skill_effects = { bonus_clue_chance: 1, passive_scan_chance: 1 };
  teamConfig.synergy_skills = ['digital_forensics'];
  t.mock.method(Math, 'random', () => { throw new Error('ambient randomness is forbidden'); });
  const run = fresh('seeded-bonuses', { teamConfig });
  const ready = offered(run);
  const card = firstCard(ready);
  const resolved = act(ready, { type: 'round', option_id: card.optionId });
  assert.deepEqual(resolved, act(ready, { type: 'round', option_id: card.optionId }));
  assert.ok(resolved.run.state.unlocked_clues.length > 0);
  run.state.turn_count = 5;
  assert.deepEqual(createRunCrisis(run, 'en'), createRunCrisis(run, 'en'));
  assert.equal(nextRunCrisisTurn(run), nextRunCrisisTurn(run));
  run.pending_crisis = { type: 'tracker', payload: {}, choices: [{ id: 'confront', ap_cost: 0 }] };
  assert.deepEqual(act(run, { type: 'crisis', option_id: 'confront' }), act(run, { type: 'crisis', option_id: 'confront' }));
});

test('joint action requires an owned distinct eligible assistant and atomically charges real command points', () => {
  const ready = offered(fresh());
  const option_id = firstCard(ready).optionId;
  for (const command of [
    { assist_agent_id: 'NEXUS-01', command_ids: ['joint_action'] },
    { assist_agent_id: 'UNOWNED', command_ids: ['joint_action'] },
    { assist_agent_id: 'AURORA-09' }, { command_ids: ['joint_action'] },
  ]) reject(ready, { type: 'round', option_id, ...command }, 'INVALID_ASSISTANT');
  const command = { type: 'round', option_id, assist_agent_id: 'AURORA-09', command_ids: ['joint_action', 'tactical_preview'] };
  const result = act(ready, command);
  assert.equal(result.run.state.command_state.points, 1);
  assert.equal(result.run.state.command_state.spent_points, 2);
  assert.equal(result.run.state.agent_stamina['AURORA-09'], 44);
  assert.equal(result.run.state.action_points_left, 20);
  const poor = JSON.parse(JSON.stringify(ready));
  poor.state.command_state.points = 0;
  reject(poor, command, 'INSUFFICIENT_COMMAND_POINTS');
});

test('rest recovers stamina without AP gain, advances evidence deadlines, and cannot bypass crises', () => {
  let run = own(fresh(), ['c_01']);
  run.state.evidence_crisis = { clue_id: 'c_01', keyword: 'Receipt', deadline: 0 };
  run.linked_pairs = [{ a: 'c_01', b: 'c_02', valid: true, key: 'c_01:c_02' }];
  const rested = act(run, { type: 'rest' });
  assert.equal(rested.run.state.turn_count, 1);
  assert.equal(rested.run.state.action_points_left, 20);
  assert.equal(rested.run.state.agent_stamina['NEXUS-01'], 54);
  assert.equal(rested.result.evidence_outcome, 'destroyed');
  assert.deepEqual(rested.run.state.destroyed_clue_ids, ['c_01']);
  assert.equal(rested.run.linked_pairs.length, 0);
  run = fresh();
  const deadline = run.next_crisis_turn;
  while (run.state.turn_count < deadline) run = act(run, { type: 'rest' }).run;
  assert.ok(run.pending_crisis);
  for (const command of [{ type: 'rest' }, { type: 'report_options' }, { type: 'decision_options' }, reportCommand(),
    { type: 'interrogation_options', npc_id: 'npc_01' }, { type: 'command', command_id: 'emergency_stabilize' }]) {
    reject(run, command, 'CRISIS_PENDING');
  }
  reject(run, { type: 'recover' }, 'RUN_NOT_CRASHED');
  assert.equal(resolvePending(run).pending_crisis, null);
});

test('hidden clue timing is authoritative and destroyed evidence never returns through aging', () => {
  let run = fresh();
  for (let turn = 1; turn <= 8; turn++) {
    run = resolvePending(run);
    run = act(run, { type: 'rest' }).run;
    assert.equal(run.state.unlocked_clues.includes('c_secret_99'), turn >= 8);
  }
  const destroyed = fresh();
  destroyed.state.destroyed_clue_ids = ['c_secret_99'];
  destroyed.state.turn_count = 7;
  destroyed.next_crisis_turn = 99;
  assert.equal(act(destroyed, { type: 'rest' }).run.state.unlocked_clues.includes('c_secret_99'), false);
});

test('crisis choices validate costs and IDs and apply command contingencies exactly once', () => {
  const run = own(fresh(), ['c_01']);
  run.pending_crisis = { type: 'evidence', payload: { clue_id: 'c_01', keyword: 'Receipt' },
    choices: [{ id: 'secure_now', ap_cost: 3 }, { id: 'defer', ap_cost: 0 }] };
  run.state.action_points_left = 2;
  reject(run, { type: 'crisis', option_id: 'secure_now' }, 'INSUFFICIENT_AP');
  reject(run, { type: 'crisis', option_id: 'invented' }, 'INVALID_CHOICE');
  run.state.command_state.contingency_id = 'evidence_lockdown';
  const deferred = act(run, { type: 'crisis', option_id: 'defer' }).run;
  assert.equal(deferred.state.evidence_crisis.deadline, 3);
  assert.equal(deferred.state.command_state.points, 2);
  assert.equal(deferred.state.command_state.contingency_status, 'used');
  reject(deferred, { type: 'crisis', option_id: 'defer' }, 'NO_PENDING_CRISIS');
});

test('interrogation requires issued question IDs, canonical NPC, evidence, executor and stamina', () => {
  const run = fresh();
  reject(run, { type: 'interrogation_options', npc_id: 'fake_npc' }, 'UNKNOWN_NPC');
  reject(run, { type: 'question', npc_id: 'npc_01', question_id: 'question:Lvl_01:npc_01:timeline' }, 'STALE_OPTIONS');
  const offeredRun = act(run, { type: 'interrogation_options', npc_id: 'npc_01' }).run;
  const question_id = offeredRun.interrogation_options.npc_01.packs['NEXUS-01'].questions[0].questionId;
  const command = { type: 'question', npc_id: 'npc_01', question_id, executor_agent_id: 'NEXUS-01' };
  reject(offeredRun, { ...command, executor_agent_id: 'UNOWNED' }, 'STALE_OPTIONS');
  reject(offeredRun, { ...command, question_id: 'question:Lvl_01:npc_01:evidence:c_secret_99' }, 'STALE_OPTIONS');
  const exhausted = JSON.parse(JSON.stringify(offeredRun));
  exhausted.state.agent_stamina['NEXUS-01'] = 9;
  reject(exhausted, command, 'STALE_OPTIONS');
  const result = act(offeredRun, command);
  assert.equal(result.run.state.agent_stamina['NEXUS-01'], 40);
  assert.equal(result.run.state.turn_count, 0);
  assert.equal(result.run.state.action_points_left, 20);
  assert.deepEqual(result.run.asked_question_ids.npc_01, [question_id]);
  assert.equal(result.run.npc_emotions.npc_01.history_count, 1);
  assert.ok(result.result.packs);
});

test('valid links require both preserved clues and cannot farm bonus evidence or command milestones', () => {
  const run = fresh();
  reject(run, { type: 'link', clue_ids: ['c_01', 'c_02'] }, 'INVALID_CLUES');
  const known = own(run, ['c_01', 'c_02']);
  const result = act(known, { type: 'link', clue_ids: ['c_01', 'c_02'] });
  assert.equal(result.result.is_valid, true);
  assert.equal(result.run.truth_fragments, 1);
  assert.equal(result.run.state.command_state.points, 4);
  assert.equal(result.run.attempted_link_keys.length, 1);
  for (const clue_ids of [['c_01', 'c_02'], ['c_02', 'c_01']]) {
    reject(result.run, { type: 'link', clue_ids }, 'LINK_ALREADY_ATTEMPTED');
  }
  const second = act(own(result.run, ['c_01', 'c_02', 'c_03', 'c_05']), { type: 'link', clue_ids: ['c_03', 'c_05'] });
  if (second.result.is_valid) assert.equal(second.run.state.command_state.points, 4);
});

test('invalid links impose deterministic counterstrike and retain lifetime failure accounting', () => {
  const run = own(fresh('invalid-link-counter'), ['c_01', 'c_08']);
  const command = { type: 'link', clue_ids: ['c_01', 'c_08'] };
  const first = act(run, command);
  assert.equal(first.result.is_valid, false);
  assert.equal(first.run.state.confusion_score, 8);
  assert.deepEqual(first, act(run, command));
  assert.equal(first.run.attempted_link_keys.length, 1);
  const abandoned = act(first.run, { type: 'abandon' }).run;
  assert.equal(deriveRunSummary(abandoned).invalid_link_count, 1);
});

test('report grading uses owned evidence, rejects extras and penalizes incorrect reports before closure', () => {
  reject(fresh(), reportCommand(), 'INVALID_EVIDENCE');
  const run = own(fresh());
  reject(run, { ...reportCommand(), method_id: 'method:fake' }, 'INVALID_REPORT_OPTION');
  reject(run, { ...reportCommand(), score: 'S' }, 'INVALID_COMMAND');
  const incorrect = { ...reportCommand(), conclusion_id: 'conclusion:accident' };
  const failed = act(run, incorrect);
  assert.equal(failed.run.status, 'active');
  assert.equal(failed.run.judge_result.score, 'D');
  assert.equal(failed.run.report_attempts, 1);
  assert.deepEqual(failed.result.penalty, getRejectedReportPenalty(run.state));
  assert.equal(failed.run.state.action_points_left, 17);
  assert.equal(failed.run.state.reputation, 92);
  assert.equal(failed.run.state.confusion_score, 4);
  assert.throws(() => deriveRunSummary(failed.run), error => error.code === 'RUN_NOT_COMPLETE');
  const corrected = act(failed.run, reportCommand()).run;
  assert.equal(corrected.status, 'completed');
  assert.equal(corrected.judge_result.score, 'S');
  assert.equal(corrected.state.action_points_left, 17);
  assert.equal(corrected.report_attempts, 2);
  reject(corrected, reportCommand(), 'RUN_NOT_ACTIVE');
});

test('completion summaries derive XP and every reward field from persisted canonical state', () => {
  assert.throws(() => deriveRunSummary(fresh()), error => error.code === 'RUN_NOT_COMPLETE');
  const run = act(own(fresh()), reportCommand()).run;
  const summary = deriveRunSummary(JSON.parse(JSON.stringify(run)));
  const xp = calculateCaseXP(run.judge_result, run.state, run.case_data, true);
  assert.equal(summary.score, 'S');
  assert.equal(summary.is_failed, false);
  assert.deepEqual(summary.xp_breakdown, xp);
  assert.equal(summary.xp_gain, xp.total);
  assert.equal(summary.clue_ratio, 3 / Case_Data_Lvl_01.clue_dictionary.length);
  assert.equal(summary.all_hidden_clues, false);
  const abandoned = act(fresh(), { type: 'abandon' }).run;
  const failure = deriveRunSummary(abandoned);
  assert.equal(abandoned.status, 'abandoned');
  assert.equal(failure.score, 'D');
  assert.equal(failure.is_passed, false);
  assert.equal(failure.is_failed, true);
  assert.equal(failure.xp_gain, calculateCaseXP(abandoned.judge_result, abandoned.state, abandoned.case_data).total);
});

test('summary regrades final selections rather than trusting a cached rank or pass flag', () => {
  const completed = act(own(fresh()), reportCommand()).run;
  completed.judge_result = { score: 'D', is_passed: false };
  assert.equal(deriveRunSummary(completed).score, 'S');
  completed.final_report.method_id = 'method:physical_assault';
  completed.final_report.motive_id = 'motive:random';
  assert.equal(deriveRunSummary(completed).score, 'B');
  completed.final_report.evidence_ids = ['c_01'];
  assert.equal(deriveRunSummary(completed).score, 'C');
  completed.final_report.conclusion_id = 'conclusion:accident';
  assert.throws(() => deriveRunSummary(completed), error => error.code === 'RUN_NOT_COMPLETE');
  const abandoned = act(fresh(), { type: 'abandon' }).run;
  abandoned.judge_result = { score: 'S', is_passed: true };
  assert.equal(deriveRunSummary(abandoned).score, 'D');
});

test('exhausted rejected reports finish as failure; zero AP cannot buy free rounds or rest', () => {
  const run = own(fresh());
  run.state.action_points_left = 1;
  const result = act(run, { ...reportCommand(), conclusion_id: 'conclusion:accident' });
  assert.equal(result.run.status, 'failed');
  assert.equal(deriveRunSummary(result.run).is_failed, true);
  const depleted = fresh();
  depleted.state.action_points_left = 0;
  reject(depleted, { type: 'rest' }, 'INSUFFICIENT_AP');
  reject(depleted, { type: 'decision_options' }, 'INSUFFICIENT_AP');
});

test('crashes require one penalized recovery and preserve evidence, clocks, checkpoints and mandatory crises', () => {
  const run = own(fresh(), ['c_01', 'c_02']);
  run.state.confusion_score = 99;
  run.state.command_state.contingency_status = 'used';
  run.state.checkpoint_stack = [{ action_points_left: 99, unlocked_clues: ['c_secret_99'] }];
  const crashed = act(run, { ...reportCommand(['c_01']), conclusion_id: 'conclusion:accident' }).run;
  assert.equal(crashed.state.is_crashed, true);
  assert.equal(crashed.bsod_count, 1);
  reject(crashed, { type: 'rest' }, 'RUN_CRASHED');
  reject(crashed, reportCommand(), 'RUN_CRASHED');
  crashed.pending_crisis = { type: 'tracker', choices: [{ id: 'hide', ap_cost: 0 }], payload: {} };
  const recovered = act(crashed, { type: 'recover' }).run;
  assert.equal(recovered.state.confusion_score, 0);
  assert.equal(recovered.state.is_crashed, false);
  assert.equal(recovered.state.action_points_left, 12);
  assert.equal(recovered.bsod_count, 1);
  assert.equal(recovered.recovery_count, 1);
  assert.deepEqual(recovered.state.unlocked_clues, ['c_01', 'c_02']);
  assert.equal(recovered.state.turn_count, crashed.state.turn_count);
  assert.ok(recovered.pending_crisis);
  reject(recovered, { type: 'recover' }, 'RUN_NOT_CRASHED');
  reject(recovered, { type: 'rest' }, 'CRISIS_PENDING');
  const immune = JSON.parse(JSON.stringify(crashed));
  immune.team_config.skill_effects.bsod_immunity = true;
  assert.equal(act(immune, { type: 'recover' }).run.state.action_points_left, immune.state.action_points_left);
});

test('emergency stabilization and contingencies cannot be repeatedly claimed', () => {
  const run = fresh();
  run.state.confusion_score = 40;
  const stabilized = act(run, { type: 'command', command_id: 'emergency_stabilize' }).run;
  assert.equal(stabilized.state.confusion_score, 28);
  assert.equal(stabilized.state.command_state.points, 1);
  reject(stabilized, { type: 'command', command_id: 'emergency_stabilize' }, 'COMMAND_ALREADY_USED');
  reject(run, { type: 'command', command_id: 'invented' }, 'INVALID_COMMAND');
});

test('an investigation can reach a rewardable ending using only public options and persisted intents', () => {
  let run = fresh('full-intent-investigation');
  const commit = command => { run = act(JSON.parse(JSON.stringify(run)), command).run; };
  for (let turn = 0; turn < 45 && run.status === 'active'; turn++) {
    if (run.state.is_crashed) commit({ type: 'recover' });
    run = resolvePending(run);
    const evidence = publicRun(run).state.unlocked_clues.filter(id => ['c_01', 'c_02', 'c_03'].includes(id));
    if (evidence.length === 3 || (run.state.action_points_left === 0 && evidence.length)) {
      commit(reportCommand(evidence));
      break;
    }
    assert.ok(run.state.action_points_left > 0, 'investigation must preserve some reportable evidence');
    commit({ type: 'decision_options' });
    const view = publicRun(run);
    const choices = Object.entries(view.decision_options.packs).flatMap(([id, pack]) =>
      view.state.agent_stamina[id] >= 6 ? pack.cards : []).sort((a, b) => b.estimatedAlignment - a.estimatedAlignment);
    commit(choices.length ? { type: 'round', option_id: choices[0].optionId } : { type: 'rest' });
  }
  assert.equal(run.status, 'completed');
  const summary = deriveRunSummary(run);
  assert.equal(summary.is_passed, true);
  assert.ok(summary.xp_gain > 0);
  assert.deepEqual(summary.clues, run.state.unlocked_clues);
});

test('all canonical cases support server-owned start, decisions, questions and safe report options', () => {
  for (const caseData of ALL_CASES) {
    const run = fresh(`canonical-${caseData.case_id}`, { caseData });
    const ready = offered(run);
    assert.equal(Object.keys(ready.decision_options.packs).length, 3);
    const report = act(run, { type: 'report_options' }).result;
    assert.equal(report.availableEvidence.length, 0);
    assert.ok(report.conclusions.length > 0);
    assert.equal(JSON.stringify(report).includes('score'), false);
    assert.ok(act(run, { type: 'interrogation_options', npc_id: caseData.npcs[0].npc_id }).result.packs);
    const resolved = act(ready, { type: 'round', option_id: firstCard(ready).optionId }).run;
    assert.equal(resolved.state.turn_count, 1);
    const available = getAvailableClueIds(caseData, resolved.state.current_zone, [], 1, []);
    assert.ok(resolved.state.unlocked_clues.every(id => available.includes(id)
      || caseData.clue_dictionary.some(clue => clue.clue_id === id)));
  }
});
