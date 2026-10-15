import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand, deriveRunSummary } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';

const NOW = new Date('2026-10-15T17:00:00Z');
let serial = 0;
function fresh() {
  const run = createRun({ id: `butterfly-proof-${++serial}`,
    caseData: ALL_CASES.find(item => item.case_id === 'Lvl_03'), teamConfig: buildTeamConfig(),
    now: NOW, investigationVersion: 2 });
  run.next_crisis_turn = 999;
  run.state.unlocked_clues = getInvestigationContent('Lvl_03').targets.map(item => item.clue_id);
  return run;
}
const act = (run, command) => applyRunCommand(run, command, NOW);
function report(lang = 'zh') {
  const spec = getInvestigationContent('Lvl_03');
  return { type: 'report', lang, ...spec.report.answers,
    evidence_by_dimension: { ...structuredClone(spec.report.support), opportunity: ['e_03', 'e_04'] } };
}

test('current third-case opportunity accepts independent presence plus live deployment while preserving every original support route', () => {
  const original = getInvestigationContent('Lvl_03', 0);
  const current = getInvestigationContent('Lvl_03');
  assert.deepEqual(original.report.support_alternatives, {});
  assert.deepEqual(current.report.support_alternatives, { opportunity: [['e_03', 'e_04']] });
  assert.deepEqual(current.report.support.opportunity, original.report.support.opportunity);
  assert.deepEqual(current.report.support.timeline, original.report.support.timeline);
  assert.deepEqual(current.report.support.motive, original.report.support.motive);
  assert.deepEqual(current.report.support.method, ['e_01', 'e_04', 'e_07']);
});

test('both languages explain the independent opportunity route as used support and preserve other attachments as context through saved settlement', () => {
  for (const lang of ['zh', 'en']) {
    const run = fresh();
    run.investigation.puzzle_completed = true;
    const command = report(lang);
    command.evidence_by_dimension.opportunity.push('e_07', 'e_08');
    const completed = act(run, command);
    assert.equal(completed.result.is_passed, true);
    assert.equal(completed.result.score, 'B');
    assert.equal(completed.run.status, 'completed');
    assert.deepEqual(completed.run.investigation.testimony_stages, {}, 'independent records do not require a witness to confess or repeat a claim');
    const review = completed.result.evidence_review.dimensions.find(item => item.dimension === 'opportunity');
    assert.deepEqual(review.used_evidence_ids, ['e_03', 'e_04']);
    assert.deepEqual(review.context_evidence_ids, ['e_07', 'e_08']);
    assert.match(review.explanation, lang === 'zh' ? /共同支持/ : /jointly supported/);
    assert.equal(review.explanation.includes('e_05'), false);
    const stored = JSON.parse(JSON.stringify(completed.run));
    assert.deepEqual(stored.judge_result.evidence_review, completed.result.evidence_review);
    assert.equal(deriveRunSummary(stored).score, 'B');
    assert.equal(deriveRunSummary(stored).is_passed, true);
  }
});

test('one record alone cannot establish the new opportunity route and unearned attachments remain invalid', () => {
  for (const group of [['e_03'], ['e_04'], ['e_07', 'e_08']]) {
    const command = report(); command.evidence_by_dimension.opportunity = group;
    const rejected = act(fresh(), command);
    assert.equal(rejected.result.is_passed, false);
    assert.deepEqual(rejected.result.missing_dimensions, ['opportunity']);
    assert.deepEqual(rejected.result.evidence_review.dimensions.find(item => item.dimension === 'opportunity').used_evidence_ids, []);
  }
  for (const absent of ['e_03', 'e_04']) {
    const run = fresh(); run.state.unlocked_clues = run.state.unlocked_clues.filter(id => id !== absent);
    const before = JSON.stringify(run);
    assert.throws(() => act(run, report()), error => error.code === 'INVALID_EVIDENCE');
    assert.equal(JSON.stringify(run), before);
  }
});

test('frozen or unmarked content and missing raw-material rules retain the original opportunity requirements', () => {
  for (const marker of [undefined, 0, 2, '1']) {
    const run = fresh();
    if (marker === undefined) delete run.investigation.case_design_revision;
    else run.investigation.case_design_revision = marker;
    const rejected = act(run, report());
    assert.equal(rejected.result.is_passed, false);
    assert.deepEqual(rejected.result.missing_dimensions, ['opportunity']);
    const original = report(); original.evidence_by_dimension.opportunity = ['e_03', 'e_05'];
    assert.equal(act(run, original).result.is_passed, true);
  }
  const run = fresh(); delete run.investigation.raw_materials_revision;
  assert.deepEqual(act(run, report()).result.missing_dimensions, ['opportunity']);
});

test('the opportunity alternative does not relax timeline, drug-assisted method or alternative-exclusion grading', () => {
  const run = fresh(); run.investigation.puzzle_completed = true;
  const wrongTimeline = report(); wrongTimeline.evidence_by_dimension.timeline = ['e_03', 'e_04'];
  assert.deepEqual(act(run, wrongTimeline).result.missing_dimensions, ['timeline']);
  const incompleteMethod = report(); incompleteMethod.evidence_by_dimension.method = ['e_01', 'e_04'];
  assert.deepEqual(act(run, incompleteMethod).result.missing_dimensions, ['method']);
  assert.equal(act(run, report()).result.score, 'B');
  run.state.unlocked_clues.push(getInvestigationContent('Lvl_03').hidden.clue_id);
  assert.equal(act(run, report()).result.score, 'B', 'the route and hidden record cannot replace the two alternative exclusions');
});
