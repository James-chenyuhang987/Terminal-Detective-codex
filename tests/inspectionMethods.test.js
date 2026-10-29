import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand, publicRun, deriveRunSummary } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { applyInspectionContent, usesScopedInspection, INSPECTION_REVISION } from '../server/investigationV2/inspectionContent.js';
import { serialize, MAX_RUN_BYTES } from '../cloudflare/worker/authorityStore.js';

const NOW = new Date('2026-10-26T12:00:00Z');
let serial = 0;
function fresh({ caseId = 'Lvl_03', effects = {} } = {}) {
  const team = buildTeamConfig();
  team.skill_effects = effects;
  for (const agent of team.team) for (const key of ['logic_power', 'observation_focus', 'hack_level', 'confusion_resistance']) {
    agent[key] = 0;
    agent[`base_${key}`] = 0;
  }
  const run = createRun({ id: `inspection-methods-${++serial}`, caseData: ALL_CASES.find(item => item.case_id === caseId),
    teamConfig: team, now: NOW, investigationVersion: 2 });
  // Isolate inspection outcomes from independently tested periodic crises.
  run.next_crisis_turn = 999;
  return run;
}
const act = (run, command) => applyRunCommand(run, command, NOW);
const specFor = run => applyInspectionContent(run, getInvestigationContent(run.case_id, run.investigation.case_design_revision));
const findingMethod = target => target.methods.find(method => method.finding);
const failedMethod = target => target.methods.find(method => method.id !== target.method_id && !method.finding);
function offer(run, target, methodId = target.method_id, { executor, lang = 'zh' } = {}) {
  const response = act(run, { type: 'inspect_options', target_id: target.target_id, lang });
  const id = executor || Object.keys(response.result.packs).sort((a, b) =>
    run.state.agent_stamina[b] - run.state.agent_stamina[a])[0];
  const card = response.result.packs[id].cards.find(item => item.method_id === methodId);
  assert.ok(card, `${target.target_id} must offer ${methodId}`);
  return { ...response, card };
}
function inspect(run, target, methodId = target.method_id, options = {}) {
  const offered = offer(run, target, methodId, options);
  return { ...act(offered.run, { type: 'inspect', option_id: offered.card.option_id, lang: options.lang || 'zh' }), card: offered.card };
}
function inRoom(run, target) {
  // Unit cases focus on method authority; the full eight-object path below
  // uses real travel commands and public entry requirements instead.
  run.state.current_zone = target.zone_id;
  return run;
}
function reject(run, command, code) {
  const before = JSON.stringify(run);
  assert.throws(() => act(run, command), error => error.code === code && error.status === 400);
  assert.equal(JSON.stringify(run), before, 'rejected commands cannot mutate the saved run');
}
function route(run, zone) {
  const available = publicRun(run).investigation.zone_access;
  const queue = [[run.state.current_zone]];
  const visited = new Set();
  while (queue.length) {
    const path = queue.shift();
    const current = path.at(-1);
    if (current === zone) return path.slice(1);
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [a, b] of run.case_data.zone_connections) {
      const next = a === current ? b : b === current ? a : null;
      if (next && available[next]?.available && !visited.has(next)) queue.push([...path, next]);
    }
  }
  return null;
}

test('Red Butterfly alone opts into scoped inspections and its eight objects retain their complete-proof methods', () => {
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const run = fresh({ caseId });
    const baseline = getInvestigationContent(caseId, run.investigation.case_design_revision);
    const snapshot = JSON.stringify(baseline);
    const spec = specFor(run);
    assert.equal(JSON.stringify(baseline), snapshot, 'new content cannot mutate the frozen case design');
    assert.equal(usesScopedInspection(run), caseId === 'Lvl_03');
    if (caseId !== 'Lvl_03') {
      assert.equal(run.investigation.inspection_revision, undefined);
      assert.deepEqual(spec, baseline);
      continue;
    }
    assert.equal(run.investigation.inspection_revision, INSPECTION_REVISION);
    assert.deepEqual(run.investigation.inspection_findings, []);
    assert.equal(spec.targets.length, 8);
    for (const target of spec.targets) {
      const original = baseline.targets.find(item => item.target_id === target.target_id);
      assert.equal(target.method_id, original.method_id);
      assert.equal(target.action_tag, original.action_tag, 'zone-entry conditions retain their action tags');
      assert.equal(target.clue_id, original.clue_id);
      assert.deepEqual(target.result, original.result);
      assert.equal(target.methods.length, 3);
      assert.equal(target.methods.filter(method => method.finding).length, 1);
      assert.ok(failedMethod(target));
      assert.ok(!target.methods.find(method => method.id === target.method_id).finding);
      for (const lang of ['zh', 'en']) {
        assert.ok(findingMethod(target).finding.result[lang]);
        assert.ok(findingMethod(target).finding.limitation[lang]);
        assert.equal(new Set(target.methods.map(method => method.label[lang])).size, 3);
      }
    }
  }
});

test('missing, unknown and mistyped inspection revisions retain old methods, penalties and public projection', () => {
  for (const revision of [undefined, 0, 2, '1', null]) {
    const run = fresh();
    const scopedTarget = specFor(run).targets[0];
    const method = findingMethod(scopedTarget);
    if (revision === undefined) delete run.investigation.inspection_revision;
    else run.investigation.inspection_revision = revision;
    const baseline = getInvestigationContent(run.case_id, run.investigation.case_design_revision);
    assert.equal(usesScopedInspection(run), false);
    assert.deepEqual(specFor(run), baseline);
    // Even a persisted record must not activate a ruleset whose version is absent.
    run.investigation.inspection_findings = [{ target_id: scopedTarget.target_id, method_id: method.id,
      label: method.label, ...method.finding, paid_ap: 1 }];
    const view = publicRun(run).investigation;
    assert.equal(view.inspection_revision, undefined);
    assert.equal(view.inspection_findings, undefined);
    const target = baseline.targets.find(item => item.target_id === scopedTarget.target_id);
    const checked = inspect(inRoom(run, target), target, method.id);
    assert.equal(checked.card.ap_cost, 1);
    assert.equal(checked.card.review, false);
    assert.equal(checked.result.completed, false);
    assert.equal(checked.run.state.confusion_score, 3);
    assert.deepEqual(checked.run.state.unlocked_clues, []);
    const complete = inspect(checked.run, target);
    assert.equal(complete.card.ap_cost, 1, 'legacy methods cannot inherit a new preliminary-check credit');
    assert.equal(complete.result.completed, true);
  }
});

test('all eight objects support paid preliminary findings then complete proof on actual accessible routes for 8 AP', () => {
  let run = fresh();
  const remaining = [...specFor(run).targets];
  while (remaining.length) {
    const index = remaining.findIndex(target => route(run, target.zone_id)
      && target.required_clues.every(id => run.state.unlocked_clues.includes(id)));
    assert.notEqual(index, -1, 'the next investigation object must be reachable without forged evidence');
    const target = remaining.splice(index, 1)[0];
    for (const zone_id of route(run, target.zone_id)) run = act(run, { type: 'travel', zone_id }).run;
    const before = structuredClone(run);
    const preliminary = inspect(run, target, findingMethod(target).id);
    assert.equal(preliminary.result.completed, false);
    assert.deepEqual(preliminary.result.new_clue_ids, []);
    assert.deepEqual(preliminary.run.state.unlocked_clues, before.state.unlocked_clues);
    assert.equal(preliminary.run.state.action_points_left, before.state.action_points_left - 1);
    assert.equal(preliminary.run.state.turn_count, before.state.turn_count + 1);
    assert.equal(preliminary.run.state.confusion_score, before.state.confusion_score);
    assert.deepEqual(preliminary.run.investigation.completed_checks, before.investigation.completed_checks);
    assert.deepEqual(publicRun(preliminary.run).investigation.zone_access, publicRun(before).investigation.zone_access);
    assert.deepEqual(publicRun(preliminary.run).investigation.story, publicRun(before).investigation.story);
    const record = preliminary.run.investigation.inspection_findings.find(item => item.target_id === target.target_id);
    assert.equal(record.method_id, findingMethod(target).id);
    assert.equal(record.paid_ap, 1);
    assert.deepEqual(record.result, findingMethod(target).finding.result);
    assert.deepEqual(record.limitation, findingMethod(target).finding.limitation);
    const full = inspect(preliminary.run, target);
    assert.equal(full.card.ap_cost, 0);
    assert.equal(full.card.inspection_ap_credit_used, 1);
    assert.equal(full.result.completed, true);
    assert.deepEqual(full.result.new_clue_ids, [target.clue_id]);
    assert.equal(full.run.state.action_points_left, preliminary.run.state.action_points_left);
    assert.equal(full.run.state.turn_count, preliminary.run.state.turn_count + 1);
    run = full.run;
  }
  assert.equal(run.state.action_points_left, 12);
  assert.equal(run.investigation.completed_checks.length, 8);
  assert.equal(run.investigation.inspection_findings.length, 8);
  assert.ok(Buffer.byteLength(serialize(run, MAX_RUN_BYTES)) < MAX_RUN_BYTES);
});

for (const configuration of ['minimum-abilities', 'default-team']) {
  test(`${configuration}: preliminary-first Red Butterfly completes six testimonies, special verification and report with live crises in 15 AP`, (t) => {
    const team = buildTeamConfig();
    if (configuration === 'minimum-abilities') {
      for (const agent of team.team) for (const key of ['logic_power', 'observation_focus', 'hack_level', 'confusion_resistance']) {
        agent[key] = 0;
        agent[`base_${key}`] = 0;
      }
    }
    // Bypass the isolated-unit fixture: retain createRun's real crisis schedule,
    // starting resources and stable seed throughout the complete playthrough.
    let run = createRun({ id: `inspection-full-${configuration}`, caseData: ALL_CASES.find(item => item.case_id === 'Lvl_03'),
      teamConfig: team, now: NOW, investigationVersion: 2 });
    assert.equal(run.state.action_points_left, 20);
    const spec = specFor(run);
    const crises = [];
    function resolvePending() {
      const crisis = publicRun(run).pending_crisis;
      if (!crisis) return;
      const option_id = { evidence: 'defer', npc_recant: 'reinterrogate', tracker: 'hide' }[crisis.type];
      assert.ok(crisis.choices.some(choice => choice.id === option_id && choice.ap_cost === 0),
        'the chosen zero-AP response must be publicly offered');
      const before = run.state.action_points_left;
      crises.push({ type: crisis.type, turn: run.state.turn_count, option_id });
      run = act(run, { type: 'crisis', option_id }).run;
      assert.equal(run.state.action_points_left, before);
    }
    function travelTo(zone) {
      resolvePending();
      const path = route(run, zone);
      assert.ok(path, `no accessible path to ${zone}`);
      for (const zone_id of path) run = act(run, { type: 'travel', zone_id }).run;
    }
    const remaining = [...spec.targets];
    while (remaining.length) {
      resolvePending();
      const index = remaining.findIndex(target => route(run, target.zone_id)
        && target.required_clues.every(id => run.state.unlocked_clues.includes(id)));
      assert.notEqual(index, -1, 'ordinary progression must make every object reachable');
      const target = remaining.splice(index, 1)[0];
      travelTo(target.zone_id);
      const preliminary = inspect(run, target, findingMethod(target).id);
      assert.equal(preliminary.result.finding, true);
      assert.equal(preliminary.result.completed, false);
      run = preliminary.run;
      resolvePending();
      const complete = inspect(run, target);
      assert.equal(complete.result.completed, true);
      assert.equal(complete.card.inspection_ap_credit_used, 1);
      run = complete.run;
    }
    assert.equal(run.investigation.inspection_findings.length, 8);
    assert.equal(run.investigation.completed_checks.length, 8);
    assert.equal(run.state.action_points_left, 12);
    // Refresh after collecting all eight objects, preserving pending crises,
    // paid-credit bookkeeping and the real schedule for subsequent actions.
    run = JSON.parse(serialize(run, MAX_RUN_BYTES));
    for (const [npc_id, testimony] of Object.entries(spec.testimonies)) {
      travelTo(spec.npc_zones[npc_id]);
      for (let stage = 0; stage < testimony.length; stage++) {
        resolvePending();
        const offered = act(run, { type: 'interrogation_options', npc_id });
        const executor_agent_id = Object.keys(offered.result.packs).sort((a, b) =>
          offered.run.state.agent_stamina[b] - offered.run.state.agent_stamina[a])[0];
        const question = offered.result.packs[executor_agent_id].questions.find(item => item.tone === 'evidence');
        assert.equal(question.available, true);
        const answer = act(offered.run, { type: 'question', npc_id, question_id: question.questionId, executor_agent_id });
        assert.equal(answer.result.progressed, true);
        assert.equal(answer.result.testimony_stage, stage + 1);
        run = answer.run;
      }
    }
    resolvePending();
    const puzzleOffer = act(run, { type: 'puzzle_options' });
    const puzzleResult = act(puzzleOffer.run, { type: 'puzzle', answer_ids: spec.puzzle.answer });
    assert.equal(puzzleResult.result.correct, true);
    run = puzzleResult.run;
    resolvePending();
    const answers = Object.fromEntries(Object.entries(spec.report.answers).map(([key, value]) =>
      [key, Array.isArray(value) ? value[0] : value]));
    const completed = act(run, { type: 'report', ...answers, evidence_by_dimension: spec.report.support });
    assert.equal(completed.run.status, 'completed');
    assert.equal(completed.result.is_passed, true);
    assert.equal(completed.result.score, 'B');
    assert.deepEqual(completed.run.investigation.testimony_stages,
      Object.fromEntries(Object.keys(spec.testimonies).map(id => [id, 2])));
    assert.equal(Object.values(completed.run.investigation.testimony_records).flat().length, 6);
    assert.equal(completed.run.investigation.puzzle_completed, true);
    assert.equal(completed.run.state.action_points_left, 5);
    assert.equal(completed.run.state.turn_count, 23);
    assert.ok(crises.length >= 2, 'the playthrough must actually exercise recurring crises');
    assert.deepEqual(completed.run.state.destroyed_clue_ids, []);
    const stored = serialize(completed.run, MAX_RUN_BYTES);
    const restored = JSON.parse(stored);
    assert.equal(deriveRunSummary(restored).is_passed, true);
    assert.equal(deriveRunSummary({ ...restored, status: 'settled' }).score, 'B');
    assert.ok(Buffer.byteLength(stored) < MAX_RUN_BYTES);
    t.diagnostic(JSON.stringify({ case_id: run.case_id, configuration,
      ap_spent: 20 - completed.run.state.action_points_left, turns: completed.run.state.turn_count,
      preliminary_findings: completed.run.investigation.inspection_findings.length,
      complete_checks: completed.run.investigation.completed_checks.length,
      testimony_stages: completed.run.investigation.testimony_stages,
      grade: completed.result.score, saved_bytes: Buffer.byteLength(stored),
      confusion: completed.run.state.confusion_score, reputation: completed.run.state.reputation, crises }));
  });
}

test('preliminary review survives restore, changes of language and executor, and zero resources', () => {
  let run = fresh();
  const target = specFor(run).targets[0];
  const method = findingMethod(target);
  const first = inspect(inRoom(run, target), target, method.id, { executor: run.team_config.team[0].agent_id });
  run = JSON.parse(serialize(first.run, MAX_RUN_BYTES));
  run.state.action_points_left = 0;
  Object.keys(run.state.agent_stamina).forEach(id => { run.state.agent_stamina[id] = 0; });
  const before = structuredClone(run);
  const reviewed = inspect(run, target, method.id, { executor: run.team_config.team[1].agent_id, lang: 'en' });
  assert.equal(reviewed.card.available, true);
  assert.equal(reviewed.card.review, true);
  assert.equal(reviewed.card.ap_cost, 0);
  assert.equal(reviewed.card.stamina_cost, 0);
  assert.equal(reviewed.result.review, true);
  assert.equal(reviewed.result.completed, false);
  assert.equal(reviewed.result.narration, method.finding.result.en);
  assert.deepEqual(reviewed.run.state, before.state, 'review cannot recover stamina, progress time or trigger a crisis');
  assert.deepEqual(reviewed.run.investigation, before.investigation);
  assert.deepEqual(reviewed.result.new_clue_ids, []);
});

test('completion retains only earned preliminary reviews and never opens unearned free checks', () => {
  const original = fresh();
  const target = specFor(original).targets[0];
  for (const preliminaryFirst of [true, false]) {
    let run = inRoom(structuredClone(original), target);
    if (preliminaryFirst) run = inspect(run, target, findingMethod(target).id).run;
    run = inspect(run, target).run;
    const options = offer(run, target);
    const expected = [target.method_id, ...(preliminaryFirst ? [findingMethod(target).id] : [])].sort();
    for (const pack of Object.values(options.result.packs)) {
      assert.deepEqual(pack.cards.map(card => card.method_id).sort(), expected);
      assert.ok(pack.cards.every(card => card.review && card.ap_cost === 0 && card.stamina_cost === 0));
    }
    if (preliminaryFirst) {
      const reviewed = inspect(run, target, findingMethod(target).id);
      assert.equal(reviewed.result.narration, findingMethod(target).finding.result.zh,
        'reviewing preliminary observations must not return a different complete-proof result');
      assert.deepEqual(reviewed.run.state, run.state);
      assert.deepEqual(reviewed.run.investigation, run.investigation);
    }
  }
});

test('wrong methods still cost AP and add confusion, then allow preliminary and full corrections', () => {
  const original = fresh();
  const target = specFor(original).targets[0];
  const wrong = inspect(inRoom(original, target), target, failedMethod(target).id);
  assert.equal(wrong.result.completed, false);
  assert.equal(wrong.run.state.action_points_left, 19);
  assert.equal(wrong.run.state.confusion_score, 3);
  assert.deepEqual(wrong.run.investigation.inspection_findings, []);
  const partial = inspect(wrong.run, target, findingMethod(target).id);
  assert.equal(partial.run.state.confusion_score, 3);
  const full = inspect(partial.run, target);
  assert.equal(full.result.completed, true);
  assert.equal(full.run.state.action_points_left, 18);
  assert.deepEqual(full.run.state.destroyed_clue_ids, []);
});

test('preliminary completion never triggers success-only notes, hints or confusion reduction', () => {
  const run = fresh({ effects: { confusion_regen: 5, bonus_clue_chance: .15 } });
  const target = specFor(run).targets.find(item => item.expert_note);
  run.team_config.team.forEach(agent => { agent.logic_power = 25; agent.observation_focus = 25; agent.hack_level = 25; });
  run.state.confusion_score = 5;
  const preliminary = inspect(inRoom(run, target), target, findingMethod(target).id);
  assert.equal(preliminary.run.state.confusion_score, 5);
  assert.equal(preliminary.result.expert_note, undefined);
  assert.equal(preliminary.result.source_hint, undefined);
  assert.deepEqual(preliminary.run.investigation.skill_hints, []);
  assert.equal(preliminary.run.investigation.skill_usage.verification_calm, undefined);
  assert.equal(preliminary.run.investigation.skill_usage.source_hint, undefined);
  const full = inspect(preliminary.run, target);
  assert.equal(full.run.state.confusion_score, 4);
  assert.ok(full.result.expert_note);
  assert.equal(full.run.investigation.skill_usage.verification_calm, 1);
});

test('a paid preliminary credit takes priority over scanner, specialist, command and skill AP allowances', () => {
  const base = fresh();
  const target = specFor(base).targets[0];
  const preliminary = inspect(inRoom(base, target), target, findingMethod(target).id);
  const run = JSON.parse(serialize(preliminary.run, MAX_RUN_BYTES));
  run.state.ap_discount_credit = 1;
  run.state.command_ap_credit = 1;
  run.team_config.skill_effects.ap_cost_discount = .25;
  run.team_config.team.forEach(agent => { agent.logic_power = 40; });
  const full = inspect(run, target);
  assert.equal(full.card.inspection_ap_credit_used, 1);
  assert.equal(full.card.ap_cost, 0);
  assert.equal(full.card.command_ap_credit_used, 0);
  assert.equal(full.card.skill_ap_discount, 0);
  assert.equal(full.run.state.ap_discount_credit, 1);
  assert.equal(full.run.state.command_ap_credit, 1);
  assert.deepEqual(full.run.investigation.discounted_agent_ids, []);
  assert.equal(full.run.investigation.skill_usage.inspection_ap, undefined);
  const reviewed = inspect(full.run, target);
  assert.deepEqual(reviewed.run.state, full.run.state);
  assert.deepEqual(reviewed.run.investigation.skill_usage, full.run.investigation.skill_usage);
});

test('an inspection credit cannot fund a different object or an inadequate method on the same object', () => {
  const run = fresh();
  const [target, other] = specFor(run).targets;
  const preliminary = inspect(inRoom(run, target), target, findingMethod(target).id);
  const wrong = offer(preliminary.run, target, failedMethod(target).id);
  assert.equal(wrong.card.ap_cost, 1);
  assert.equal(wrong.card.inspection_ap_credit_used, 0);
  const different = offer(inRoom(preliminary.run, other), other);
  assert.equal(different.card.ap_cost, 1);
  assert.equal(different.card.inspection_ap_credit_used, 0);
});

test('free preliminary inspections consume only the quoted discount and cannot manufacture another free completion', () => {
  for (const discount of ['scanner', 'specialist', 'command', 'skill']) {
    const run = fresh({ effects: discount === 'scanner' ? { auto_unlock_first: true }
      : discount === 'skill' ? { ap_cost_discount: .1 } : {} });
    const executor = run.team_config.team[0].agent_id;
    const target = specFor(run).targets[0];
    if (discount === 'specialist') run.team_config.team[0].logic_power = 40;
    if (discount === 'command') run.state.command_ap_credit = 1;
    const preliminary = inspect(inRoom(run, target), target, findingMethod(target).id, { executor });
    assert.equal(preliminary.card.ap_cost, 0, discount);
    assert.equal(preliminary.run.investigation.inspection_findings[0].paid_ap, 0, discount);
    const full = inspect(preliminary.run, target, target.method_id, { executor });
    assert.equal(full.card.ap_cost, 1, `${discount}: an unpaid finding cannot provide credit`);
    assert.equal(full.card.inspection_ap_credit_used, 0, discount);
    assert.equal(full.run.state.action_points_left, 19);
  }
});

test('duplicate, superseded and restored quotes remain revision-bound and atomically rejected', () => {
  const run = fresh();
  const [target, other] = specFor(run).targets;
  inRoom(run, target);
  const offered = offer(run, target, findingMethod(target).id);
  const persisted = JSON.parse(serialize(offered.run, MAX_RUN_BYTES));
  const command = { type: 'inspect', option_id: offered.card.option_id };
  const accepted = act(persisted, command);
  assert.deepEqual(accepted, act(persisted, command), 'the same authoritative source yields the same result');
  reject(accepted.run, command, 'STALE_OPTIONS');
  const replaced = offer(offered.run, other, findingMethod(other).id);
  reject(replaced.run, command, 'STALE_OPTIONS');
  const rested = act(offered.run, { type: 'rest' }).run;
  reject(rested, command, 'STALE_OPTIONS');
  assert.equal(accepted.run.investigation.inspection_findings.length, 1);
  assert.equal(accepted.run.state.action_points_left, 19);
});

test('a quoted check cannot bypass AP or stamina limits, while paid credit can complete with zero AP', () => {
  const original = fresh();
  const target = specFor(original).targets[0];
  const executor = original.team_config.team[0].agent_id;
  for (const resource of ['ap', 'stamina']) {
    const run = inRoom(structuredClone(original), target);
    if (resource === 'ap') run.state.action_points_left = 0;
    else run.state.agent_stamina[executor] = 0;
    const options = offer(run, target, findingMethod(target).id, { executor });
    assert.equal(options.card.available, false);
    reject(options.run, { type: 'inspect', option_id: options.card.option_id },
      resource === 'ap' ? 'INSUFFICIENT_AP' : 'INSUFFICIENT_AGENT_STAMINA');
  }
  const run = inRoom(structuredClone(original), target);
  run.state.action_points_left = 1;
  const preliminary = inspect(run, target, findingMethod(target).id, { executor });
  assert.equal(preliminary.run.state.action_points_left, 0);
  const full = inspect(preliminary.run, target, target.method_id, { executor });
  assert.equal(full.card.available, true);
  assert.equal(full.result.completed, true);
  assert.equal(full.run.state.action_points_left, 0);
  assert.equal(full.run.state.agent_stamina[executor], preliminary.run.state.agent_stamina[executor] - 6,
    'AP credit does not remove the normal four-point recovery followed by ten stamina cost');
});

test('only an offered server option is executable; client-supplied finding or cost overrides are rejected', () => {
  const run = fresh();
  const target = specFor(run).targets[0];
  const options = offer(inRoom(run, target), target, findingMethod(target).id);
  for (const supplied of [{ paid_ap: 0 }, { inspection_ap_credit_used: 1 }, { finding: true },
    { method_id: target.method_id }, { executor_agent_id: run.team_config.team[1].agent_id }]) {
    reject(options.run, { type: 'inspect', option_id: options.card.option_id, ...supplied }, 'INVALID_COMMAND');
  }
  reject(options.run, { type: 'inspect', option_id: `${options.card.option_id}:forged` }, 'STALE_OPTIONS');
});

test('public methods and offers never reveal unearned findings, and earned records are copied through a whitelist', () => {
  const run = fresh();
  const spec = specFor(run);
  const target = spec.targets[0];
  inRoom(run, target);
  const options = offer(run, target, findingMethod(target).id);
  const serialized = JSON.stringify([publicRun(options.run), options.result]);
  for (const item of spec.targets) for (const lang of ['zh', 'en']) {
    assert.equal(serialized.includes(findingMethod(item).finding.result[lang]), false);
    assert.equal(serialized.includes(findingMethod(item).finding.limitation[lang]), false);
  }
  const checked = act(options.run, { type: 'inspect', option_id: options.card.option_id });
  checked.run.investigation.inspection_findings[0].private_answer = 'do-not-project';
  const view = publicRun(checked.run);
  assert.equal(view.investigation.inspection_findings.length, 1);
  const record = view.investigation.inspection_findings[0];
  assert.deepEqual(Object.keys(record).sort(), ['target_id', 'method_id', 'label', 'result', 'limitation', 'executor_agent_id'].sort());
  assert.deepEqual(record.result, findingMethod(target).finding.result);
  assert.equal(JSON.stringify(view).includes('do-not-project'), false);
  for (const item of spec.targets.slice(1)) for (const lang of ['zh', 'en']) {
    assert.equal(JSON.stringify(view).includes(findingMethod(item).finding.result[lang]), false);
  }
  record.result.zh = 'mutated browser projection';
  assert.equal(checked.run.investigation.inspection_findings[0].result.zh, findingMethod(target).finding.result.zh);
});

test('preliminary findings cannot unlock a puzzle or serve as report evidence or conclusion support', () => {
  let run = fresh();
  const spec = specFor(run);
  for (const target of spec.targets) run = inspect(inRoom(run, target), target, findingMethod(target).id).run;
  assert.deepEqual(run.state.unlocked_clues, []);
  assert.deepEqual(run.investigation.completed_checks, []);
  const options = act(run, { type: 'report_options' });
  assert.deepEqual(options.result.availableEvidence, []);
  assert.deepEqual(options.result.evidence_roles, []);
  reject(run, { type: 'puzzle_options' }, 'PUZZLE_LOCKED');
  const answers = Object.fromEntries(Object.entries(spec.report.answers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  reject(run, { type: 'report', ...answers, evidence_by_dimension: spec.report.support }, 'INVALID_EVIDENCE');
  const empty = act(run, { type: 'report', ...answers,
    evidence_by_dimension: { opportunity: [], method: [], motive: [], timeline: [] } });
  assert.equal(empty.run.status, 'active');
  assert.deepEqual(empty.result.missing_dimensions.sort(), ['method', 'motive', 'opportunity', 'timeline']);
  assert.equal(empty.result.is_passed, false);
});
