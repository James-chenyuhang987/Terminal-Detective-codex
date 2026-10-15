import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand, publicRun, deriveRunSummary } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { createRunCrisis } from '../server/gameAuthority/runCrisis.js';
import { serialize, MAX_RUN_BYTES } from '../cloudflare/worker/authorityStore.js';

const NOW = new Date('2026-10-15T12:00:00Z');
let serial = 0;
function fresh(effects = {}, caseId = 'Lvl_01') {
  const team = buildTeamConfig();
  team.skill_effects = effects;
  team.team.forEach(agent => { agent.logic_power = 0; agent.observation_focus = 0; agent.hack_level = 0; });
  const run = createRun({ id: `design-authority-${++serial}`, caseData: ALL_CASES.find(item => item.case_id === caseId),
    teamConfig: team, now: NOW, investigationVersion: 2 });
  run.next_crisis_turn = 999;
  return run;
}
const act = (run, command) => applyRunCommand(run, command, NOW);
function inspection(run, target, method = target.method_id) {
  run.state.current_zone = target.zone_id;
  const offered = act(run, { type: 'inspect_options', target_id: target.target_id });
  const executor = run.team_config.team[0].agent_id;
  const card = offered.result.packs[executor].cards.find(item => item.method_id === method);
  assert.ok(card);
  return { ...offered, card };
}
function reportFor(spec) {
  return { type: 'report', ...spec.report.answers, evidence_by_dimension: structuredClone(spec.report.support) };
}

test('actual field skill quotes allow low-stamina execution, consume once and preserve reviews across restore', () => {
  let run = fresh({ ap_cost_discount: .1, hack_success_rate: .2, bonus_clue_chance: .15, confusion_regen: 5 });
  const target = getInvestigationContent(run.case_id).targets.find(item => ['check_cctv', 'access_database', 'hack_terminal'].includes(item.action_tag));
  const executor = run.team_config.team[0].agent_id;
  run.state.agent_stamina[executor] = 2;
  run.state.confusion_score = 4;
  const before = JSON.stringify(run.investigation);
  const offered = inspection(run, target);
  assert.equal(JSON.stringify(run.investigation), before, 'reading options must not consume the source run');
  assert.equal(offered.card.ap_cost, 0);
  assert.equal(offered.card.stamina_cost, 6);
  assert.equal(offered.card.available, true, 'two stamina plus the four-point recovery pays the discounted cost');
  const checked = act(offered.run, { type: 'inspect', option_id: offered.card.option_id });
  assert.equal(checked.result.completed, true);
  assert.equal(checked.run.state.action_points_left, 20);
  assert.equal(checked.run.state.agent_stamina[executor], 0);
  assert.equal(checked.run.state.confusion_score, 3);
  assert.equal(checked.run.investigation.skill_usage.inspection_ap, 1);
  assert.equal(checked.run.investigation.skill_usage.technical_stamina, 1);
  assert.equal(checked.run.investigation.skill_usage.verification_calm, 1);
  assert.ok(checked.result.source_hint?.label.zh && checked.result.source_hint.label.en);
  assert.equal(Object.hasOwn(checked.result.source_hint, 'method_id'), false);
  run = JSON.parse(serialize(checked.run, MAX_RUN_BYTES));
  const after = structuredClone(run.investigation.skill_usage);
  const reviewed = inspection(run, target);
  assert.equal(reviewed.card.stamina_cost, 0);
  const result = act(reviewed.run, { type: 'inspect', option_id: reviewed.card.option_id });
  assert.equal(result.result.review, true);
  assert.deepEqual(result.run.investigation.skill_usage, after);
  assert.deepEqual(result.run.state, run.state);
  assert.deepEqual(publicRun(result.run).investigation.skills.hints, run.investigation.skill_hints);
});

test('new skill benefits never upgrade a paid run without the skill revision marker', () => {
  const run = fresh({ ap_cost_discount: .25, hack_success_rate: .2, confusion_regen: 5 });
  delete run.investigation.skills_revision;
  const target = getInvestigationContent(run.case_id).targets[0];
  const offered = inspection(run, target);
  assert.equal(offered.card.ap_cost, 1);
  assert.equal(offered.card.stamina_cost, 10);
  assert.equal(publicRun(run).investigation.skills, undefined);
  const checked = act(offered.run, { type: 'inspect', option_id: offered.card.option_id });
  assert.equal(checked.run.state.action_points_left, 19);
  assert.deepEqual(checked.run.investigation.skill_usage, {});
});

test('restored older v2 reports keep their original proof requirements through completion and settlement', () => {
  const original = fresh({}, 'Lvl_03');
  const baseline = getInvestigationContent('Lvl_03', 0);
  // Reconstruct the persisted pre-design content, rather than retaining new clue text.
  original.case_data = structuredClone(ALL_CASES.find(item => item.case_id === 'Lvl_03'));
  for (const target of baseline.targets) {
    const clue = original.case_data.clue_dictionary.find(item => item.clue_id === target.clue_id);
    const english = original.case_data.en.clue_dictionary.find(item => item.clue_id === target.clue_id);
    const override = baseline.clue_overrides?.[target.clue_id];
    if (override?.description) {
      clue.description = override.description.zh;
      english.description = override.description.en;
    }
  }
  delete original.investigation.case_design_revision;
  delete original.investigation.skills_revision;
  delete original.investigation.skill_usage;
  delete original.investigation.skill_hints;
  original.state.unlocked_clues = [...new Set(Object.values(baseline.report.support).flat())];
  assert.equal(original.state.unlocked_clues.includes('e_07'), false);
  const restored = JSON.parse(serialize(original, MAX_RUN_BYTES));
  const frozenContent = JSON.stringify(restored.case_data);
  const publicView = publicRun(restored);
  assert.equal(publicView.investigation.story, undefined);
  assert.equal(publicView.investigation.skills, undefined);
  const completed = act(restored, reportFor(baseline)).run;
  assert.equal(completed.judge_result.is_passed, true);
  assert.equal(JSON.stringify(completed.case_data), frozenContent);
  assert.equal(deriveRunSummary(completed).score, 'C');
  completed.status = 'settled';
  assert.equal(deriveRunSummary(JSON.parse(serialize(completed, MAX_RUN_BYTES))).score, 'C');
  assert.equal(publicRun(completed).investigation.story, undefined);
  const newer = fresh({}, 'Lvl_03');
  newer.state.unlocked_clues = [...restored.state.unlocked_clues];
  const rejected = act(newer, reportFor(baseline));
  assert.equal(rejected.run.status, 'active');
  assert.deepEqual(rejected.result.missing_dimensions, ['method']);
});

test('scanner priority retains later skill allowances and stale requests cannot spend them twice', () => {
  const run = fresh({ auto_unlock_first: true, ap_cost_discount: .25 });
  const target = getInvestigationContent(run.case_id).targets[0];
  const offered = inspection(run, target);
  assert.equal(offered.card.ap_discount_source, 'scanner');
  assert.equal(offered.card.skill_ap_discount, 0);
  const checked = act(offered.run, { type: 'inspect', option_id: offered.card.option_id });
  assert.equal(checked.run.state.ap_discount_credit, 0);
  assert.equal(publicRun(checked.run).investigation.skills.budgets.inspection_ap.remaining, 2);
  const saved = JSON.stringify(checked.run);
  assert.throws(() => act(checked.run, { type: 'inspect', option_id: offered.card.option_id }), /STALE_OPTIONS/);
  assert.equal(JSON.stringify(checked.run), saved);
});

test('special verification uses quoted skill AP and stamina and free review cannot consume another allowance', () => {
  const run = fresh({ free_decrypt: true, think_speed_boost: .3 });
  const spec = getInvestigationContent(run.case_id);
  run.state.unlocked_clues = [...spec.puzzle.required_clues];
  for (const agent of run.team_config.team) run.state.agent_stamina[agent.agent_id] = 2;
  const offered = act(run, { type: 'puzzle_options' });
  assert.equal(offered.result.puzzle.ap_cost, 0);
  assert.equal(offered.result.puzzle.stamina_cost, 6);
  const executor = offered.result.puzzle.executor_agent_id;
  assert.ok(executor);
  const result = act(offered.run, { type: 'puzzle', answer_ids: spec.puzzle.answer });
  assert.equal(result.result.correct, true);
  assert.equal(result.run.state.action_points_left, 20);
  assert.equal(result.run.state.agent_stamina[executor], 0);
  assert.equal(result.run.investigation.skill_usage.puzzle_ap, 1);
  assert.equal(result.run.investigation.skill_usage.puzzle_stamina, 1);
  const review = act(result.run, { type: 'puzzle_options' });
  const completed = act(review.run, { type: 'puzzle', answer_ids: spec.puzzle.answer });
  assert.deepEqual(completed.run.investigation.skill_usage, result.run.investigation.skill_usage);
  assert.deepEqual(completed.run.state, result.run.state);
});

test('pre-strategy v2 dialogue preserves its skill costs and bounded direct-question confusion', () => {
  let run = fresh({ interrogation_bonus: .3, npc_confusion_reduce: .2 });
  delete run.investigation.interview_revision;
  const spec = getInvestigationContent(run.case_id);
  const npcId = 'npc_01';
  const executor = run.team_config.team[0].agent_id;
  run.state.current_zone = spec.npc_zones[npcId];
  run.state.unlocked_clues = [...spec.testimonies[npcId][0].required_clues];
  for (let index = 0; index < 3; index++) {
    const offered = act(run, { type: 'interrogation_options', npc_id: npcId });
    const selected = offered.result.packs[executor].questions.find(item => item.tone === 'firm');
    run = act(offered.run, { type: 'question', npc_id: npcId, question_id: selected.questionId, executor_agent_id: executor }).run;
  }
  assert.equal(run.state.confusion_score, 4, 'only the first two direct questions reduce their two-point cost');
  run.state.agent_stamina[executor] = 2;
  const offered = act(run, { type: 'interrogation_options', npc_id: npcId });
  const selected = offered.result.packs[executor].questions.find(item => item.tone === 'evidence');
  assert.equal(selected.stamina_cost, 6);
  assert.equal(selected.available, true);
  const result = act(offered.run, { type: 'question', npc_id: npcId, question_id: selected.questionId, executor_agent_id: executor });
  assert.equal(result.result.progressed, true);
  assert.equal(result.run.state.agent_stamina[executor], 0);
  assert.equal(result.run.investigation.skill_usage.interview_stamina, 1);
});

test('crisis skill mitigation preserves quoted risk and leaves AP and reputation consequences intact', () => {
  const run = fresh({ confusion_resistance: .25, trap_immunity: true });
  // Select a generated tracker event, preserving the real crisis resolver and scales.
  for (let turn = 0; turn < 100; turn++) {
    run.state.turn_count = turn;
    const event = createRunCrisis(run, 'zh');
    if (event.type === 'tracker') { run.pending_crisis = event; break; }
  }
  assert.ok(run.pending_crisis);
  const result = act(run, { type: 'crisis', option_id: 'hide' });
  assert.equal(result.run.state.confusion_score, Math.max(0, result.result.changes.confusion_delta));
  assert.equal(result.run.state.action_points_left, 20);
  assert.equal(result.run.state.reputation, 100);
  assert.equal(result.run.investigation.skill_usage.crisis_resistance, 1);
  assert.ok(result.result.resultText.includes('探员防护'));
});

for (const caseId of INVESTIGATION_CASE_IDS) {
  test(`${caseId}: design facts remain private until earned and closure uses acquired main evidence without hidden prerequisites`, () => {
    const run = fresh({}, caseId);
    const spec = getInvestigationContent(caseId);
    const opening = publicRun(run).investigation.story;
    assert.equal(opening.stage, 'opening');
    assert.equal(opening.resolution, null);
    assert.deepEqual(opening.milestones, []);
    run.state.unlocked_clues = spec.targets.map(target => target.clue_id);
    const result = act(run, reportFor(spec));
    assert.equal(result.result.score, 'C');
    const story = publicRun(result.run).investigation.story;
    assert.ok(story.resolution.sequence.length > 0);
    for (const item of [...story.milestones, ...story.resolution.sequence, ...story.resolution.aftermath]) {
      assert.ok(item.evidence_ids.every(id => run.state.unlocked_clues.includes(id)));
    }
    assert.equal(deriveRunSummary(result.run).score, 'C');
    assert.ok(Buffer.byteLength(serialize(result.run, MAX_RUN_BYTES)) < MAX_RUN_BYTES);
    const old = structuredClone(run);
    delete old.investigation.case_design_revision;
    const snapshot = JSON.stringify(old);
    assert.equal(publicRun(old).investigation.story, undefined);
    assert.equal(JSON.stringify(old), snapshot);
  });
}
