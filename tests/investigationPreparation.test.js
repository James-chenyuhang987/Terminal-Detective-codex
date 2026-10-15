import test from 'node:test';
import assert from 'node:assert/strict';
import { authoritativeProfile, prepareCaseStart } from '../server/gameAuthority/profileCommands.js';
import { createRun, applyRunCommand, publicRun } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';
import { getInvestigationAbilityPercent, getInvestigationAgentPreparation,
  INVESTIGATION_PREPARATION_REVISION } from '../src/game/investigationPreparation.js';

const NOW = new Date('2026-10-15T00:00:00Z');
let sequence = 0;
const SPEC = getInvestigationContent('Lvl_01');
function fresh({ specs = [{}, {}, {}], effects = {}, version = 2, contingency = 'cognitive_stabilizer' } = {}) {
  const profile = authoritativeProfile({}, NOW);
  const started = prepareCaseStart(profile, { type: 'start_case', case_id: 'Lvl_01', investigation_version: version,
    team_config: { specs, command_plan: { doctrine_id: 'evidence_control', contingency_id: contingency } } }, NOW);
  const run = createRun({ id: `lobby-preparation-${++sequence}`, caseData: started.caseData,
    teamConfig: started.teamConfig, effects: { ...started.effects, ...effects }, now: NOW, investigationVersion: version });
  run.next_crisis_turn = 999;
  return run;
}
function act(run, command) { return applyRunCommand(run, command, NOW); }
function offerInspection(run, target, executor = run.team_config.team[0].agent_id, methodId = target.method_id) {
  run.state.current_zone = target.zone_id;
  const offered = act(run, { type: 'inspect_options', target_id: target.target_id });
  const card = offered.result.packs[executor].cards.find(item => item.method_id === methodId);
  assert.ok(card);
  return { ...offered, card };
}
function inspect(run, target, executor, methodId) {
  const offered = offerInspection(run, target, executor, methodId);
  return { ...act(offered.run, { type: 'inspect', option_id: offered.card.option_id }), card: offered.card };
}
function activateThrottle(run) {
  run.state.action_points_left = 6;
  const active = act(run, { type: 'rest' }).run;
  assert.equal(active.state.command_ap_credit, 2);
  assert.equal(active.state.command_state.contingency_status, 'used');
  assert.equal(active.state.command_state.points, 2);
  return active;
}
function question(run, npcId, tone) {
  run.state.current_zone = SPEC.npc_zones[npcId];
  const offered = act(run, { type: 'interrogation_options', npc_id: npcId });
  const executor = run.team_config.team[0].agent_id;
  const quoted = offered.result.packs[executor].questions.find(item => item.tone === tone);
  return { ...act(offered.run, { type: 'question', npc_id: npcId,
    executor_agent_id: executor, question_id: quoted.questionId }), quoted };
}

test('preparation maps only raw role attributes to capped percentages and independent thresholds', () => {
  for (const [raw, percent] of [[0, 0], [23, 57.5], [24, 60], [29, 72.5], [30, 75], [40, 100], [80, 100], [-1, 0]]) {
    assert.equal(getInvestigationAbilityPercent({ logic_power: raw }, 'logic_power'), percent);
  }
  assert.equal(getInvestigationAbilityPercent({ base_logic_power: 80 }, 'logic_power'), 0);
  assert.equal(getInvestigationAbilityPercent({ logic_power: NaN }, 'logic_power'), 0);
  assert.equal(getInvestigationAbilityPercent({ logic_power: Infinity }, 'logic_power'), 0);
  assert.equal(getInvestigationAbilityPercent({ ap_cost_discount: 30 }, 'ap_cost_discount'), 0);
  const ready = getInvestigationAgentPreparation({ agent_id: 'test', logic_power: 30, observation_focus: 24, hack_level: 23 });
  assert.deepEqual(ready, { agent_id: 'test', ability_percent: { logic_power: 75, observation_focus: 60, hack_level: 57.5 },
    professional_observation: { logic_power: true, observation_focus: true, hack_level: false }, specialist_efficiency: true });
});

test('real authority lobby teams reach observation at 24 and one efficiency charge at 30 raw points', () => {
  const target = SPEC.targets.find(item => item.expert_note?.ability === 'base_logic_power');
  for (const points of [23, 24, 29, 30]) {
    const run = fresh({ specs: [{ logic_power: points - 20 }, {}, {}] });
    assert.equal(run.investigation.preparation_revision, INVESTIGATION_PREPARATION_REVISION);
    assert.equal(publicRun(run).investigation.preparation_revision, 2);
    assert.equal(run.team_config.team[0].logic_power, points);
    assert.equal(Object.hasOwn(run.team_config.team[0], 'base_logic_power'), false);
    const result = inspect(run, target);
    assert.equal(result.result.completed, true);
    assert.deepEqual(result.result.new_clue_ids, [target.clue_id]);
    assert.equal(result.card.ap_cost, points >= 30 ? 0 : 1);
    assert.equal(result.result.ap_cost, result.card.ap_cost);
    assert.equal(result.run.state.action_points_left, 20 - result.card.ap_cost);
    assert.equal(Object.hasOwn(result.result, 'expert_note'), points >= 24);
    if (points >= 24) assert.equal(result.result.expert_note, target.expert_note.text.zh);
  }
});

test('each real profession can earn its matching observation without relying on legacy base percentages', () => {
  const cases = [
    { slot: 0, key: 'logic_power' }, { slot: 1, key: 'observation_focus' }, { slot: 2, key: 'hack_level' },
  ];
  for (const { slot, key } of cases) {
    const specs = [{}, {}, {}]; specs[slot] = { [key]: 4 };
    const run = fresh({ specs });
    run.team_config.team[slot][`base_${key}`] = 0;
    const target = SPEC.targets.find(item => item.expert_note?.ability === `base_${key}`);
    const result = inspect(run, target, run.team_config.team[slot].agent_id);
    assert.equal(result.result.expert_note, target.expert_note.text.zh);
    assert.equal(result.result.ap_cost, 1);
  }
});

test('wrong checks consume the one specialist attempt, preserve evidence correctness and reject replay atomically', () => {
  const run = fresh({ specs: [{ logic_power: 10 }, {}, {}] });
  const target = SPEC.targets.find(item => item.expert_note?.ability === 'base_logic_power');
  const wrongMethod = target.methods.find(item => item.id !== target.method_id).id;
  const wrong = inspect(run, target, undefined, wrongMethod);
  assert.equal(wrong.card.ap_cost, 0);
  assert.equal(wrong.result.completed, false);
  assert.equal(wrong.run.state.turn_count, 1);
  assert.equal(wrong.run.state.confusion_score, 3);
  assert.deepEqual(wrong.result.new_clue_ids, []);
  assert.equal(Object.hasOwn(wrong.result, 'expert_note'), false);
  const before = JSON.stringify(wrong.run);
  assert.throws(() => act(wrong.run, { type: 'inspect', option_id: wrong.card.option_id }), error => error.code === 'STALE_OPTIONS');
  assert.equal(JSON.stringify(wrong.run), before);
  const confirmed = inspect(JSON.parse(before), target);
  assert.equal(confirmed.card.ap_cost, 1);
  assert.equal(confirmed.result.expert_note, target.expert_note.text.zh);
  assert.equal(confirmed.run.state.action_points_left, 19);
});

test('new professional observations remain private until a correct check and survive bilingual free review', () => {
  const run = fresh({ specs: [{ logic_power: 4 }, {}, {}] });
  const target = SPEC.targets.find(item => item.expert_note?.ability === 'base_logic_power');
  const notes = SPEC.targets.filter(item => item.expert_note).flatMap(item => Object.values(item.expert_note.text));
  const offered = offerInspection(run, target);
  const publicOffer = JSON.stringify({ result: offered.result, run: publicRun(offered.run) });
  notes.forEach(note => assert.equal(publicOffer.includes(note), false));
  const correct = act(offered.run, { type: 'inspect', option_id: offered.card.option_id });
  const restored = JSON.parse(JSON.stringify(correct.run));
  assert.deepEqual(restored.investigation.completed_checks[0].expert_note, target.expert_note.text);
  const publicResult = JSON.stringify(publicRun(restored));
  notes.filter(note => !Object.values(target.expert_note.text).includes(note))
    .forEach(note => assert.equal(publicResult.includes(note), false));
  const review = offerInspection(restored, target);
  const english = act(review.run, { type: 'inspect', option_id: review.card.option_id, lang: 'en' });
  assert.equal(english.result.expert_note, target.expert_note.text.en);
  assert.equal(english.result.review, true);
  assert.equal(english.run.state.action_points_left, restored.state.action_points_left);
});

test('scanner, specialist and throttle never consume each other’s allowance or charge free review', () => {
  let run = activateThrottle(fresh({ specs: [{ logic_power: 10 }, {}, {}], contingency: 'emergency_throttle',
    effects: { skill_effects: { auto_unlock_first: true } } }));
  const executor = run.team_config.team[0].agent_id;
  const targets = SPEC.targets.filter(item => item.zone_id === run.state.current_zone);
  const scanner = inspect(run, targets[0], executor);
  assert.equal(scanner.card.ap_discount_source, 'scanner');
  assert.equal(scanner.run.state.ap_discount_credit, 0);
  assert.equal(scanner.run.state.command_ap_credit, 2);
  assert.deepEqual(scanner.run.investigation.discounted_agent_ids, []);
  const specialist = inspect(scanner.run, targets[1], executor);
  assert.equal(specialist.card.ap_discount_source, 'specialist');
  assert.equal(specialist.run.state.command_ap_credit, 2);
  assert.deepEqual(specialist.run.investigation.discounted_agent_ids, [executor]);
  const reviewed = inspect(specialist.run, targets[1], executor);
  assert.equal(reviewed.result.review, true);
  assert.equal(reviewed.run.state.command_ap_credit, 2);
  assert.equal(reviewed.run.state.turn_count, specialist.run.state.turn_count);
  const credited = inspect(reviewed.run, targets[2], executor);
  assert.equal(credited.card.ap_discount_source, null);
  assert.equal(credited.card.command_ap_credit_used, 1);
  assert.equal(credited.run.state.command_ap_credit, 1);
  assert.equal(credited.run.state.action_points_left, run.state.action_points_left);
  assert.deepEqual(credited.run.investigation.discounted_agent_ids, [executor]);
});

test('throttle waives two actual inspection costs even on failure, then charges normal AP', () => {
  let run = activateThrottle(fresh({ contingency: 'emergency_throttle' }));
  const target = SPEC.targets.find(item => item.zone_id === run.state.current_zone);
  const wrong = target.methods.find(item => item.id !== target.method_id).id;
  const failed = inspect(run, target, undefined, wrong);
  assert.equal(failed.card.ap_cost, 0);
  assert.equal(failed.run.state.command_ap_credit, 1);
  assert.equal(failed.run.state.confusion_score, 3);
  const corrected = inspect(JSON.parse(JSON.stringify(failed.run)), target);
  assert.equal(corrected.card.ap_cost, 0);
  assert.equal(corrected.run.state.command_ap_credit, 0);
  const another = SPEC.targets.find(item => item.target_id !== target.target_id && item.zone_id === target.zone_id);
  const charged = inspect(corrected.run, another);
  assert.equal(charged.card.ap_cost, 1);
  assert.equal(charged.run.state.action_points_left, run.state.action_points_left - 1);
  assert.equal(charged.run.state.command_state.points, 2, 'global monitoring must not trigger the contingency again');
});

test('throttle-funded checks remain available at zero AP and exhausted or stale offers cannot spend credit twice', () => {
  let run = activateThrottle(fresh({ contingency: 'emergency_throttle' }));
  run.state.action_points_left = 0;
  const targets = SPEC.targets.filter(item => item.zone_id === run.state.current_zone);
  const firstOffer = offerInspection(run, targets[0]);
  assert.equal(firstOffer.card.available, true);
  const first = act(firstOffer.run, { type: 'inspect', option_id: firstOffer.card.option_id });
  assert.equal(first.run.state.action_points_left, 0);
  assert.equal(first.run.state.command_ap_credit, 1);
  const snapshot = JSON.stringify(first.run);
  assert.throws(() => act(first.run, { type: 'inspect', option_id: firstOffer.card.option_id }), error => error.code === 'STALE_OPTIONS');
  assert.equal(JSON.stringify(first.run), snapshot);
  const second = inspect(first.run, targets[1]);
  assert.equal(second.card.available, true);
  assert.equal(second.run.state.command_ap_credit, 0);
  const exhausted = offerInspection(second.run, targets[2]);
  assert.equal(exhausted.card.ap_cost, 1);
  assert.equal(exhausted.card.available, false);
  const before = JSON.stringify(exhausted.run);
  assert.throws(() => act(exhausted.run, { type: 'inspect', option_id: exhausted.card.option_id }), error => error.code === 'INSUFFICIENT_AP');
  assert.equal(JSON.stringify(exhausted.run), before);
});

test('pre-strategy v2 throttle applies to evidence questioning but ordinary questions and reviews preserve credit', () => {
  let run = activateThrottle(fresh({ contingency: 'emergency_throttle' }));
  delete run.investigation.interview_revision;
  run.state.unlocked_clues = run.case_data.clue_dictionary.map(item => item.clue_id);
  const npc = Object.keys(SPEC.testimonies)[0];
  const gentle = question(run, npc, 'gentle');
  assert.equal(gentle.quoted.ap_cost, 1);
  assert.equal(gentle.run.state.command_ap_credit, 2);
  const first = question(gentle.run, npc, 'evidence');
  assert.equal(first.quoted.ap_cost, 0);
  assert.equal(first.result.progressed, true);
  assert.equal(first.run.state.command_ap_credit, 1);
  const second = question(first.run, npc, 'evidence');
  assert.equal(second.quoted.ap_cost, 0);
  assert.equal(second.result.testimony_stage, 2);
  assert.equal(second.run.state.command_ap_credit, 0);
  second.run.state.command_ap_credit = 1;
  const reviewed = question(second.run, npc, 'evidence');
  assert.equal(reviewed.quoted.ap_cost, 0);
  assert.equal(reviewed.result.repeated, true);
  assert.equal(reviewed.run.state.command_ap_credit, 1);
  assert.equal(reviewed.run.state.turn_count, second.run.state.turn_count);
});

test('special verification uses the quoted credit once and free review preserves the remainder', () => {
  let run = activateThrottle(fresh({ contingency: 'emergency_throttle' }));
  run.state.unlocked_clues = [...SPEC.puzzle.required_clues];
  const offered = act(run, { type: 'puzzle_options' });
  assert.equal(offered.result.puzzle.ap_cost, 0);
  assert.equal(offered.result.puzzle.command_ap_credit_used, 1);
  const completed = act(JSON.parse(JSON.stringify(offered.run)), { type: 'puzzle', answer_ids: SPEC.puzzle.answer });
  assert.equal(completed.result.correct, true);
  assert.equal(completed.run.state.command_ap_credit, 1);
  assert.equal(completed.run.state.action_points_left, run.state.action_points_left);
  const reviewOffer = act(completed.run, { type: 'puzzle_options' });
  const reviewed = act(reviewOffer.run, { type: 'puzzle', answer_ids: SPEC.puzzle.answer });
  assert.equal(reviewed.result.review, true);
  assert.equal(reviewed.run.state.command_ap_credit, 1);
  assert.equal(reviewed.run.state.turn_count, completed.run.state.turn_count);
});

test('throttle only pays for puzzle submission and never supplies or auto-corrects the answer', () => {
  const run = activateThrottle(fresh({ contingency: 'emergency_throttle' }));
  run.state.unlocked_clues = [...SPEC.puzzle.required_clues];
  const offered = act(run, { type: 'puzzle_options' });
  const wrong = act(offered.run, { type: 'puzzle', answer_ids: [SPEC.puzzle.items[0].id] });
  assert.equal(wrong.result.correct, false);
  assert.equal(wrong.run.investigation.puzzle_completed, false);
  assert.equal(wrong.run.state.confusion_score, 3);
  assert.equal(wrong.run.state.command_ap_credit, 1);
  const snapshot = JSON.stringify(wrong.run);
  assert.throws(() => act(wrong.run, { type: 'puzzle', answer_ids: SPEC.puzzle.answer }), error => error.code === 'STALE_OPTIONS');
  assert.equal(JSON.stringify(wrong.run), snapshot);
  const retry = act(wrong.run, { type: 'puzzle_options' });
  const corrected = act(retry.run, { type: 'puzzle', answer_ids: SPEC.puzzle.answer });
  assert.equal(corrected.result.correct, true);
  assert.equal(corrected.run.state.command_ap_credit, 0);
  assert.equal(corrected.run.state.action_points_left, run.state.action_points_left);
});

test('a contingency triggered while offering a puzzle cannot change the saved price during execution', () => {
  const run = fresh({ contingency: 'emergency_throttle' });
  run.state.action_points_left = 6;
  run.state.unlocked_clues = [...SPEC.puzzle.required_clues];
  const offered = act(run, { type: 'puzzle_options' });
  assert.equal(offered.result.puzzle.ap_cost, 1);
  assert.equal(offered.run.state.command_ap_credit, 2);
  assert.equal(publicRun(offered.run).investigation.puzzle.ap_cost, 1);
  const result = act(offered.run, { type: 'puzzle', answer_ids: SPEC.puzzle.answer });
  assert.equal(result.run.state.action_points_left, 5);
  assert.equal(result.run.state.command_ap_credit, 2);
});

test('evidence-control doctrine awards one first valid link point across restore and repeated relations', () => {
  let run = fresh();
  run.state.unlocked_clues = run.case_data.clue_dictionary.map(item => item.clue_id);
  const relation = SPEC.relations[0];
  const command = { type: 'link', clue_ids: [relation.a, relation.b], relation_type: relation.relation };
  const first = act(run, command);
  assert.equal(first.result.is_valid, true);
  assert.equal(first.run.state.command_state.points, 4);
  assert.deepEqual(first.run.state.command_state.earned_milestones, ['doctrine:first-valid-link']);
  const repeated = act(JSON.parse(JSON.stringify(first.run)), command);
  assert.equal(repeated.result.repeated, true);
  assert.equal(repeated.run.state.command_state.points, 4);
  const other = SPEC.relations.find(item => item.proposition_id !== relation.proposition_id);
  const second = act(repeated.run, { type: 'link', clue_ids: [other.a, other.b], relation_type: other.relation });
  assert.equal(second.run.state.command_state.points, 4);
});

test('a full command pool records the first-link milestone and cannot bank another reward for later', () => {
  const run = fresh();
  run.state.command_state.points = 5;
  run.state.unlocked_clues = run.case_data.clue_dictionary.map(item => item.clue_id);
  const relation = SPEC.relations[0];
  const first = act(run, { type: 'link', clue_ids: [relation.a, relation.b], relation_type: relation.relation });
  assert.equal(first.run.state.command_state.points, 5);
  assert.deepEqual(first.run.state.command_state.earned_milestones, ['doctrine:first-valid-link']);
  first.run.state.command_state.points = 3;
  const other = SPEC.relations.find(item => item.proposition_id !== relation.proposition_id);
  const later = act(first.run, { type: 'link', clue_ids: [other.a, other.b], relation_type: other.relation });
  assert.equal(later.run.state.command_state.points, 3);
});

test('persisted unmarked v2 retains legacy percentage thresholds, unused throttle and doctrine behavior', () => {
  let run = fresh({ specs: [{ logic_power: 10 }, {}, {}], contingency: 'emergency_throttle' });
  delete run.investigation.preparation_revision;
  run = JSON.parse(JSON.stringify(run));
  assert.equal(publicRun(run).investigation.preparation_revision, 1);
  assert.equal(Object.hasOwn(run.investigation, 'preparation_revision'), false);
  const target = SPEC.targets.find(item => item.expert_note?.ability === 'base_logic_power');
  const noLegacy = inspect(run, target);
  assert.equal(noLegacy.card.ap_cost, 1);
  assert.equal(Object.hasOwn(noLegacy.result, 'expert_note'), false);
  const legacy = fresh({ contingency: 'emergency_throttle' });
  delete legacy.investigation.preparation_revision;
  legacy.team_config.team[0].base_logic_power = 60;
  const note = inspect(legacy, target);
  assert.equal(note.result.expert_note, target.expert_note.text.zh);
  assert.equal(note.card.ap_cost, 1);
  let credited = activateThrottle(legacy);
  credited.team_config.team[0].base_logic_power = 75;
  const free = inspect(credited, target);
  assert.equal(free.card.ap_cost, 0);
  assert.equal(free.run.state.command_ap_credit, 2);
  const other = SPEC.targets.find(item => item.target_id !== target.target_id);
  const paid = inspect(free.run, other);
  assert.equal(paid.card.ap_cost, 1);
  assert.equal(paid.run.state.command_ap_credit, 2);
  paid.run.state.unlocked_clues = paid.run.case_data.clue_dictionary.map(item => item.clue_id);
  const relation = SPEC.relations[0];
  const linked = act(paid.run, { type: 'link', clue_ids: [relation.a, relation.b], relation_type: relation.relation });
  assert.equal(linked.run.state.command_state.points, 2);
  assert.deepEqual(linked.run.state.command_state.earned_milestones, []);
  assert.equal(Object.hasOwn(linked.run.investigation, 'preparation_revision'), false);
  assert.equal(Object.hasOwn(fresh({ version: 1 }), 'investigation'), false);
});
