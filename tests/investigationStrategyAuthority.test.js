import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand, publicRun, deriveRunSummary } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { getInterviewStrategyContent } from '../server/investigationV2/interviewContent.js';
import { serialize, MAX_RUN_BYTES } from '../cloudflare/worker/authorityStore.js';

const NOW = new Date('2026-10-15T15:00:00Z');
let serial = 0;
function fresh(caseId = 'Lvl_01', effects = {}) {
  const team = buildTeamConfig();
  team.skill_effects = effects;
  const run = createRun({ id: `strategy-${++serial}`, caseData: ALL_CASES.find(item => item.case_id === caseId),
    teamConfig: team, now: NOW, investigationVersion: 2 });
  run.next_crisis_turn = 999;
  return run;
}
const act = (run, command) => applyRunCommand(run, command, NOW);
function offer(run, npcId, tone, lang = 'zh') {
  const next = act(run, { type: 'interrogation_options', npc_id: npcId, lang });
  const executor = run.team_config.team[0].agent_id;
  return { ...next, executor, question: next.result.packs[executor].questions.find(item => item.tone === tone) };
}
function ask(run, npcId, tone, lang = 'zh') {
  const offered = offer(run, npcId, tone, lang);
  return { ...act(offered.run, { type: 'question', npc_id: npcId,
    question_id: offered.question.questionId, executor_agent_id: offered.executor, lang }), quote: offered.question };
}

for (const caseId of INVESTIGATION_CASE_IDS) {
  test(`${caseId}: background, recorded claim and evidence comparison form a persistent two-stage interview`, () => {
    const spec = getInvestigationContent(caseId);
    for (const npcId of Object.keys(spec.testimonies)) {
      let run = fresh(caseId);
      run.state.current_zone = spec.npc_zones[npcId];
      run.state.unlocked_clues = spec.targets.map(item => item.clue_id);
      const initialAP = run.state.action_points_left;
      for (const stage of [0, 1]) {
        const source = getInterviewStrategyContent(caseId, npcId, stage);
        const before = structuredClone(run.state);
        const background = ask(run, npcId, 'gentle');
        assert.equal(background.quote.ap_cost, 0);
        assert.equal(background.quote.stamina_cost, 0);
        assert.equal(background.result.response, source.background.zh);
        assert.deepEqual(background.run.state, before, 'free background never recovers resources or advances a crisis');
        const repeat = ask(background.run, npcId, 'gentle');
        assert.equal(repeat.result.repeated, true);
        assert.deepEqual(repeat.run.investigation.interview_records, background.run.investigation.interview_records);
        const claim = ask(repeat.run, npcId, 'firm');
        assert.equal(claim.result.response, source.claim.zh);
        assert.equal(claim.run.state.action_points_left, before.action_points_left - 1);
        assert.equal(claim.run.state.turn_count, before.turn_count + 1);
        assert.equal(claim.run.state.confusion_score, before.confusion_score + 2);
        const claimReview = ask(claim.run, npcId, 'firm');
        assert.equal(claimReview.quote.ap_cost, 0);
        assert.equal(claimReview.result.repeated, true);
        assert.deepEqual(claimReview.run.state, claim.run.state);
        assert.deepEqual(claimReview.run.npc_emotions, claim.run.npc_emotions);
        // Restore before confrontation: the credit is part of the persisted account.
        run = JSON.parse(serialize(claimReview.run, MAX_RUN_BYTES));
        run.state.command_ap_credit = 1;
        const confrontation = ask(run, npcId, 'evidence', 'en');
        assert.equal(confrontation.quote.ap_cost, 0);
        assert.equal(confrontation.quote.claim_credit_ap, 1);
        assert.equal(confrontation.run.state.command_ap_credit, 1, 'paid account covers the AP before command credits');
        assert.equal(confrontation.result.response, spec.testimonies[npcId][stage].response.en);
        assert.equal(confrontation.result.prior_claim, source.claim.en);
        assert.equal(confrontation.result.testimony_stage, stage + 1);
        assert.deepEqual(confrontation.run.investigation.testimony_records[npcId][stage].prior_claim, source.claim);
        assert.deepEqual(confrontation.run.state.unlocked_clues, run.state.unlocked_clues);
        run = confrontation.run;
        run.state.command_ap_credit = 0;
      }
      assert.equal(run.state.action_points_left, initialAP - 2);
      assert.equal(run.state.turn_count, 4);
      assert.equal(run.investigation.interview_records[npcId].length, 4);
      const view = publicRun(JSON.parse(serialize(run, MAX_RUN_BYTES)));
      assert.deepEqual(view.investigation.interview_records[npcId], run.investigation.interview_records[npcId]);
      assert.ok(Buffer.byteLength(serialize(run, MAX_RUN_BYTES)) < MAX_RUN_BYTES);
      run.state.action_points_left = 0;
      Object.keys(run.state.agent_stamina).forEach(id => { run.state.agent_stamina[id] = 0; });
      for (const tone of ['gentle', 'firm', 'evidence']) {
        const reviewed = ask(run, npcId, tone);
        assert.equal(reviewed.quote.available, true);
        assert.deepEqual(reviewed.run.state, run.state);
        assert.deepEqual(reviewed.run.investigation, run.investigation);
      }
    }
  });
}

test('unearned accounts stay private; free background works at zero resources without farming or granting evidence', () => {
  const run = fresh();
  const npcId = 'npc_01';
  run.state.current_zone = getInvestigationContent(run.case_id).npc_zones[npcId];
  run.state.action_points_left = 0;
  Object.keys(run.state.agent_stamina).forEach(id => { run.state.agent_stamina[id] = 0; });
  const source = getInterviewStrategyContent(run.case_id, npcId, 0);
  const offered = offer(run, npcId, 'gentle');
  const before = JSON.stringify(publicRun(offered.run));
  assert.equal(before.includes(source.background.zh), false);
  assert.equal(before.includes(source.claim.zh), false);
  assert.equal(offered.question.available, true);
  const response = ask(run, npcId, 'gentle');
  assert.deepEqual(response.run.state, run.state);
  assert.deepEqual(response.run.npc_emotions, run.npc_emotions);
  assert.deepEqual(response.run.asked_question_ids, run.asked_question_ids);
  assert.deepEqual(response.run.investigation.skill_usage, run.investigation.skill_usage);
  assert.equal(JSON.stringify(publicRun(response.run)).includes(source.background.zh), true);
  assert.equal(JSON.stringify(publicRun(response.run)).includes(source.claim.zh), false);
});

test('a recorded claim cannot bypass missing evidence and stale submissions cannot consume another credit', () => {
  const run = fresh();
  const npcId = 'npc_01';
  run.state.current_zone = getInvestigationContent(run.case_id).npc_zones[npcId];
  const claim = ask(run, npcId, 'firm');
  const offered = offer(claim.run, npcId, 'evidence');
  assert.equal(offered.question.ap_cost, 0);
  assert.equal(offered.question.available, false);
  const before = JSON.stringify(offered.run);
  assert.throws(() => act(offered.run, { type: 'question', npc_id: npcId, question_id: offered.question.questionId,
    executor_agent_id: offered.executor }), error => error.code === 'QUESTION_LOCKED');
  assert.equal(JSON.stringify(offered.run), before);
  const first = offer(run, npcId, 'firm');
  const accepted = act(first.run, { type: 'question', npc_id: npcId, question_id: first.question.questionId, executor_agent_id: first.executor });
  assert.throws(() => act(accepted.run, { type: 'question', npc_id: npcId, question_id: first.question.questionId,
    executor_agent_id: first.executor }), error => error.code === 'STALE_OPTIONS');
});

test('new interview benefits respect skill limits and reviews never spend them', () => {
  let run = fresh('Lvl_01', { npc_confusion_reduce: .2, interrogation_bonus: .3 });
  const spec = getInvestigationContent(run.case_id);
  const npcId = 'npc_01';
  const executor = run.team_config.team[0].agent_id;
  run.state.current_zone = spec.npc_zones[npcId];
  run.state.unlocked_clues = spec.targets.map(item => item.clue_id);
  for (const stage of [0, 1]) {
    const firm = ask(run, npcId, 'firm');
    assert.equal(firm.quote.confusion_cost, 1);
    const repeat = ask(firm.run, npcId, 'firm');
    assert.deepEqual(repeat.run.investigation.skill_usage, firm.run.investigation.skill_usage);
    if (stage === 0) repeat.run.state.agent_stamina[executor] = 2;
    const evidence = ask(repeat.run, npcId, 'evidence');
    assert.equal(evidence.quote.stamina_cost, stage === 0 ? 6 : 10);
    assert.equal(evidence.quote.ap_cost, 0);
    run = evidence.run;
    run.state.agent_stamina[executor] = 50;
  }
  assert.equal(run.state.confusion_score, 2);
  assert.equal(run.investigation.skill_usage.firm_confusion, 2);
  assert.equal(run.investigation.skill_usage.interview_stamina, 1);
});

test('older and unknown interview revisions preserve paid questioning and never expose new records', () => {
  for (const revision of [undefined, 0, 2, '1']) {
    const run = fresh();
    if (revision === undefined) delete run.investigation.interview_revision;
    else run.investigation.interview_revision = revision;
    const npcId = 'npc_01';
    const spec = getInvestigationContent(run.case_id);
    run.state.current_zone = spec.npc_zones[npcId];
    const result = ask(run, npcId, 'gentle');
    assert.equal(result.quote.ap_cost, 1);
    assert.equal(result.quote.stamina_cost, 10);
    assert.equal(result.result.response, spec.testimonies[npcId][0].gentle_response.zh);
    assert.equal(result.run.state.action_points_left, 19);
    assert.equal(result.run.state.turn_count, 1);
    assert.equal(publicRun(result.run).investigation.interview_records, undefined);
  }
});

test('actual report options and judgments explain only acquired attachments and keep grading and settlement unchanged', () => {
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const run = fresh(caseId);
    const spec = getInvestigationContent(caseId);
    assert.deepEqual(act(run, { type: 'report_options' }).result.evidence_roles, []);
    run.state.unlocked_clues = spec.targets.map(item => item.clue_id);
    const options = act(run, { type: 'report_options' }).result;
    assert.ok(options.evidence_roles.length > 0);
    assert.ok(options.evidence_roles.every(item => run.state.unlocked_clues.includes(item.clue_id)));
    const command = { type: 'report', ...spec.report.answers,
      evidence_by_dimension: Object.fromEntries(['opportunity', 'method', 'motive', 'timeline'].map(key => [key, [...run.state.unlocked_clues]])) };
    const completed = act(run, command);
    assert.equal(completed.result.is_passed, true);
    assert.equal(completed.result.score, 'C', 'extra attachments never add a penalty or bonus');
    assert.equal(completed.result.evidence_review.dimensions.length, 4);
    assert.ok(completed.result.evidence_review.dimensions.every(item => item.used_evidence_ids.length > 0));
    const stored = JSON.parse(serialize(completed.run, MAX_RUN_BYTES));
    assert.equal(deriveRunSummary(stored).score, 'C');
    assert.deepEqual(publicRun(stored).judge_result.evidence_review, completed.result.evidence_review);
    const legacy = structuredClone(run);
    delete legacy.investigation.report_explanation_revision;
    assert.equal(act(legacy, { type: 'report_options' }).result.evidence_roles, undefined);
    assert.equal(act(legacy, command).result.evidence_review, undefined);
    command.conclusion_id = spec.report.conclusions.find(item => item.id !== spec.report.answers.conclusion_id).id;
    const rejected = act(run, command);
    assert.equal(rejected.run.status, 'active');
    assert.equal(rejected.result.is_passed, false);
    assert.ok(rejected.result.evidence_review, 'coverage explanation is not a verdict on the chosen conclusion');
  }
});
