import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, applyRunCommand, publicRun, deriveRunSummary, validateRunCommand } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { applyInspectionContent } from '../server/investigationV2/inspectionContent.js';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { MAX_RUN_BYTES, serialize, storedRun } from '../cloudflare/worker/authorityStore.js';
import { handleProfileFunction } from '../cloudflare/worker/profileAuthority.js';
import { handleRunFunction } from '../cloudflare/worker/run.js';
import { authorityDB, session, request, USER_ID } from './cloudflareAuthorityDB.js';
import { createRunCrisis, nextRunCrisisTurn } from '../server/gameAuthority/runCrisis.js';
import { getRejectedReportPenalty } from '../src/game/caseEvaluation.js';

const NOW = new Date('2026-10-14T12:00:00Z');
const dimensions = ['opportunity', 'method', 'motive', 'timeline'];
let seq = 0;
function fresh(caseId = 'Lvl_01', version = 2, options = {}) {
  const { minimumAbilities = true, ...runOptions } = options;
  const team = buildTeamConfig();
  if (minimumAbilities) team.team = team.team.map(agent => ({ ...agent, logic_power: 0, observation_focus: 0, hack_level: 0,
    confusion_resistance: 0, base_logic_power: 0, base_observation_focus: 0, base_hack_level: 0, base_confusion_resistance: 0 }));
  return createRun({ id: `v2-authority-test-${caseId}-${++seq}`, caseData: ALL_CASES.find(item => item.case_id === caseId),
    teamConfig: team, now: NOW, investigationVersion: version, ...runOptions });
}
function act(run, command) { return applyRunCommand(run, command, NOW); }
function legacyPreparation(run) {
  // These percentage-based fixtures represent already-paid older v2 runs.
  // New lobby attribute boundaries are exercised through prepareCaseStart in
  // investigationPreparation.test.js instead of fabricated base percentages.
  delete run.investigation.preparation_revision;
  return run;
}
function settleCrisis(run) {
  if (!run.pending_crisis) return run;
  const option_id = { evidence: 'defer', npc_recant: 'reinterrogate', tracker: 'hide' }[run.pending_crisis.type];
  return act(run, { type: 'crisis', option_id }).run;
}
function pathTo(run, destination) {
  const access = publicRun(run).investigation.zone_access;
  const queue = [[run.state.current_zone]];
  const visited = new Set();
  while (queue.length) {
    const path = queue.shift();
    const current = path.at(-1);
    if (current === destination) return path.slice(1);
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [a, b] of run.case_data.zone_connections) {
      const next = a === current ? b : b === current ? a : null;
      if (next && access[next]?.available && !visited.has(next)) queue.push([...path, next]);
    }
  }
  return null;
}
function travelTo(run, zone) {
  const path = pathTo(run, zone);
  assert.ok(path, `no reachable path from ${run.state.current_zone} to ${zone}`);
  for (const zone_id of path) run = act(run, { type: 'travel', zone_id }).run;
  return run;
}
function inspectTarget(run, target, executor = null, methodId = target.method_id, lang = 'zh') {
  run = settleCrisis(run);
  run = travelTo(run, target.zone_id);
  const offered = act(run, { type: 'inspect_options', target_id: target.target_id, lang });
  run = offered.run;
  const choices = Object.entries(offered.result.packs).map(([id, pack]) => ({ id, card: pack.cards.find(item => item.method_id === methodId) }));
  choices.sort((a, b) => run.state.agent_stamina[b.id] - run.state.agent_stamina[a.id]);
  const selected = executor ? choices.find(item => item.id === executor) : choices[0];
  const outcome = act(run, { type: 'inspect', option_id: selected.card.option_id, lang });
  return { ...outcome, card: selected.card };
}
function allCore(run) {
  const spec = getInvestigationContent(run.case_id);
  const remaining = spec.targets.filter(target => !target.hidden);
  while (remaining.length) {
    run = settleCrisis(run);
    const index = remaining.findIndex(target => (target.required_clues || []).every(id => run.state.unlocked_clues.includes(id))
      && pathTo(run, target.zone_id));
    assert.notEqual(index, -1, `unreachable targets in ${run.case_id}: ${remaining.map(item => item.target_id).join(',')}`);
    const target = remaining.splice(index, 1)[0];
    const outcome = inspectTarget(run, target);
    assert.equal(outcome.result.completed, true, target.target_id);
    run = outcome.run;
  }
  return settleCrisis(run);
}
function reportCommand(run, gradeEvidence = null) {
  const spec = getInvestigationContent(run.case_id);
  const answers = Object.fromEntries(Object.entries(spec.report.answers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const evidence_by_dimension = gradeEvidence || Object.fromEntries(dimensions.map(key => [key,
    spec.report.support[key].filter(id => run.state.unlocked_clues.includes(id))]));
  return { type: 'report', ...answers, evidence_by_dimension };
}
function reject(run, command, code) {
  const before = JSON.stringify(run);
  assert.throws(() => act(run, command), error => error.code === code && error.status === 400);
  assert.equal(JSON.stringify(run), before, 'Rejected commands must be atomic.');
}

for (const caseId of INVESTIGATION_CASE_IDS) {
  for (const configuration of ['zero-ability', 'default-team']) {
  test(`${caseId} ${configuration}: complete all core checks, six testimonies and special verification within 16 AP`, (t) => {
    let run = fresh(caseId, 2, { minimumAbilities: configuration === 'zero-ability' });
    assert.equal(run.state.action_points_left, 20);
    assert.equal(run.state.current_zone, run.case_data.initial_zone);
    assert.deepEqual(run.state.visited_zones, [run.case_data.initial_zone]);
    assert.deepEqual(publicRun(run).state.visited_zones, [run.case_data.initial_zone]);
    const spec = getInvestigationContent(caseId);
    assert.equal(spec.targets.filter(target => !target.hidden).length, 8);
    run = allCore(run);
    assert.equal(run.investigation.completed_checks.length, 8);
    for (const [npc_id, stages] of Object.entries(spec.testimonies)) {
      run = travelTo(settleCrisis(run), spec.npc_zones[npc_id]);
      assert.equal(stages.length, 2);
      for (let stage = 0; stage < 2; stage++) {
        run = settleCrisis(run);
        const offered = act(run, { type: 'interrogation_options', npc_id });
        run = offered.run;
        const executor_agent_id = Object.keys(offered.result.packs).sort((a, b) => run.state.agent_stamina[b] - run.state.agent_stamina[a])[0];
        const q = offered.result.packs[executor_agent_id].questions.find(item => item.tone === 'evidence');
        assert.equal(q.available, true);
        const answered = act(run, { type: 'question', npc_id, question_id: q.questionId, executor_agent_id });
        assert.equal(answered.result.progressed, true);
        assert.equal(answered.result.testimony_stage, stage + 1);
        run = answered.run;
      }
    }
    run = settleCrisis(run);
    const offered = act(run, { type: 'puzzle_options' });
    run = act(offered.run, { type: 'puzzle', answer_ids: spec.puzzle.answer }).run;
    run = settleCrisis(run);
    assert.ok(run.state.action_points_left >= 4, `${caseId} took ${20 - run.state.action_points_left} AP`);
    assert.equal(run.investigation.puzzle_completed, true);
    const completed = act(run, reportCommand(run)).run;
    assert.equal(completed.status, 'completed');
    assert.equal(completed.judge_result.score, 'B');
    const summary = deriveRunSummary(JSON.parse(JSON.stringify(completed)));
    assert.equal(summary.is_passed, true);
    assert.equal(summary.score, 'B');
    assert.ok(Buffer.byteLength(serialize(completed, MAX_RUN_BYTES)) < MAX_RUN_BYTES);
    for (const relation of spec.relations.filter(item => item.alternative)) {
      run = act(run, { type: 'link', clue_ids: [relation.a, relation.b], relation_type: relation.relation }).run;
    }
    assert.equal(act(run, reportCommand(run)).result.score, 'A');
    while (run.state.turn_count < spec.hidden.unlock_turn) run = settleCrisis(act(run, { type: 'rest' }).run);
    const hidden = publicRun(run).investigation.targets.find(target => target.target_id === spec.hidden.target_id);
    assert.ok(hidden, `${caseId} hidden check must be accessible after its prerequisites`);
    run = inspectTarget(run, { ...hidden, method_id: spec.hidden.method_id || 'verify_source' }).run;
    run = settleCrisis(run);
    const best = act(run, reportCommand(run)).run;
    assert.equal(best.judge_result.score, 'S');
    assert.equal(deriveRunSummary(best).all_hidden_clues, true);
    t.diagnostic(JSON.stringify({ case_id: caseId, configuration, core_ap_cost: 20 - completed.state.action_points_left,
      core_turns: completed.state.turn_count,
      core_checks: completed.investigation.completed_checks.length, testimony_stages: completed.investigation.testimony_stages,
      puzzle_completed: true, grade: summary.score, best_grade: best.judge_result.score,
      retained_evidence: best.state.unlocked_clues.length, saved_bytes: Buffer.byteLength(serialize(best, MAX_RUN_BYTES)) }));
  });
  }
}

test('v2 is opt-in: old runs keep v1 validators, scoring and random investigation; v2 rejects old random rounds', () => {
  let legacy = fresh('Lvl_01', 1);
  assert.equal(legacy.investigation_version, undefined);
  assert.equal(publicRun(legacy).investigation, undefined);
  reject(legacy, { type: 'inspect_options', target_id: 'target_c_01' }, 'INVALID_COMMAND');
  reject(legacy, { type: 'link', clue_ids: ['c_01', 'c_02'], relation_type: 'supports' }, 'INVALID_COMMAND');
  reject(legacy, { ...reportCommand(fresh()), evidence_ids: ['c_01'] }, 'INVALID_COMMAND');
  legacy = act(legacy, { type: 'decision_options' }).run;
  const card = Object.values(legacy.decision_options.packs)[0].cards[0];
  assert.equal(act(legacy, { type: 'round', option_id: card.optionId }).run.state.turn_count, 1);
  reject(fresh(), { type: 'decision_options' }, 'MANUAL_INSPECTION_REQUIRED');
  reject(fresh(), { type: 'round', option_id: 'invented' }, 'MANUAL_INSPECTION_REQUIRED');
});

test('public projection never includes rewards, correct methods, future testimony, hidden answer or support mappings', () => {
  const run = fresh();
  const spec = getInvestigationContent(run.case_id);
  const view = publicRun(run);
  const json = JSON.stringify(view);
  assert.deepEqual(view.state.revealed_clues, []);
  assert.deepEqual(view.investigation.clue_zones, {});
  assert.equal(view.investigation.targets.length, 8);
  for (const target of view.investigation.targets) {
    assert.equal(Object.hasOwn(target, 'clue_id'), false);
    assert.equal(Object.hasOwn(target, 'method_id'), false);
    assert.equal(Object.hasOwn(target, 'result'), false);
  }
  for (const stages of Object.values(spec.testimonies)) for (const stage of stages) {
    assert.equal(json.includes(stage.response.zh), false);
    assert.equal(json.includes(stage.response.en), false);
  }
  for (const field of ['answers', 'wrong_outcomes', 'support', spec.hidden.clue_id]) assert.equal(json.includes(`"${field}"`), false, field);
  assert.equal(view.investigation.puzzle.items.length, 0);
  view.investigation.completed_checks.push('untrusted');
  assert.deepEqual(run.investigation.completed_checks, []);
});

test('inspections are target/agent/revision-bound, correct evidence is deterministic and repeat checks are free', () => {
  let run = fresh();
  const target = getInvestigationContent(run.case_id).targets.find(item => item.zone_id === run.state.current_zone);
  reject(run, { type: 'inspect', option_id: 'invented' }, 'STALE_OPTIONS');
  const offered = act(run, { type: 'inspect_options', target_id: target.target_id });
  const card = Object.values(offered.result.packs)[0].cards.find(item => item.method_id === target.method_id);
  const same = JSON.parse(JSON.stringify(offered.run));
  const first = act(same, { type: 'inspect', option_id: card.option_id });
  assert.deepEqual(first, act(same, { type: 'inspect', option_id: card.option_id }));
  assert.deepEqual(first.result.new_clue_ids, [target.clue_id]);
  assert.deepEqual(publicRun(first.run).investigation.clue_zones, { [target.clue_id]: target.zone_id });
  assert.equal(first.run.state.action_points_left, 19);
  assert.equal(first.run.state.turn_count, 1);
  assert.equal(first.run.state.agent_stamina[card.executor_agent_id], 44);
  reject(first.run, { type: 'inspect', option_id: card.option_id }, 'STALE_OPTIONS');
  const rested = act(offered.run, { type: 'rest' }).run;
  reject(rested, { type: 'inspect', option_id: card.option_id }, 'STALE_OPTIONS');
  run = first.run;
  const before = JSON.stringify(run.state);
  const reviewed = inspectTarget(run, target);
  assert.equal(reviewed.result.review, true);
  assert.equal(reviewed.result.ap_cost, 0);
  assert.deepEqual(reviewed.result.new_clue_ids, []);
  assert.equal(JSON.stringify(reviewed.run.state), before);
  assert.equal(reviewed.run.investigation.completed_checks.length, 1);
});

test('wrong method keeps the object available and cannot consume its only critical evidence', () => {
  const run = fresh();
  const target = getInvestigationContent(run.case_id).targets.find(item => item.zone_id === run.state.current_zone && item.methods.length > 1);
  const incorrect = target.methods.find(method => method.id !== target.method_id);
  const wrong = inspectTarget(run, target, null, incorrect.id);
  assert.equal(wrong.result.completed, false);
  assert.deepEqual(wrong.run.state.unlocked_clues, []);
  assert.equal(wrong.run.state.action_points_left, 19);
  assert.equal(wrong.run.state.confusion_score, 3);
  const right = inspectTarget(wrong.run, target);
  assert.equal(right.result.completed, true);
  assert.deepEqual(right.run.state.destroyed_clue_ids, []);
});

test('legacy specialist and paid scanner discounts have bounded charges rather than bypassing resource pressure', () => {
  let run = legacyPreparation(fresh());
  const executor = run.team_config.team[0].agent_id;
  run.team_config.team[0].base_observation_focus = 80;
  const targets = getInvestigationContent(run.case_id).targets.filter(item => item.zone_id === run.state.current_zone);
  const first = inspectTarget(run, targets[0], executor);
  assert.equal(first.result.ap_cost, 0);
  assert.equal(first.run.state.action_points_left, 20);
  const second = inspectTarget(first.run, targets[1], executor);
  assert.equal(second.result.ap_cost, 1);
  assert.equal(second.run.state.action_points_left, 19);
  const scanner = fresh('Lvl_01', 2, { effects: { skill_effects: { auto_unlock_first: true } } });
  assert.deepEqual(scanner.state.unlocked_clues, []);
  assert.equal(scanner.state.ap_discount_credit, 1);
  const discounted = inspectTarget(scanner, targets[0]);
  assert.equal(discounted.result.ap_cost, 0);
  assert.equal(discounted.run.state.ap_discount_credit, 0);
});

test('legacy professional observations require the corresponding base ability at 60 without weakening low-ability evidence', () => {
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const targets = getInvestigationContent(caseId).targets.filter(target => target.expert_note);
    assert.ok(targets.length >= 3, `${caseId} must offer observation, logic and audit expertise`);
    for (const target of targets) for (const lang of ['zh', 'en']) {
      const low = legacyPreparation(fresh(caseId));
      // Isolate each object; separate traversal/playthrough tests cover access.
      low.state.current_zone = target.zone_id;
      const executor = low.team_config.team[0].agent_id;
      const ability = target.expert_note.ability;
      low.team_config.team[0][ability] = 59;
      const unrelated = ['base_observation_focus', 'base_logic_power', 'base_hack_level'].find(key => key !== ability);
      low.team_config.team[0][unrelated] = 60;
      const withoutNote = inspectTarget(low, target, executor, target.method_id, lang);
      assert.equal(withoutNote.result.completed, true);
      assert.deepEqual(withoutNote.result.new_clue_ids, [target.clue_id]);
      assert.equal(withoutNote.result.narration, target.result[lang]);
      assert.equal(Object.hasOwn(withoutNote.result, 'expert_note'), false, `${caseId}/${target.clue_id}: unrelated expertise must not unlock the note`);
      assert.equal(Object.hasOwn(withoutNote.run.investigation.completed_checks[0], 'expert_note'), false);

      const expert = legacyPreparation(fresh(caseId));
      expert.state.current_zone = target.zone_id;
      expert.team_config.team[0][ability] = 60;
      const confirmed = inspectTarget(expert, target, executor, target.method_id, lang);
      assert.equal(confirmed.result.expert_note, target.expert_note.text[lang]);
      assert.deepEqual(confirmed.result.new_clue_ids, withoutNote.result.new_clue_ids);
      assert.equal(confirmed.result.narration, withoutNote.result.narration);
      assert.equal(confirmed.result.ap_cost, 1, 'professional detail does not change the existing 75-point discount threshold');
      assert.equal(confirmed.run.state.turn_count, 1);
      assert.equal(confirmed.run.state.agent_stamina[executor], 44);
      assert.deepEqual(confirmed.run.investigation.completed_checks[0].expert_note, target.expert_note.text);
    }
  }
});

test('legacy unverified professional notes stay private, and confirmed bilingual notes survive restore and free review', () => {
  const privateNotes = INVESTIGATION_CASE_IDS.flatMap(caseId => getInvestigationContent(caseId).targets
    .filter(target => target.expert_note).flatMap(target => Object.values(target.expert_note.text)));
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const target = getInvestigationContent(caseId).targets.find(item => item.expert_note);
    let run = legacyPreparation(fresh(caseId));
    run.state.current_zone = target.zone_id;
    const executor = run.team_config.team[0].agent_id;
    run.team_config.team[0][target.expert_note.ability] = 80;
    const initial = JSON.stringify(publicRun(run));
    privateNotes.forEach(note => assert.equal(initial.includes(note), false));
    const offered = act(run, { type: 'inspect_options', target_id: target.target_id });
    const offeredJson = JSON.stringify({ result: offered.result, run: publicRun(offered.run) });
    privateNotes.forEach(note => assert.equal(offeredJson.includes(note), false));
    const incorrect = target.methods.find(method => method.id !== target.method_id);
    const wrong = inspectTarget(run, target, executor, incorrect.id);
    assert.equal(wrong.result.completed, false);
    assert.equal(Object.hasOwn(wrong.result, 'expert_note'), false);
    privateNotes.forEach(note => assert.equal(JSON.stringify({ result: wrong.result, run: publicRun(wrong.run) }).includes(note), false));

    const correct = inspectTarget(wrong.run, target, executor);
    assert.equal(correct.result.expert_note, target.expert_note.text.zh);
    const publicJson = JSON.stringify(publicRun(correct.run));
    assert.ok(publicJson.includes(target.expert_note.text.zh));
    assert.ok(publicJson.includes(target.expert_note.text.en));
    const otherNotes = privateNotes.filter(note => !Object.values(target.expert_note.text).includes(note));
    otherNotes.forEach(note => assert.equal(publicJson.includes(note), false, 'other objects must remain undisclosed'));
    run = JSON.parse(serialize(correct.run, MAX_RUN_BYTES));
    run.team_config.team[0][target.expert_note.ability] = 0;
    run = settleCrisis(run);
    const before = JSON.stringify(run.state);
    for (const lang of ['en', 'zh']) {
      const reviewed = inspectTarget(run, target, executor, target.method_id, lang);
      assert.equal(reviewed.result.review, true);
      assert.equal(reviewed.result.ap_cost, 0);
      assert.equal(reviewed.result.expert_note, target.expert_note.text[lang]);
      assert.deepEqual(reviewed.result.new_clue_ids, []);
      assert.equal(JSON.stringify(reviewed.run.state), before);
      assert.equal(reviewed.run.investigation.completed_checks.length, 1);
      run = reviewed.run;
    }
  }
});

test('all legacy earned professional notes fit stored runs without new clues, costs or report dependencies', () => {
  for (const caseId of INVESTIGATION_CASE_IDS) {
    let run = legacyPreparation(fresh(caseId));
    run.team_config.team.forEach(agent => {
      agent.base_observation_focus = 60;
      agent.base_logic_power = 60;
      agent.base_hack_level = 60;
    });
    run = allCore(run);
    const spec = getInvestigationContent(caseId);
    const earned = run.investigation.completed_checks.filter(check => check.expert_note);
    assert.equal(earned.length, spec.targets.filter(target => target.expert_note).length);
    assert.equal(run.state.unlocked_clues.length, 8);
    assert.equal(run.state.action_points_left, 12);
    assert.equal(run.state.turn_count, 8);
    const restored = JSON.parse(serialize(run, MAX_RUN_BYTES));
    assert.ok(Buffer.byteLength(JSON.stringify(restored)) < MAX_RUN_BYTES);
    assert.deepEqual(restored.investigation.completed_checks, run.investigation.completed_checks);
    assert.deepEqual(reportCommand(restored).evidence_by_dimension, reportCommand(allCore(fresh(caseId))).evidence_by_dimension);
  }
});

test('travel is adjacent, gated, free and does not recover stamina or advance hidden unlocks', () => {
  let run = fresh();
  reject(run, { type: 'travel', zone_id: 'missing' }, 'UNKNOWN_ZONE');
  const gated = Object.entries(run.case_data.scene.zones).find(([, zone]) => zone.entry_requirement && zone.entry_requirement !== 'search_area');
  const [, gatedZone] = gated;
  reject(run, { type: 'travel', zone_id: gated[0] }, 'ZONE_LOCKED');
  const gateTarget = getInvestigationContent(run.case_id).targets.find(target => target.zone_id === run.state.current_zone && target.action_tag === gatedZone.entry_requirement);
  run = inspectTarget(run, gateTarget).run;
  const before = { ap: run.state.action_points_left, stamina: run.state.agent_stamina, turn: run.state.turn_count };
  const origin = run.state.current_zone;
  run = act(run, { type: 'travel', zone_id: gated[0] }).run;
  assert.equal(run.state.current_zone, gated[0]);
  assert.deepEqual(run.state.visited_zones, [origin, gated[0]]);
  assert.equal(publicRun(run).state.visited_zones.length, 2);
  run = act(run, { type: 'travel', zone_id: origin }).run;
  assert.equal(run.state.action_points_left, before.ap);
  assert.equal(run.state.turn_count, before.turn);
  assert.deepEqual(run.state.agent_stamina, before.stamina);
});

test('Sonar entry guidance names the reachable insurance console that actually unlocks it, rather than a record behind the door', () => {
  let run = fresh('Lvl_07');
  const spec = getInvestigationContent(run.case_id);
  const insurance = spec.targets.find(target => target.clue_id === 'i_08');
  const robot = spec.targets.find(target => target.clue_id === 'i_07');
  assert.equal(run.state.current_zone, insurance.zone_id);
  const initial = publicRun(run).investigation.zone_access.zone_sonar_array;
  assert.equal(initial.available, false);
  for (const lang of ['zh', 'en']) {
    assert.ok(initial.requirement[lang].includes(insurance.label[lang]));
    assert.equal(initial.requirement[lang].includes(robot.label[lang]), false);
  }
  const wrongMethod = insurance.methods.find(method => method.id !== insurance.method_id).id;
  run = settleCrisis(inspectTarget(run, insurance, null, wrongMethod).run);
  assert.equal(publicRun(run).investigation.zone_access.zone_sonar_array.available, false);
  run = settleCrisis(inspectTarget(run, insurance).run);
  const opened = publicRun(run).investigation.zone_access.zone_sonar_array;
  assert.equal(opened.available, true);
  for (const lang of ['zh', 'en']) assert.ok(opened.requirement[lang].includes(insurance.label[lang]));
  const before = { ap: run.state.action_points_left, turn: run.state.turn_count };
  run = act(run, { type: 'travel', zone_id: robot.zone_id }).run;
  assert.equal(run.state.action_points_left, before.ap);
  assert.equal(run.state.turn_count, before.turn);
  assert.equal(run.state.unlocked_clues.includes(robot.clue_id), false);
});

test('wrong relationships incur one penalty, permit correction, and never destroy acquired clues', () => {
  let run = allCore(fresh());
  const relation = getInvestigationContent(run.case_id).relations[0];
  const incorrect = ['supports', 'contradicts', 'precedes'].find(type => type !== relation.relation);
  const command = { type: 'link', clue_ids: [relation.a, relation.b], relation_type: incorrect };
  const before = run.state.confusion_score;
  run = act(run, command).run;
  assert.equal(run.state.confusion_score, before + 3);
  const repeated = act(run, command);
  assert.equal(repeated.result.repeated, true);
  assert.equal(repeated.run.state.confusion_score, run.state.confusion_score);
  run = act(run, { ...command, relation_type: relation.relation }).run;
  assert.equal(run.investigation.propositions.length, 1);
  assert.deepEqual(run.state.destroyed_clue_ids, []);
  assert.equal(act(run, { ...command, relation_type: relation.relation }).run.truth_fragments, 1);
});

test('a pair can prove two distinct relations without repeated propositions, fragments or alternate-explanation credits', () => {
  let run = allCore(fresh('Lvl_08'));
  const spec = getInvestigationContent(run.case_id);
  const first = spec.relations.find(item => item.a === 'j_03' && item.b === 'j_02' && item.relation === 'supports');
  const second = spec.relations.find(item => item.relation !== first.relation
    && [item.a, item.b].sort().join(':') === [first.a, first.b].sort().join(':'));
  assert.ok(second);
  for (const relation of [first, second, second, first]) {
    run = act(run, { type: 'link', clue_ids: [relation.a, relation.b], relation_type: relation.relation }).run;
  }
  assert.equal(run.truth_fragments, 2);
  assert.equal(run.linked_pairs.length, 2);
  assert.equal(run.investigation.propositions.length, 2);
  assert.equal(run.investigation.propositions.filter(item => item.alternative).length, 1);
  assert.equal(new Set(run.investigation.propositions.map(item => item.id)).size, 2);
  assert.equal(run.state.linked_core_pairs.length, 1);
});

test('recorded temporal relationships work in both languages, enforce direction and never award alternative exclusions', () => {
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const spec = getInvestigationContent(caseId);
    const temporal = spec.relations.filter(item => item.relation === 'precedes');
    for (const lang of ['zh', 'en']) {
      let run = allCore(fresh(caseId));
      for (const edge of temporal) {
        const before = run.truth_fragments;
        const command = { type: 'link', clue_ids: [edge.a, edge.b], relation_type: 'precedes', lang };
        const linked = act(run, command);
        assert.equal(linked.result.is_valid, true, `${caseId}:${edge.a}>${edge.b}:${lang}`);
        assert.equal(linked.result.reveal, edge.label[lang]);
        assert.equal(linked.run.truth_fragments, before + 1);
        assert.deepEqual(linked.result.new_clue_ids, []);
        assert.equal(linked.run.investigation.propositions.at(-1).alternative, false);
        assert.equal(act(linked.run, command).run.truth_fragments, before + 1);
        const reversed = act(linked.run, { ...command, clue_ids: [edge.b, edge.a] });
        assert.equal(reversed.result.is_valid, false);
        assert.match(reversed.result.reveal, lang === 'zh' ? /先后关系.*原始时钟.*具体事件.*较早/ : /selected order.*original clocks.*specific events.*earlier/);
        assert.equal(reversed.run.investigation.propositions.filter(item => item.alternative).length, 0);
        assert.deepEqual(reversed.run.state.destroyed_clue_ids, []);
        run = reversed.run;
      }
    }
  }
});

test('access before shaft and roof before recovery are valid without needing any unrelated evidence', () => {
  for (const [caseId, a, b, required, firstTime, secondTime] of [
    ['Lvl_01', 'c_03', 'c_05', ['c_07', 'c_03', 'c_05'], '23:16', '23:17'],
    ['Lvl_02', 'd_06', 'd_03', ['d_07', 'd_03', 'd_06'], '02:34', '02:41'],
  ]) {
    const spec = getInvestigationContent(caseId);
    let run = fresh(caseId);
    for (const id of required) run = inspectTarget(run, spec.targets.find(target => target.clue_id === id)).run;
    run = settleCrisis(run);
    const linked = act(run, { type: 'link', clue_ids: [a, b], relation_type: 'precedes' });
    assert.equal(linked.result.is_valid, true);
    assert.match(linked.result.reveal, new RegExp(`${firstTime}.*${secondTime}`));
    assert.equal(linked.run.state.unlocked_clues.length, required.length);
    assert.equal(linked.run.investigation.propositions.length, 1);
    for (const target of spec.targets.filter(target => !required.includes(target.clue_id))) {
      assert.equal(linked.result.reveal.includes(target.result.zh), false);
    }
  }
});

test('hidden objects retain their actual area without replacing the main investigation objective or exposing the result', () => {
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const spec = getInvestigationContent(caseId);
    const initial = publicRun(fresh(caseId)).investigation;
    assert.equal(JSON.stringify(initial).includes(spec.hidden.target_id), false);
    let run = allCore(fresh(caseId));
    const away = Object.keys(run.case_data.scene.zones).find(zone => zone !== spec.hidden.zone_id);
    run = travelTo(run, away);
    const projected = publicRun(run).investigation;
    const hidden = projected.targets.find(target => target.target_id === spec.hidden.target_id);
    assert.ok(hidden);
    assert.equal(hidden.zone_id, spec.hidden.zone_id);
    assert.equal(projected.current_goal_target, null);
    for (const lang of ['zh', 'en']) {
      const label = (lang === 'en' ? run.case_data.en : run.case_data).scene.zones[spec.hidden.zone_id].label;
      assert.equal(hidden.zone_label[lang], label);
      assert.match(projected.current_goal[lang], lang === 'zh' ? /证词/ : /testimony/);
      assert.equal(projected.current_goal[lang].includes(lang === 'zh' ? spec.hidden.label.zh : spec.hidden.label.en), false);
      assert.equal(projected.hint.direction[lang], projected.current_goal[lang]);
      assert.equal(JSON.stringify(projected).includes(spec.hidden.result[lang]), false);
    }
    run = inspectTarget(run, { ...hidden, method_id: spec.hidden.method_id || 'verify_source' }).run;
    assert.equal(publicRun(run).investigation.current_goal_target, null);
  }
});

test('public investigation goals advance through testimony, reconstruction, links and report without revealing answers', () => {
  let run = allCore(fresh('Lvl_01'));
  const spec = getInvestigationContent(run.case_id);
  let projected = publicRun(run).investigation;
  assert.match(projected.current_goal.zh, /证词/);
  assert.equal(projected.current_goal_target, null);
  assert.equal(JSON.stringify(projected.current_goal).includes(spec.hidden.result.zh), false);

  run.investigation.testimony_stages = Object.fromEntries(run.case_data.npcs.map(npc => [npc.npc_id, 2]));
  projected = publicRun(run).investigation;
  assert.match(projected.current_goal.zh, /专属核验/);

  run.investigation.puzzle_completed = true;
  projected = publicRun(run).investigation;
  assert.match(projected.current_goal.zh, /推理连线/);

  run.investigation.propositions = [{ id: 'public-a' }, { id: 'public-b' }];
  projected = publicRun(run).investigation;
  assert.match(projected.current_goal.zh, /结案报告/);
  assert.equal(JSON.stringify(projected.current_goal).includes(spec.hidden.result.zh), false);
});

test('each acquired independent hidden record supports its corresponding fact, while unknown records cannot be linked and repeats do not alter grading', () => {
  const corresponding = { Lvl_01: 'c_05', Lvl_02: 'd_03', Lvl_03: 'e_02', Lvl_04: 'f_04',
    Lvl_05: 'g_06', Lvl_06: 'h_03', Lvl_07: 'i_01', Lvl_08: 'j_03' };
  for (const caseId of INVESTIGATION_CASE_IDS) {
    let run = allCore(fresh(caseId));
    const spec = getInvestigationContent(caseId);
    const command = { type: 'link', clue_ids: [spec.hidden.clue_id, corresponding[caseId]], relation_type: 'supports' };
    reject(run, command, 'INVALID_CLUES');
    assert.equal(run.investigation.propositions.length, 0);
    const hidden = publicRun(run).investigation.targets.find(target => target.target_id === spec.hidden.target_id);
    assert.ok(hidden, 'An unlocked object is observable, but its independent evidence is still not acquired.');
    run = settleCrisis(inspectTarget(run, { ...hidden, method_id: spec.hidden.method_id || 'verify_source' }).run);
    const before = { ap: run.state.action_points_left, turn: run.state.turn_count, fragments: run.truth_fragments,
      clues: [...run.state.unlocked_clues], stamina: { ...run.state.agent_stamina } };
    const grade = act(run, reportCommand(run)).result.score;
    const linked = act(run, command);
    assert.equal(linked.result.is_valid, true, caseId);
    assert.equal(linked.run.truth_fragments, before.fragments + 1);
    assert.equal(linked.run.investigation.propositions.at(-1).alternative, false);
    assert.equal(linked.run.investigation.propositions.filter(item => item.alternative).length, 0);
    assert.equal(linked.run.state.action_points_left, before.ap);
    assert.equal(linked.run.state.turn_count, before.turn);
    assert.deepEqual(linked.run.state.unlocked_clues, before.clues);
    assert.deepEqual(linked.run.state.agent_stamina, before.stamina);
    assert.equal(act(linked.run, reportCommand(linked.run)).result.score, grade);
    for (const clue_ids of [command.clue_ids, [...command.clue_ids].reverse()]) {
      const repeated = act(linked.run, { ...command, clue_ids });
      assert.equal(repeated.result.repeated, true);
      assert.equal(repeated.run.truth_fragments, before.fragments + 1);
      assert.equal(repeated.run.investigation.propositions.length, 1);
    }
  }
});

test('gentle and direct questioning have distinct reactions while matching evidence progresses even at zero ability', () => {
  let run = allCore(fresh());
  const spec = getInvestigationContent(run.case_id);
  const npc_id = Object.keys(spec.testimonies)[0];
  run = travelTo(run, spec.npc_zones[npc_id]);
  const reactions = [];
  for (const tone of ['gentle', 'firm']) {
    const offered = act(run, { type: 'interrogation_options', npc_id });
    const executor_agent_id = Object.keys(offered.result.packs)[0];
    const selected = offered.result.packs[executor_agent_id].questions.find(item => item.tone === tone);
    const outcome = act(offered.run, { type: 'question', npc_id, executor_agent_id, question_id: selected.questionId });
    reactions.push(outcome.result.response);
    assert.equal(outcome.result.testimony_stage, 0);
    assert.equal(outcome.result.progressed, false);
    run = settleCrisis(outcome.run);
  }
  assert.notEqual(reactions[0], reactions[1]);
  const offered = act(run, { type: 'interrogation_options', npc_id });
  const executor_agent_id = Object.keys(offered.result.packs).sort((a, b) => run.state.agent_stamina[b] - run.state.agent_stamina[a])[0];
  const selected = offered.result.packs[executor_agent_id].questions.find(item => item.tone === 'evidence');
  const outcome = act(offered.run, { type: 'question', npc_id, executor_agent_id, question_id: selected.questionId });
  assert.equal(outcome.result.testimony_stage, 1);
  assert.equal(outcome.result.response, spec.testimonies[npc_id][0].response.zh);
});

test('delayed evidence crises cost credibility but retain all originals and the ability to finish', () => {
  let run = allCore(fresh());
  const clue_id = run.state.unlocked_clues[0];
  run.state.evidence_crisis = { clue_id, keyword: 'retained-original', deadline: run.state.turn_count };
  const before = run.state.reputation;
  run = settleCrisis(act(run, { type: 'rest' }).run);
  assert.equal(run.state.unlocked_clues.includes(clue_id), true);
  assert.deepEqual(run.state.destroyed_clue_ids, []);
  assert.equal(run.state.evidence_crisis, null);
  assert.ok(run.state.reputation <= before - 5);
  assert.equal(act(run, reportCommand(run)).run.status, 'completed');
});

test('evidence deferral feedback states the actual deadline penalty and free review does not cancel it', () => {
  for (const lang of ['zh', 'en']) {
    const spec = getInvestigationContent('Lvl_01');
    const target = spec.targets.find(item => item.zone_id === fresh().state.current_zone);
    let issued;
    for (let index = 0; index < 60; index++) {
      let candidate = fresh();
      candidate.id = `v2-defer-rule-copy-${lang}-${index}`;
      candidate.next_crisis_turn = 1;
      candidate = inspectTarget(candidate, target, null, target.method_id, lang).run;
      if (candidate.pending_crisis?.type === 'evidence') { issued = candidate; break; }
    }
    assert.ok(issued);
    assert.match(issued.pending_crisis.choices.find(choice => choice.id === 'defer').desc,
      lang === 'zh' ? /免费复查不会取消/ : /Free review does not cancel/);
    const deferred = act(issued, { type: 'crisis', option_id: 'defer', lang });
    let run = deferred.run;
    const crisis = structuredClone(run.state.evidence_crisis);
    assert.ok(deferred.result.resultText.includes(String(crisis.deadline)));
    assert.match(deferred.result.resultText, lang === 'zh' ? /信誉 -5、混乱 \+5/ : /costs 5 reputation and adds 5 confusion/);
    assert.match(deferred.result.resultText, lang === 'zh' ? /免费复查不会取消/ : /Free review does not cancel/);
    const reviewed = inspectTarget(run, target, null, target.method_id, lang);
    assert.equal(reviewed.result.review, true);
    assert.deepEqual(reviewed.run.state.evidence_crisis, crisis);
    assert.equal(reviewed.run.state.turn_count, run.state.turn_count);
    run = reviewed.run;
    run.next_crisis_turn = 1000;
    const reputation = run.state.reputation;
    while (run.state.turn_count <= crisis.deadline) run = act(run, { type: 'rest', lang }).run;
    assert.equal(run.state.evidence_crisis, null);
    assert.equal(run.state.reputation, reputation - 5);
    assert.ok(run.state.confusion_score >= 5);
    assert.equal(run.state.unlocked_clues.includes(crisis.clue_id), true);
    assert.deepEqual(run.state.destroyed_clue_ids, []);
  }
});

test('all v2 crisis types explain costs and risks in both languages without inventing prior testimony', () => {
  for (const lang of ['zh', 'en']) {
    const seen = new Set();
    for (let index = 0; index < 60 && seen.size < 3; index++) {
      const run = fresh();
      run.id = `v2-crisis-copy-${lang}-${index}`;
      run.next_crisis_turn = 1;
      const target = getInvestigationContent(run.case_id).targets.find(item => item.zone_id === run.state.current_zone);
      const issued = inspectTarget(run, target, null, target.method_id, lang).run;
      const event = issued.pending_crisis;
      assert.ok(event.desc);
      seen.add(event.type);
      for (const choice of event.choices) {
        assert.ok(choice.desc.includes(`${choice.ap_cost} AP`), `${lang} ${event.type} ${choice.id}: missing exact AP cost`);
        assert.ok(choice.risk);
        assert.match(choice.riskColor, /^#[0-9a-f]{6}$/i);
        const resolved = act(issued, { type: 'crisis', option_id: choice.id, lang });
        assert.equal(resolved.run.pending_crisis, null);
        assert.equal(resolved.run.state.action_points_left, issued.state.action_points_left - choice.ap_cost);
        assert.equal(resolved.run.state.unlocked_clues.includes(target.clue_id), true);
      }
      if (event.type === 'npc_recant') {
        assert.ok(lang === 'zh' ? event.desc.includes('还没有正式询问') : event.desc.includes('have not formally questioned'));
        assert.equal(lang === 'zh' ? event.title.includes('翻供') : event.title.includes('RETRACT'), false);
      }
    }
    assert.equal(seen.size, 3, `${lang} must verify each crisis type`);
  }
  const legacy = fresh('Lvl_01', 1);
  legacy.next_crisis_turn = 1;
  const offered = act(legacy, { type: 'decision_options' }).run;
  const card = Object.values(offered.decision_options.packs)[0].cards[0];
  const unchanged = act(offered, { type: 'round', option_id: card.optionId }).run.pending_crisis;
  assert.equal(unchanged.desc, undefined, 'Legacy crisis projection must stay frozen.');
  assert.equal(unchanged.choices[0].riskColor, undefined);
});

test('English v2 evidence crises use earned English labels when created and when resolving a restored Chinese event', () => {
  const base = allCore(fresh('Lvl_07'));
  const expected = new Set(['i_03', 'i_05']);
  const seen = new Set();
  for (let index = 0; index < 200 && seen.size < expected.size; index++) {
    let run = structuredClone(base);
    run.id = `v2-earned-crisis-language-${index}`;
    run.pending_crisis = null;
    run.next_crisis_turn = run.state.turn_count + 1;
    run = act(run, { type: 'rest', lang: 'en' }).run;
    const event = run.pending_crisis;
    if (event.type !== 'evidence' || !expected.has(event.payload.clue_id)) continue;
    seen.add(event.payload.clue_id);
    const zh = run.case_data.clue_dictionary.find(clue => clue.clue_id === event.payload.clue_id).keyword;
    const en = run.case_data.en.clue_dictionary.find(clue => clue.clue_id === event.payload.clue_id).keyword;
    assert.equal(event.payload.keyword, en);
    assert.ok(event.desc.includes(en));
    assert.equal(event.desc.includes(zh), false);
    assert.doesNotMatch(event.desc, /[\u3400-\u9fff]/u);
    // A saved event may have been issued before the player switched language.
    run.pending_crisis.payload.keyword = zh;
    const secured = act(run, { type: 'crisis', option_id: 'secure_now', lang: 'en' });
    assert.ok(secured.result.resultText.includes(en));
    assert.equal(secured.result.resultText.includes(zh), false);
    assert.doesNotMatch(secured.result.resultText, /[\u3400-\u9fff]/u);
    assert.equal(secured.run.state.unlocked_clues.includes(event.payload.clue_id), true);
  }
  assert.deepEqual([...seen].sort(), [...expected].sort());
});

test('incorrect puzzle answers permit retry, and completed reconstructions can be reviewed without a second cost', () => {
  let run = allCore(fresh());
  const spec = getInvestigationContent(run.case_id).puzzle;
  let offered = act(run, { type: 'puzzle_options' });
  const wrong = spec.type === 'compare' ? [spec.items.find(item => !spec.answer.includes(item.id))?.id || spec.answer[0]]
    : [...spec.answer].reverse();
  const failed = act(offered.run, { type: 'puzzle', answer_ids: wrong });
  assert.equal(failed.result.correct, false);
  assert.equal(failed.run.state.confusion_score - offered.run.state.confusion_score,
    publicRun(offered.run).investigation.cost_rules.unsuccessful_reconstruction_confusion);
  run = settleCrisis(failed.run);
  offered = act(run, { type: 'puzzle_options' });
  const success = act(offered.run, { type: 'puzzle', answer_ids: spec.answer });
  assert.equal(success.result.correct, true);
  run = settleCrisis(success.run);
  const before = JSON.stringify(run.state);
  offered = act(run, { type: 'puzzle_options' });
  const review = act(offered.run, { type: 'puzzle', answer_ids: spec.answer });
  assert.equal(review.result.review, true);
  assert.equal(JSON.stringify(review.run.state), before);
});

test('reconstruction quotes the actual first eligible investigator, recovery threshold, precise costs and free completed review', () => {
  for (const lang of ['zh', 'en']) {
    let run = allCore(fresh());
    run.next_crisis_turn = 1000;
    const ids = run.team_config.team.map(agent => agent.agent_id);
    run.state.agent_stamina = { [ids[0]]: 5, [ids[1]]: 6, [ids[2]]: 80 };
    const expectedQuote = { ap_cost: 1, stamina_cost: 10, executor_agent_id: ids[1] };
    const quoteFields = puzzle => Object.fromEntries(Object.keys(expectedQuote).map(key => [key, puzzle[key]]));
    assert.deepEqual(quoteFields(publicRun(run).investigation.puzzle), expectedQuote);
    let offered = act(run, { type: 'puzzle_options', lang });
    assert.deepEqual(quoteFields(offered.result.puzzle), expectedQuote);
    const beforeAp = offered.run.state.action_points_left;
    const beforeTurns = offered.run.state.turn_count;
    const completed = act(offered.run, { type: 'puzzle', answer_ids: getInvestigationContent(run.case_id).puzzle.answer, lang });
    assert.equal(completed.result.correct, true);
    assert.equal(completed.run.state.command_state.active_agent_id, ids[1]);
    assert.equal(completed.run.state.action_points_left, beforeAp - expectedQuote.ap_cost);
    assert.equal(completed.run.state.turn_count, beforeTurns + 1);
    assert.deepEqual(completed.run.state.agent_stamina, { [ids[0]]: 9, [ids[1]]: 0, [ids[2]]: 84 });
    run = completed.run;
    run.state.action_points_left = 0;
    run.state.agent_stamina = Object.fromEntries(ids.map(id => [id, 0]));
    const freeQuote = { ap_cost: 0, stamina_cost: 0, executor_agent_id: null };
    assert.deepEqual(quoteFields(publicRun(run).investigation.puzzle), freeQuote);
    offered = act(run, { type: 'puzzle_options', lang });
    assert.deepEqual(quoteFields(offered.result.puzzle), freeQuote);
    const before = JSON.stringify(offered.run.state);
    const reviewed = act(offered.run, { type: 'puzzle', answer_ids: getInvestigationContent(run.case_id).puzzle.answer, lang });
    assert.equal(reviewed.result.review, true);
    assert.equal(JSON.stringify(reviewed.run.state), before);
    run = allCore(fresh());
    run.state.agent_stamina = Object.fromEntries(ids.map(id => [id, 5]));
    assert.deepEqual(quoteFields(publicRun(run).investigation.puzzle), { ...expectedQuote, executor_agent_id: null });
    offered = act(run, { type: 'puzzle_options', lang });
    assert.deepEqual(quoteFields(offered.result.puzzle), { ...expectedQuote, executor_agent_id: null });
    reject(offered.run, { type: 'puzzle', answer_ids: getInvestigationContent(run.case_id).puzzle.answer, lang }, 'INSUFFICIENT_AGENT_STAMINA');
  }
});

test('report grades require evidence in the correct dimensions; incorrect reports remain amendable and compatible aliases work', () => {
  let run = allCore(fresh());
  const spec = getInvestigationContent(run.case_id);
  const command = reportCommand(run);
  const insufficient = { ...command, evidence_by_dimension: { ...command.evidence_by_dimension, method: [] } };
  const rejected = act(run, insufficient);
  assert.equal(rejected.run.status, 'active');
  assert.equal(rejected.result.score, 'D');
  assert.deepEqual(rejected.result.missing_dimensions, ['method']);
  assert.ok(rejected.result.critique.includes('手段'));
  run = rejected.run;
  for (const conclusion_id of Object.keys(spec.report.wrong_outcomes)) {
    const wrong = act(run, { ...command, conclusion_id });
    assert.equal(wrong.run.status, 'active');
    assert.equal(wrong.result.wrong_outcome, spec.report.wrong_outcomes[conclusion_id].zh);
  }
  const concluded = act(run, command).run;
  assert.equal(concluded.judge_result.score, 'C');
  assert.equal(deriveRunSummary(concluded).score, 'C');
  const accepted = Array.isArray(spec.report.answers.conclusion_id) ? spec.report.answers.conclusion_id : [spec.report.answers.conclusion_id];
  for (const conclusion_id of accepted) assert.equal(act(run, { ...command, conclusion_id }).run.status, 'completed');
  const tampered = JSON.parse(JSON.stringify(concluded));
  tampered.final_report.evidence_by_dimension.method = [];
  assert.throws(() => deriveRunSummary(tampered), /RUN_NOT_COMPLETE/);
});

test('report requires a complete causal chain in each dimension rather than one suggestive clue', () => {
  const run = allCore(fresh());
  const command = reportCommand(run);
  for (const dimension of dimensions) {
    assert.ok(command.evidence_by_dimension[dimension].length >= 2, `${dimension} must have a corroborated chain`);
    const partial = { ...command, evidence_by_dimension: { ...command.evidence_by_dimension,
      [dimension]: command.evidence_by_dimension[dimension].slice(0, 1) } };
    const rejected = act(run, partial);
    assert.equal(rejected.result.is_passed, false);
    assert.equal(rejected.result.score, 'D');
    assert.equal(rejected.run.status, 'active');
    assert.deepEqual(rejected.result.missing_dimensions, [dimension]);
    const amended = act(rejected.run, command);
    assert.equal(amended.result.score, 'C');
    assert.equal(deriveRunSummary(amended.run).is_passed, true);
  }
});

test('an insufficient report explains four evidentiary roles without naming undiscovered records or answers', () => {
  for (const lang of ['zh', 'en']) {
    let run = fresh();
    const spec = getInvestigationContent(run.case_id);
    const first = spec.targets.find(target => target.zone_id === run.state.current_zone);
    run = settleCrisis(inspectTarget(run, first).run);
    const options = act(run, { type: 'report_options', lang });
    assert.deepEqual(Object.keys(options.result.dimension_guidance), dimensions);
    const rejected = act(options.run, { ...reportCommand(options.run), lang });
    assert.equal(rejected.result.score, 'D');
    assert.equal(rejected.run.status, 'active');
    assert.deepEqual(rejected.result.missing_dimensions, dimensions);
    for (const pattern of lang === 'zh' ? [/机会：/, /手段：/, /动机：/, /时间线：/, /原始时钟/]
      : [/Opportunity:/, /Method:/, /Motive:/, /Timeline:/, /original clocks/]) assert.match(rejected.result.critique, pattern);
    for (const target of spec.targets.filter(target => target !== first)) {
      assert.equal(rejected.result.critique.includes(target.result[lang]), false);
      assert.equal(rejected.result.critique.includes(target.label[lang]), false);
    }
    assert.equal(rejected.result.critique.includes(spec.hidden.result[lang]), false);
  }
});

test('settlement judges grouped evidence against preserved clues and cannot accept a destroyed item omitted from the flat list', () => {
  const active = allCore(fresh());
  const completed = act(active, reportCommand(active)).run;
  const lost = completed.final_report.evidence_by_dimension.method[0];
  completed.state.destroyed_clue_ids = [lost];
  completed.final_report.evidence_ids = completed.final_report.evidence_ids.filter(id => id !== lost);
  assert.throws(() => deriveRunSummary(completed), error => error.code === 'INVALID_EVIDENCE');
});

test('hidden evidence requires original deadline and prerequisites plus an independent check; verified alternatives raise A then S', () => {
  let run = fresh();
  const spec = getInvestigationContent(run.case_id);
  reject(run, { type: 'inspect_options', target_id: spec.hidden.target_id }, 'TARGET_LOCKED');
  run = allCore(run);
  const offered = act(run, { type: 'puzzle_options' });
  run = settleCrisis(act(offered.run, { type: 'puzzle', answer_ids: spec.puzzle.answer }).run);
  for (const relation of spec.relations.filter(item => item.alternative)) {
    run = act(run, { type: 'link', clue_ids: [relation.a, relation.b], relation_type: relation.relation }).run;
  }
  assert.equal(act(run, reportCommand(run)).result.score, 'A');
  while (run.state.turn_count < spec.hidden.unlock_turn) run = settleCrisis(act(run, { type: 'rest' }).run);
  const hidden = publicRun(run).investigation.targets.find(target => target.target_id === spec.hidden.target_id);
  assert.ok(hidden);
  assert.equal(run.state.unlocked_clues.includes(spec.hidden.clue_id), false);
  const target = { ...hidden, method_id: spec.hidden.method_id || 'verify_source' };
  run = inspectTarget(run, target).run;
  run = settleCrisis(run);
  assert.equal(run.state.unlocked_clues.includes(spec.hidden.clue_id), true);
  const completed = act(run, reportCommand(run)).run;
  assert.equal(completed.judge_result.score, 'S');
  assert.equal(deriveRunSummary(completed).score, 'S');
});

test('v2 command validation rejects malformed dimension maps, duplicate items and private hints', () => {
  const invalid = [
    { type: 'inspect_options', target_id: 'target_c_01', clue_id: 'c_01' },
    { type: 'inspect', option_id: 'offered', executor_agent_id: 'NEXUS-01' },
    { type: 'puzzle', answer_ids: ['a', 'a'] },
    { type: 'link', clue_ids: ['c_01', 'c_02'], relation_type: 'causes' },
    { ...reportCommand(fresh()), evidence_by_dimension: { opportunity: [], method: [], motive: [], timeline: [], secret: [] } },
    { ...reportCommand(fresh()), evidence_by_dimension: { opportunity: ['c_01', 'c_01'], method: [], motive: [], timeline: [] } },
  ];
  for (const command of invalid) assert.throws(() => validateRunCommand(command, 2));
});

test('Cloudflare profile capabilities, v2 command replay, refresh and dual-tab conflicts retain one authoritative charge', async () => {
  const DB = authorityDB();
  const env = { DB };
  const status = await (await handleProfileFunction(request({ action: 'status' }), env, session)).json();
  assert.deepEqual(status.supported_investigation_versions, [1, 2]);
  const startBody = { action: 'command', expected_revision: 0, operation_id: 'v2-profile-start-operation-01',
    command: { type: 'start_case', case_id: 'Lvl_01', investigation_version: 2 } };
  const started = await (await handleProfileFunction(request(startBody), env, session)).json();
  const run = started.result.run;
  assert.equal(run.investigation_version, 2);
  assert.equal(started.profile.energy, 100);
  const replayedStart = await (await handleProfileFunction(request(startBody), env, session)).json();
  assert.equal(replayedStart.replayed, true);
  assert.equal(replayedStart.profile.energy, 100);
  const target = getInvestigationContent(run.case_id).targets.find(item => item.zone_id === run.state.current_zone);
  const command = async (body) => {
    const response = await handleRunFunction(request({ action: 'command', run_id: run.id, ...body }), env, session);
    return { status: response.status, ...(await response.json()) };
  };
  const offered = await command({ expected_revision: 0, operation_id: 'v2-inspect-offer-operation-01', command: { type: 'inspect_options', target_id: target.target_id } });
  assert.equal(offered.status, 200);
  const card = Object.values(offered.result.packs)[0].cards.find(item => item.method_id === target.method_id);
  const body = { expected_revision: offered.run.revision, operation_id: 'v2-inspect-commit-operation-01', command: { type: 'inspect', option_id: card.option_id } };
  const inspected = await command(body);
  assert.equal(inspected.run.state.action_points_left, 19);
  const replayed = await command(body);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.run.state.action_points_left, 19);
  const stale = await command({ ...body, operation_id: 'v2-inspect-second-tab-operation-01' });
  assert.equal(stale.status, 409);
  assert.equal(stale.code, 'STALE_RUN');
  const refreshed = await (await handleRunFunction(request({ action: 'status', run_id: run.id }), env, session)).json();
  assert.deepEqual(refreshed.run, inspected.run);
  assert.equal(DB.count('run_operations'), 2);
  const row = DB.sqlite.prepare('SELECT * FROM player_runs WHERE user_id = ? AND id = ?').get(USER_ID, run.id);
  assert.equal(storedRun(row).investigation.completed_checks.length, 1);
});

test('a paid legacy investigation remains byte-for-byte unchanged when v2 capabilities are read or a replacement start is rejected', async () => {
  const DB = authorityDB();
  const send = async body => (await handleProfileFunction(request(body), { DB }, session)).json();
  const started = await send({ action: 'command', expected_revision: 0, operation_id: 'legacy-start-before-upgrade-01',
    command: { type: 'start_case', case_id: 'Lvl_01' } });
  const id = started.result.run.id;
  const before = DB.sqlite.prepare('SELECT run_json, run_revision FROM player_runs WHERE id = ?').get(id);
  const status = await send({ action: 'status' });
  assert.deepEqual(status.supported_investigation_versions, [1, 2]);
  assert.equal(status.active_run.investigation, undefined);
  assert.equal(status.active_run.investigation_version, undefined);
  const blocked = await send({ action: 'command', expected_revision: 1, operation_id: 'v2-replacement-of-legacy-01',
    command: { type: 'start_case', case_id: 'Lvl_02', investigation_version: 2 } });
  assert.equal(blocked.result.error, 'active_run_exists');
  assert.equal(blocked.active_run.id, id);
  assert.equal(blocked.active_run.case_id, 'Lvl_01');
  assert.equal(blocked.profile.energy, started.profile.energy);
  assert.equal(blocked.active_run.investigation, undefined);
  assert.deepEqual(DB.sqlite.prepare('SELECT run_json, run_revision FROM player_runs WHERE id = ?').get(id), before);
  assert.equal(DB.count('player_runs'), 1);
});

test('new investigations publish bounded correction and action costs while restored old runs keep their original policy', () => {
  const current = fresh();
  assert.equal(current.investigation.balance_revision, 2);
  assert.equal(current.investigation.evidence_correction_used, false);
  assert.equal(publicRun(current).investigation.balance_revision, 2);
  assert.deepEqual(publicRun(current).investigation.cost_rules, {
    unsuccessful_inspection_confusion: 3, unsuccessful_reconstruction_confusion: 3,
  });
  for (const ap of [20, 5, 0]) {
    current.state.action_points_left = ap;
    const policy = act(current, { type: 'report_options' }).result.report_policy;
    assert.equal(policy.balance_revision, 2);
    assert.equal(policy.evidence_correction_available, true);
    assert.deepEqual(policy.evidence_rejection_penalty, { apLoss: 0, reputationLoss: 0, confusionIncrease: 0 });
    assert.deepEqual(policy.evidence_rejection_penalty_after_correction,
      { apLoss: ap > 0 ? 1 : 0, reputationLoss: 8, confusionIncrease: 4 });
    assert.deepEqual(policy.conclusion_rejection_penalty, getRejectedReportPenalty(current.state));
    assert.deepEqual(publicRun(current).investigation.report_policy, policy);
  }
  const old = structuredClone(current);
  delete old.investigation.balance_revision;
  delete old.investigation.evidence_correction_used;
  old.next_crisis_turn = 5;
  const before = JSON.stringify(old);
  assert.equal(publicRun(old).investigation.balance_revision, 1);
  assert.equal(publicRun(old).investigation.report_policy, undefined);
  assert.equal(act(old, { type: 'report_options' }).result.report_policy, undefined);
  assert.equal(JSON.stringify(old), before, 'Reading capabilities cannot migrate a stored run or its crisis schedule.');
});

test('crisis pacing and quoted prices dispatch by persisted balance revision without repricing a pending event', () => {
  for (const mode of ['new', 'old-v2', 'v1']) {
    const run = fresh('Lvl_01', mode === 'v1' ? 1 : 2);
    if (mode === 'old-v2') delete run.investigation.balance_revision;
    run.state.unlocked_clues = ['c_01'];
    const seen = new Set();
    for (let index = 0; index < 100 && seen.size < 2; index++) {
      run.id = `v2-balance-crisis-${mode}-${index}`;
      run.state.turn_count = 7;
      const interval = nextRunCrisisTurn(run) - run.state.turn_count;
      assert.ok(interval >= (mode === 'new' ? 6 : 4) && interval <= (mode === 'new' ? 8 : 6));
      const event = createRunCrisis(run, 'zh');
      if (event.type === 'npc_recant') continue;
      seen.add(event.type);
      const optionId = event.type === 'evidence' ? 'secure_now' : 'evade';
      const cost = mode === 'new' ? (event.type === 'evidence' ? 2 : 1) : (event.type === 'evidence' ? 3 : 2);
      assert.equal(event.choices.find(choice => choice.id === optionId).ap_cost, cost);
      for (const lang of ['zh', 'en']) {
        const branch = structuredClone(run);
        // A pending event's stored quote remains authoritative across a refresh.
        branch.pending_crisis = event;
        branch.next_crisis_turn = 19;
        const result = act(JSON.parse(JSON.stringify(branch)), { type: 'crisis', option_id: optionId, lang });
        assert.equal(result.run.state.action_points_left, 20 - cost);
        assert.equal(result.run.next_crisis_turn, 19);
        assert.ok(result.result.resultText.includes(`AP -${cost}`));
        assert.equal(result.run.state.turn_count, 7);
      }
    }
    assert.equal(seen.size, 2);
  }
  const run = fresh();
  run.state.unlocked_clues = ['c_01'];
  run.pending_crisis = { type: 'evidence', payload: { clue_id: 'c_01', keyword: '原始记录' },
    choices: [{ id: 'secure_now', ap_cost: 3 }, { id: 'defer', ap_cost: 0 }] };
  const result = act(JSON.parse(JSON.stringify(run)), { type: 'crisis', option_id: 'secure_now', lang: 'en' });
  assert.equal(result.run.state.action_points_left, 17);
  assert.match(result.result.resultText, /AP -3/);
});

test('only evidence-only rejections consume the single free correction, which survives restore and never advances time', () => {
  let run = allCore(fresh());
  const command = reportCommand(run);
  const insufficient = { ...command, evidence_by_dimension: { ...command.evidence_by_dimension, method: [] } };
  const spec = getInvestigationContent(run.case_id);
  for (const [index, conclusion_id] of Object.keys(spec.report.wrong_outcomes).entries()) {
    const wrong = act(run, { ...insufficient, conclusion_id });
    assert.deepEqual(wrong.result.penalty, { ...getRejectedReportPenalty(run.state),
      ...(index === 0 ? { reputationLoss: 12 } : { confusionIncrease: 7 }) });
    assert.equal(wrong.run.investigation.evidence_correction_used, false);
    const repeatedWrong = act(wrong.run, { ...insufficient, conclusion_id });
    assert.deepEqual(repeatedWrong.result.penalty, getRejectedReportPenalty(wrong.run.state), 'The extra accusation penalty is one-time.');
  }
  for (const field of ['method', 'motive', 'timeline']) {
    const option = spec.report[`${field}s`].find(item => item.id !== command[`${field}_id`]);
    const wrong = act(run, { ...insufficient, [`${field}_id`]: option.id });
    assert.deepEqual(wrong.result.penalty, getRejectedReportPenalty(run.state));
    assert.equal(wrong.run.investigation.evidence_correction_used, false, `Wrong ${field} cannot receive a free correction.`);
  }
  const before = { ...run.state };
  const first = act(run, insufficient);
  assert.equal(first.run.investigation.evidence_correction_used, true);
  assert.deepEqual(first.result.penalty, { apLoss: 0, reputationLoss: 0, confusionIncrease: 0 });
  assert.deepEqual(first.run.state, before);
  run = JSON.parse(serialize(first.run, MAX_RUN_BYTES));
  const policy = act(run, { type: 'report_options' }).result.report_policy;
  assert.equal(policy.evidence_correction_available, false);
  assert.deepEqual(publicRun(run).investigation.report_policy, policy);
  assert.deepEqual(policy.evidence_rejection_penalty, { apLoss: 1, reputationLoss: 8, confusionIncrease: 4 });
  const second = act(run, insufficient);
  assert.deepEqual(second.result.penalty, policy.evidence_rejection_penalty);
  assert.equal(second.run.state.turn_count, run.state.turn_count);
  assert.equal(second.run.next_crisis_turn, run.next_crisis_turn);
  run = second.run;
  run.state.action_points_left = 0;
  const zero = act(run, insufficient);
  assert.equal(zero.result.penalty.apLoss, 0);
  assert.equal(zero.result.penalty.reputationLoss, 8);
  assert.equal(act(zero.run, command).run.status, 'completed', 'Correcting a fully investigated report never requires AP.');
  const old = allCore(fresh());
  delete old.investigation.balance_revision;
  delete old.investigation.evidence_correction_used;
  const legacyRejected = act(old, insufficient);
  assert.deepEqual(legacyRejected.result.penalty, getRejectedReportPenalty(old.state));
  assert.equal(legacyRejected.run.investigation.evidence_correction_used, undefined);
});

test('an available hidden object never displaces a reachable core object, including one in another area', () => {
  let run = allCore(fresh());
  const spec = getInvestigationContent(run.case_id);
  const hiddenZone = spec.hidden.zone_id;
  run = travelTo(run, hiddenZone);
  const target = spec.targets.find(item => item.zone_id !== hiddenZone);
  run.investigation.completed_checks = run.investigation.completed_checks.filter(item => item.target_id !== target.target_id);
  const projected = publicRun(run).investigation;
  assert.ok(projected.targets.some(item => item.hidden));
  assert.equal(projected.current_goal_target.target_id, target.target_id);
  for (const lang of ['zh', 'en']) {
    assert.ok(projected.current_goal[lang].includes(projected.current_goal_target.zone_label[lang]));
    assert.equal(projected.current_goal[lang].includes(spec.hidden.label[lang]), false);
  }
});

for (const caseId of INVESTIGATION_CASE_IDS) {
  for (const configuration of ['zero-ability', 'default-team']) {
    test(`${caseId} ${configuration}: 20 AP covers full investigation, a wrong check, two paid preservation crises and one report correction`, (t) => {
      let run = fresh(caseId, 2, { minimumAbilities: configuration === 'zero-ability' });
      const initialAp = run.state.action_points_left;
      const spec = applyInspectionContent(run, getInvestigationContent(caseId));
      // Inject the costliest possible pair; separate scheduling tests cover the
      // real 6–8 turn intervals. This fixture must not win on favorable RNG.
      run.next_crisis_turn = 1000;
      const crisisTurns = new Set([6, 12]);
      const preservationRecords = [];
      const secureDue = input => {
        if (!crisisTurns.has(input.state.turn_count)) return input;
        crisisTurns.delete(input.state.turn_count);
        let event;
        for (let index = 0; index < 100; index++) {
          event = createRunCrisis({ ...input, id: `budget-preservation-${index}` }, 'zh');
          if (event.type === 'evidence') break;
        }
        assert.equal(event.type, 'evidence');
        input.pending_crisis = event;
        const secured = act(input, { type: 'crisis', option_id: 'secure_now' });
        preservationRecords.push({ turn: input.state.turn_count,
          ap_cost: input.state.action_points_left - secured.run.state.action_points_left });
        return secured.run;
      };
      const first = spec.targets.find(target => target.zone_id === run.state.current_zone && !(target.required_clues || []).length);
      const wrongMethod = first.methods.find(method => method.id !== first.method_id && !method.finding).id;
      const wrong = inspectTarget(run, first, null, wrongMethod);
      assert.equal(wrong.result.completed, false);
      assert.equal(wrong.run.state.confusion_score, publicRun(run).investigation.cost_rules.unsuccessful_inspection_confusion);
      run = wrong.run;
      const remaining = [...spec.targets];
      while (remaining.length) {
        const index = remaining.findIndex(target => (target.required_clues || []).every(id => run.state.unlocked_clues.includes(id))
          && pathTo(run, target.zone_id));
        assert.notEqual(index, -1);
        run = secureDue(inspectTarget(run, remaining.splice(index, 1)[0]).run);
      }
      for (const [npc_id, stages] of Object.entries(spec.testimonies)) {
        run = travelTo(run, spec.npc_zones[npc_id]);
        for (let index = 0; index < stages.length; index++) {
          const offered = act(run, { type: 'interrogation_options', npc_id });
          run = offered.run;
          const executor_agent_id = Object.keys(offered.result.packs).sort((a, b) => run.state.agent_stamina[b] - run.state.agent_stamina[a])[0];
          const question = offered.result.packs[executor_agent_id].questions.find(item => item.tone === 'evidence');
          assert.equal(question.available, true);
          run = secureDue(act(run, { type: 'question', npc_id, question_id: question.questionId, executor_agent_id }).run);
        }
      }
      const offered = act(run, { type: 'puzzle_options' });
      run = secureDue(act(offered.run, { type: 'puzzle', answer_ids: spec.puzzle.answer }).run);
      assert.equal(crisisTurns.size, 0);
      assert.equal(run.state.turn_count, 16);
      assert.equal(run.state.action_points_left, 0);
      const correct = reportCommand(run);
      const incomplete = { ...correct, evidence_by_dimension: { ...correct.evidence_by_dimension, timeline: [] } };
      const correction = act(run, incomplete);
      assert.deepEqual(correction.result.penalty, { apLoss: 0, reputationLoss: 0, confusionIncrease: 0 });
      assert.equal(correction.run.investigation.evidence_correction_used, true);
      const completed = act(JSON.parse(serialize(correction.run, MAX_RUN_BYTES)), correct);
      assert.equal(completed.result.score, 'B');
      assert.equal(deriveRunSummary(completed.run).is_passed, true);
      assert.equal(completed.run.state.action_points_left, 0);
      assert.equal(preservationRecords.length, 2);
      assert.equal(preservationRecords.reduce((total, item) => total + item.ap_cost, 0), 4);
      assert.equal(wrong.result.ap_cost, 1);
      t.diagnostic(JSON.stringify({ record_type: 'difficulty_budget', case_id: caseId, configuration,
        investigation_version: completed.run.investigation_version,
        balance_revision: completed.run.investigation.balance_revision,
        initial_ap: initialAp, total_ap_cost: initialAp - completed.run.state.action_points_left,
        remaining_ap: completed.run.state.action_points_left, turns: completed.run.state.turn_count,
        grade: completed.result.score, passed: completed.result.is_passed,
        successful_core_checks: completed.run.investigation.completed_checks.length,
        testimony_stages: completed.run.investigation.testimony_stages,
        special_verification_completed: completed.run.investigation.puzzle_completed,
        wrong_inspections: 1, wrong_inspection_ap_cost: wrong.result.ap_cost,
        preservation_crises: preservationRecords, preservation_ap_cost: 4,
        evidence_correction_used: completed.run.investigation.evidence_correction_used,
        evidence_correction_penalty: correction.result.penalty,
        report_attempts: completed.run.report_attempts }));
    });
  }
}

test('free report correction is replayed once, persists on refresh and rejects a competing stale tab', async () => {
  const DB = authorityDB();
  const env = { DB };
  const started = await (await handleProfileFunction(request({ action: 'command', expected_revision: 0,
    operation_id: 'balance-profile-start-01', command: { type: 'start_case', case_id: 'Lvl_01', investigation_version: 2 } }), env, session)).json();
  const id = started.result.run.id;
  const row = DB.sqlite.prepare('SELECT * FROM player_runs WHERE id = ?').get(id);
  const run = allCore(storedRun(row));
  DB.sqlite.prepare('UPDATE player_runs SET run_json = ?, run_revision = ? WHERE id = ?').run(JSON.stringify(run), run.revision, id);
  const correct = reportCommand(run);
  const command = { ...correct, evidence_by_dimension: { ...correct.evidence_by_dimension, method: [] } };
  const body = { action: 'command', run_id: id, expected_revision: run.revision,
    operation_id: 'balance-report-correction-01', command };
  const first = await (await handleRunFunction(request(body), env, session)).json();
  const replay = await (await handleRunFunction(request(body), env, session)).json();
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.replayed, true);
  assert.deepEqual(first.result.penalty, { apLoss: 0, reputationLoss: 0, confusionIncrease: 0 });
  const competing = await handleRunFunction(request({ ...body, operation_id: 'balance-report-other-tab-01' }), env, session);
  assert.equal(competing.status, 409);
  const refreshed = await (await handleRunFunction(request({ action: 'status', run_id: id }), env, session)).json();
  assert.deepEqual(refreshed.run, first.run);
  const policy = await (await handleRunFunction(request({ action: 'command', run_id: id,
    expected_revision: refreshed.run.revision, operation_id: 'balance-report-policy-01', command: { type: 'report_options' } }), env, session)).json();
  assert.equal(policy.result.report_policy.evidence_correction_available, false);
  assert.equal(policy.result.report_policy.evidence_rejection_penalty.apLoss, 1);
  assert.equal(storedRun(DB.sqlite.prepare('SELECT * FROM player_runs WHERE id = ?').get(id)).investigation.evidence_correction_used, true);
  assert.equal(DB.count('run_operations'), 2);
});

test('v2 Cloudflare settlement rejudges grouped evidence and awards exactly once across retries', async () => {
  const DB = authorityDB();
  const send = async body => (await handleProfileFunction(request(body), { DB }, session)).json();
  const started = await send({ action: 'command', expected_revision: 0, operation_id: 'v2-settlement-paid-start-01',
    command: { type: 'start_case', case_id: 'Lvl_01', investigation_version: 2 } });
  const id = started.result.run.id;
  const row = DB.sqlite.prepare('SELECT * FROM player_runs WHERE id = ?').get(id);
  let run = allCore(storedRun(row));
  run = act(run, reportCommand(run)).run;
  DB.sqlite.prepare('UPDATE player_runs SET run_json = ?, run_revision = ? WHERE id = ?').run(JSON.stringify(run), run.revision, id);
  const body = { action: 'command', expected_revision: 1, operation_id: 'v2-settlement-claim-operation-01',
    command: { type: 'settle_case', run_id: id } };
  const settled = await send(body);
  assert.equal(settled.result.summary.score, 'C');
  assert.equal(settled.active_run, null);
  assert.equal(DB.sqlite.prepare('SELECT settled FROM player_runs WHERE id = ?').get(id).settled, 1);
  const replayed = await send(body);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.profile.xp, settled.profile.xp);
  assert.equal(replayed.profile.gold, settled.profile.gold);
  const duplicate = await send({ ...body, expected_revision: 2, operation_id: 'v2-settlement-duplicate-operation-01' });
  assert.equal(duplicate.result.duplicate, true);
  assert.equal(duplicate.profile.xp, settled.profile.xp);
  assert.equal(duplicate.profile.gold, settled.profile.gold);
});
