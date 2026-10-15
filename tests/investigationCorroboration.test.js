import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand, publicRun, deriveRunSummary } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';

const NOW = new Date('2026-10-15T16:00:00Z');
const additions = [
  ['Lvl_01', 'c_02', 'c_05', 'p_pulse_receipt_injury'],
  ['Lvl_01', 'c_02', 'c_07', 'p_pulse_injury_outage'],
  ['Lvl_02', 'd_01', 'd_05', 'p_empty_chip_decoy'],
];
let serial = 0;
function fresh(caseId) {
  const run = createRun({ id: `corroboration-${++serial}`,
    caseData: ALL_CASES.find(item => item.case_id === caseId), teamConfig: buildTeamConfig(),
    now: NOW, investigationVersion: 2 });
  run.next_crisis_turn = 999;
  return run;
}
const act = (run, command) => applyRunCommand(run, command, NOW);
const command = (a, b, relation = 'supports', lang = 'zh') => ({ type: 'link', clue_ids: [a, b], relation_type: relation, lang });
function report(run) {
  const spec = getInvestigationContent(run.case_id, run.investigation.case_design_revision || 0);
  return { type: 'report', ...spec.report.answers, evidence_by_dimension: structuredClone(spec.report.support) };
}

test('only the authored design adds the three missing corroborations without changing baseline relations or grading requirements', () => {
  for (const caseId of INVESTIGATION_CASE_IDS) {
    const old = getInvestigationContent(caseId, 0);
    const frozen = JSON.stringify(old);
    const current = getInvestigationContent(caseId);
    assert.deepEqual(current.relations.slice(0, old.relations.length), old.relations);
    const extra = current.relations.slice(old.relations.length);
    assert.deepEqual(extra.map(item => [caseId, item.a, item.b, item.proposition_id]), additions.filter(item => item[0] === caseId));
    assert.ok(extra.every(item => item.relation === 'supports' && item.alternative === false && item.label.zh && item.label.en));
    assert.deepEqual(current.relations.filter(item => item.alternative), old.relations.filter(item => item.alternative));
    if (['Lvl_01', 'Lvl_02'].includes(caseId)) {
      assert.deepEqual(current.report.support, old.report.support);
      assert.deepEqual(current.report.support_alternatives, old.report.support_alternatives);
      assert.deepEqual(current.report.answers, old.report.answers);
    }
    assert.equal(JSON.stringify(getInvestigationContent(caseId, 0)), frozen);
  }
});

for (const [caseId, a, b, id] of additions) {
  test(`${caseId} ${a}+${b}: either support direction confirms only its earned bounded fact and awards once`, () => {
    for (const lang of ['zh', 'en']) for (const clueIds of [[a, b], [b, a]]) {
      const run = fresh(caseId);
      run.state.unlocked_clues = [a, b];
      const relation = getInvestigationContent(caseId).relations.find(item => item.proposition_id === id);
      const before = structuredClone(run.state);
      const linked = act(run, command(...clueIds, 'supports', lang));
      assert.equal(linked.result.is_valid, true);
      assert.equal(linked.result.reveal, relation.label[lang]);
      assert.equal(linked.run.truth_fragments, run.truth_fragments + 1);
      assert.equal(linked.run.investigation.propositions.length, 1);
      assert.equal(linked.run.investigation.propositions[0].id, id);
      assert.equal(linked.run.investigation.propositions[0].alternative, false);
      assert.equal(linked.run.state.confusion_score, before.confusion_score);
      assert.equal(linked.run.state.action_points_left, before.action_points_left);
      assert.equal(linked.run.state.turn_count, before.turn_count);
      assert.deepEqual(linked.run.state.agent_stamina, before.agent_stamina);
      assert.deepEqual(linked.run.state.unlocked_clues, [a, b]);
      assert.equal(publicRun(linked.run).investigation.propositions[0].label[lang], relation.label[lang]);
      let saved = JSON.parse(JSON.stringify(linked.run));
      for (const repeatedIds of [[a, b], [b, a]]) {
        const repeated = act(saved, command(...repeatedIds, 'supports', lang));
        assert.equal(repeated.result.repeated, true);
        assert.equal(repeated.run.truth_fragments, linked.run.truth_fragments);
        assert.equal(repeated.run.investigation.propositions.length, 1);
        assert.equal(repeated.run.linked_pairs.length, 1);
        assert.deepEqual(repeated.run.state, linked.run.state, 'reverse support must not award another command milestone');
        saved = repeated.run;
      }
    }
  });

  test(`${caseId} ${a}+${b}: missing or unknown evidence is rejected atomically and legacy content keeps its prior verdict`, () => {
    for (const clueIds of [[], [a], [b]]) {
      const run = fresh(caseId); run.state.unlocked_clues = clueIds;
      const snapshot = JSON.stringify(run);
      assert.throws(() => act(run, command(a, b)), error => error.code === 'INVALID_CLUES');
      assert.throws(() => act(run, command(a, 'unknown_record')), error => error.code === 'INVALID_CLUES');
      assert.equal(JSON.stringify(run), snapshot);
    }
    for (const marker of [undefined, 0, 2, '1']) {
      const run = fresh(caseId);
      if (marker === undefined) delete run.investigation.case_design_revision;
      else run.investigation.case_design_revision = marker;
      run.state.unlocked_clues = [a, b];
      const baseline = getInvestigationContent(caseId, 0);
      assert.equal(baseline.relations.some(item => item.relation === 'supports'
        && [item.a, item.b].sort().join(':') === [a, b].sort().join(':')), false);
      const rejected = act(run, command(a, b));
      assert.equal(rejected.result.is_valid, false);
      assert.equal(rejected.run.state.confusion_score, run.state.confusion_score + 3);
      assert.equal(rejected.run.truth_fragments, run.truth_fragments);
      assert.equal(rejected.run.investigation.propositions.length, 0);
      const repeat = act(rejected.run, command(b, a));
      assert.equal(repeat.result.repeated, true);
      assert.equal(repeat.run.state.confusion_score, rejected.run.state.confusion_score);
    }
  });
}

test('added support propositions cannot substitute for excluding two alternatives or change report and settlement grades', () => {
  for (const caseId of ['Lvl_01', 'Lvl_02']) {
    let run = fresh(caseId);
    const spec = getInvestigationContent(caseId);
    run.state.unlocked_clues = spec.targets.map(item => item.clue_id);
    const before = act(run, report(run)).result;
    for (const [, a, b] of additions.filter(item => item[0] === caseId)) run = act(run, command(a, b)).run;
    assert.equal(run.investigation.propositions.filter(item => item.alternative).length, 0);
    assert.deepEqual(act(run, report(run)).result, before);
    run.investigation.puzzle_completed = true;
    const completed = act(run, report(run));
    assert.equal(completed.result.score, 'B');
    assert.equal(deriveRunSummary(completed.run).score, 'B');
    run.state.unlocked_clues.push(spec.hidden.clue_id);
    assert.equal(act(run, report(run)).result.score, 'B', 'a hidden clue and ordinary support do not replace alternative exclusions');
    for (const relation of spec.relations.filter(item => item.alternative)) {
      run = act(run, command(relation.a, relation.b, relation.relation)).run;
    }
    assert.equal(act(run, report(run)).result.score, 'S');
    const legacy = fresh(caseId);
    legacy.investigation.case_design_revision = 0;
    legacy.state.unlocked_clues = [...run.state.unlocked_clues];
    legacy.investigation.puzzle_completed = true;
    assert.equal(act(legacy, report(legacy)).result.score, 'B');
  }
});

test('wrong relations explain the selected type without disclosing a missing link or relaxing multi-event ordering', () => {
  for (const lang of ['zh', 'en']) {
    const run = fresh('Lvl_01'); run.state.unlocked_clues = ['c_01', 'c_06'];
    const expected = lang === 'zh'
      ? { supports: /具体命题/, contradicts: /具体矛盾/, precedes: /具体事件/ }
      : { supports: /specific proposition/, contradicts: /specific claim/, precedes: /specific events/ };
    for (const relation of ['supports', 'contradicts', 'precedes']) {
      const rejected = act(run, command('c_01', 'c_06', relation, lang));
      assert.equal(rejected.result.is_valid, false);
      assert.match(rejected.result.reveal, expected[relation]);
      assert.doesNotMatch(rejected.result.reveal, /c_0[1-8]|d_0[1-8]/);
      if (relation !== 'precedes') assert.doesNotMatch(rejected.result.reveal, /时钟|clocks|earlier|later/);
    }
    const ghost = fresh('Lvl_02'); ghost.state.unlocked_clues = ['d_03', 'd_06'];
    assert.equal(act(ghost, command('d_03', 'd_06', 'precedes', lang)).result.is_valid, false);
    const correct = act(ghost, command('d_06', 'd_03', 'precedes', lang));
    assert.equal(correct.result.is_valid, true);
    assert.match(correct.result.reveal, /02:34/);
    assert.match(correct.result.reveal, /02:41/);
  }
});
