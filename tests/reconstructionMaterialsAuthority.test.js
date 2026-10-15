import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand, publicRun, deriveRunSummary } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { INVESTIGATION_RAW_MATERIALS_REVISION } from '../server/investigationV2/rawMaterials.js';
import { judgeInvestigationReport } from '../server/investigationV2/rules.js';
import { MAX_RUN_BYTES, serialize } from '../cloudflare/worker/authorityStore.js';

const NOW = new Date('2026-10-15T12:00:00Z');
function fresh(caseId = 'Lvl_01', version = 2) {
  return createRun({ id: `raw-materials-${caseId}`, caseData: ALL_CASES.find(item => item.case_id === caseId),
    teamConfig: buildTeamConfig(), now: NOW, investigationVersion: version });
}
const act = (run, command) => applyRunCommand(run, command, NOW);
function allKeys(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [key, ...allKeys(item)]);
}
function reportCommand(spec) {
  return { type: 'report', ...Object.fromEntries(Object.entries(spec.report.answers)
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])),
  evidence_by_dimension: structuredClone(spec.report.support) };
}

for (const caseId of INVESTIGATION_CASE_IDS) {
  test(`${caseId}: original materials unlock only with the reconstruction evidence, remain bilingual and never publish a key`, () => {
    const run = fresh(caseId);
    const spec = getInvestigationContent(caseId);
    assert.equal(run.investigation.raw_materials_revision, INVESTIGATION_RAW_MATERIALS_REVISION);
    const before = JSON.stringify(run);
    assert.equal(publicRun(run).investigation.puzzle.workbench, undefined);
    assert.equal(publicRun(run).investigation.puzzle.confirmed_answer_ids, undefined);
    assert.deepEqual(publicRun(run).investigation.puzzle.items, []);
    assert.equal(JSON.stringify(run), before, 'reading an unready run must never upgrade or mutate it');
    run.state.unlocked_clues = [...spec.puzzle.required_clues];
    const view = publicRun(run);
    assert.equal(view.investigation.puzzle.confirmed_answer_ids, undefined, 'unlocking materials is not completing the reconstruction');
    const workbench = view.investigation.puzzle.workbench;
    assert.equal(workbench.revision, 1);
    assert.equal(workbench.kind, spec.puzzle.workbench.kind);
    assert.ok(workbench.title.zh && workbench.title.en && workbench.instructions.zh && workbench.instructions.en);
    assert.deepEqual(Object.keys(workbench.records).sort(), spec.puzzle.items.map(item => item.id).sort());
    for (const item of view.investigation.puzzle.items) {
      assert.deepEqual(item.label, workbench.records[item.id].label, 'the choice label names its source, not a prewritten result');
      assert.ok(item.label.zh && item.label.en);
      const record = workbench.records[item.id];
      assert.ok(record.source.zh && record.source.en);
      for (const entry of record.fields) assert.ok(entry.label.zh && entry.label.en);
    }
    const privateKeys = ['answer', 'answers', 'method_id', 'support', 'support_alternatives', 'required_clues', 'correct', 'is_correct'];
    const keys = allKeys(workbench);
    for (const key of privateKeys) assert.equal(keys.includes(key), false, key);
    assert.ok(Buffer.byteLength(serialize(run, MAX_RUN_BYTES)) < MAX_RUN_BYTES);
    const offered = act(run, { type: 'puzzle_options', lang: 'en' });
    assert.equal(offered.result.puzzle.confirmed_answer_ids, undefined);
    assert.deepEqual(offered.result.puzzle.workbench, workbench);
    for (const item of offered.result.puzzle.items) assert.equal(typeof item.label, 'string');
    workbench.records[view.investigation.puzzle.items[0].id].label.zh = 'UNTRUSTED_EDIT';
    assert.notEqual(publicRun(run).investigation.puzzle.items[0].label.zh, 'UNTRUSTED_EDIT');
  });

  test(`${caseId}: material tools preserve the established answer IDs, charge and legacy reconstruction rules`, () => {
    const run = fresh(caseId);
    const spec = getInvestigationContent(caseId);
    run.state.unlocked_clues = [...spec.puzzle.required_clues];
    const legacy = structuredClone(run);
    delete legacy.investigation.raw_materials_revision;
    const legacyBefore = JSON.stringify(legacy);
    const oldPublic = publicRun(legacy).investigation.puzzle;
    assert.equal(oldPublic.workbench, undefined);
    for (const item of oldPublic.items) assert.deepEqual(item.label, spec.puzzle.items.find(value => value.id === item.id).label);
    assert.equal(JSON.stringify(legacy), legacyBefore);
    const offered = act(run, { type: 'puzzle_options' });
    const oldOffered = act(legacy, { type: 'puzzle_options' });
    assert.equal(oldOffered.result.puzzle.workbench, undefined);
    const completed = act(offered.run, { type: 'puzzle', answer_ids: spec.puzzle.answer });
    const oldCompleted = act(oldOffered.run, { type: 'puzzle', answer_ids: spec.puzzle.answer });
    assert.deepEqual(completed.result, oldCompleted.result);
    assert.deepEqual(completed.run.state, oldCompleted.run.state);
    assert.equal(completed.result.correct, true);
    assert.deepEqual(publicRun(completed.run).investigation.puzzle.confirmed_answer_ids, spec.puzzle.answer);
    assert.equal(publicRun(oldCompleted.run).investigation.puzzle.confirmed_answer_ids, undefined);
    assert.equal(completed.run.state.action_points_left, run.state.action_points_left - 1);
    const reviewOffer = act(completed.run, { type: 'puzzle_options' });
    assert.deepEqual(reviewOffer.result.puzzle.confirmed_answer_ids, spec.puzzle.answer);
    const reviewed = act(reviewOffer.run, { type: 'puzzle', answer_ids: spec.puzzle.answer });
    assert.equal(reviewed.result.review, true);
    assert.deepEqual(reviewed.run.state, completed.run.state);
    assert.equal(publicRun(reviewed.run).investigation.puzzle.workbench.kind, spec.puzzle.workbench.kind);
  });
}

test('unmarked v2, unknown future material revisions and v1 never opt into new material or support rules on read', () => {
  for (const marker of [undefined, 0, 2, '1']) {
    const run = fresh();
    const spec = getInvestigationContent(run.case_id);
    run.state.unlocked_clues = [...spec.puzzle.required_clues];
    if (marker === undefined) delete run.investigation.raw_materials_revision;
    else run.investigation.raw_materials_revision = marker;
    const before = JSON.stringify(run);
    assert.equal(publicRun(run).investigation.puzzle.workbench, undefined);
    assert.equal(JSON.stringify(run), before);
  }
  const legacy = fresh('Lvl_01', 1);
  assert.equal(publicRun(legacy).investigation, undefined);
});

test('a completed new reconstruction retains its confirmed selection across refresh without exposing unearned or legacy answers', () => {
  let run = fresh();
  const spec = getInvestigationContent(run.case_id);
  run.state.unlocked_clues = [...spec.puzzle.required_clues];
  const offered = act(run, { type: 'puzzle_options' });
  assert.equal(offered.result.puzzle.confirmed_answer_ids, undefined);
  const incorrect = act(offered.run, { type: 'puzzle', answer_ids: [spec.puzzle.items[0].id] });
  assert.equal(incorrect.result.correct, false);
  assert.equal(publicRun(incorrect.run).investigation.puzzle.confirmed_answer_ids, undefined);
  const retryOffer = act(incorrect.run, { type: 'puzzle_options' });
  assert.equal(retryOffer.result.puzzle.confirmed_answer_ids, undefined);
  run = act(retryOffer.run, { type: 'puzzle', answer_ids: spec.puzzle.answer }).run;
  const restored = JSON.parse(JSON.stringify(run));
  const view = publicRun(restored);
  assert.deepEqual(view.investigation.puzzle.confirmed_answer_ids, spec.puzzle.answer);
  view.investigation.puzzle.confirmed_answer_ids.reverse();
  assert.deepEqual(publicRun(restored).investigation.puzzle.confirmed_answer_ids, spec.puzzle.answer,
    'the public selection must be a copy of the already confirmed result');
  const legacy = structuredClone(restored);
  delete legacy.investigation.raw_materials_revision;
  const before = JSON.stringify(legacy);
  assert.equal(publicRun(legacy).investigation.puzzle.confirmed_answer_ids, undefined);
  assert.equal(JSON.stringify(legacy), before);
  const oldReview = act(legacy, { type: 'puzzle_options' });
  assert.equal(oldReview.result.puzzle.confirmed_answer_ids, undefined);
});

test('ordinary reconstruction sources never publish a hidden device model or borrow another case’s injury anatomy', () => {
  const neon = fresh();
  neon.state.unlocked_clues = [...getInvestigationContent(neon.case_id).puzzle.required_clues];
  const publicNeon = publicRun(neon);
  assert.equal(JSON.stringify(publicNeon).includes('EMP-X7'), false, 'the ordinary receipt records a capacitor, not the model from independent hidden corroboration');
  assert.deepEqual(publicNeon.investigation.puzzle.workbench.records.purchase.fields[0].value,
    { zh: '高压电容器', en: 'High-voltage capacitor' });
  neon.state.unlocked_clues.push('c_secret_99');
  assert.equal(JSON.stringify(publicRun(neon).state.revealed_clues).includes('EMP-X7'), true,
    'the model appears only after the independent record has actually been earned');
  const zero = fresh('Lvl_04');
  zero.state.unlocked_clues = [...getInvestigationContent(zero.case_id).puzzle.required_clues];
  const coldMaterials = publicRun(zero).investigation.puzzle.workbench;
  assert.deepEqual(coldMaterials.records.hatch.fields[0].value,
    { zh: '顶部维护口 → 防寒服表面', en: 'upper hatch → suit surface' });
  assert.doesNotMatch(JSON.stringify(coldMaterials), /neural port|神经接口/);
});

test('new first-case reports accept complete independent proof routes and settlement rejudges the same routes', () => {
  const run = fresh();
  const spec = getInvestigationContent(run.case_id);
  run.state.unlocked_clues = run.case_data.clue_dictionary.map(item => item.clue_id);
  const command = reportCommand(spec);
  command.evidence_by_dimension.opportunity = ['c_05', 'c_secret_99'];
  command.evidence_by_dimension.timeline = ['c_05', 'c_08', 'c_secret_99'];
  const judged = judgeInvestigationReport(run, command, 'en');
  assert.equal(judged.is_passed, true);
  assert.equal(judged.score, 'C');
  const completed = act(run, command).run;
  assert.equal(completed.status, 'completed');
  assert.equal(deriveRunSummary(structuredClone(completed)).is_passed, true);
  const legacy = structuredClone(run);
  delete legacy.investigation.raw_materials_revision;
  const oldJudgment = judgeInvestigationReport(legacy, command, 'en');
  assert.equal(oldJudgment.is_passed, false);
  assert.deepEqual(oldJudgment.missing_dimensions, ['opportunity', 'timeline']);
  assert.equal(judgeInvestigationReport(legacy, reportCommand(spec), 'en').is_passed, true);
});

test('alternative proof still requires the whole independent chain and can never use an unearned signature or name alone', () => {
  const run = fresh();
  const spec = getInvestigationContent(run.case_id);
  run.state.unlocked_clues = run.case_data.clue_dictionary.map(item => item.clue_id);
  for (const group of [['c_secret_99'], ['c_05'], ['c_03'], ['c_08']]) {
    const command = reportCommand(spec);
    command.evidence_by_dimension.opportunity = group;
    assert.equal(judgeInvestigationReport(run, command, 'zh').is_passed, false, group.join(','));
  }
  for (const group of [['c_05', 'c_08'], ['c_secret_99', 'c_08']]) {
    const command = reportCommand(spec);
    command.evidence_by_dimension.timeline = group;
    assert.equal(judgeInvestigationReport(run, command, 'zh').is_passed, false, group.join(','));
  }
  const unknown = structuredClone(run);
  unknown.state.unlocked_clues = unknown.state.unlocked_clues.filter(id => id !== 'c_secret_99');
  const command = reportCommand(spec);
  command.evidence_by_dimension.opportunity = ['c_05', 'c_secret_99'];
  assert.throws(() => judgeInvestigationReport(unknown, command, 'en'), error => error.code === 'INVALID_EVIDENCE');
  for (const caseId of INVESTIGATION_CASE_IDS.slice(1)) {
    assert.deepEqual(getInvestigationContent(caseId, 0).report.support_alternatives, {}, 'frozen cases keep their original proof requirements');
    assert.deepEqual(getInvestigationContent(caseId).report.support_alternatives,
      caseId === 'Lvl_03' ? { opportunity: [['e_03', 'e_04']] } : {},
      'only the revised third-case presence and live-deployment records add an ordinary opportunity route');
  }
});
