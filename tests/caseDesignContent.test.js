import test from 'node:test';
import assert from 'node:assert/strict';
import { INVESTIGATION_CASE_IDS, getInvestigationContent } from '../server/investigationV2/content.js';
import { CASE_DESIGN_REVISION, publicInvestigationStory } from '../server/investigationV2/caseDesign.js';

function runFor(caseId, clueIds = [], extra = {}) {
  return { case_id: caseId, investigation_version: 2, status: 'active', judge_result: null,
    state: { unlocked_clues: [...clueIds], turn_count: 100 },
    investigation: { case_design_revision: CASE_DESIGN_REVISION, completed_checks: [], testimony_stages: {} },
    ...extra };
}
function assertBilingual(value) {
  assert.ok(value.zh && value.en);
  assert.equal(typeof value.zh, 'string');
  assert.equal(typeof value.en, 'string');
}
function storyEntries(story) {
  return [...story.milestones, ...(story.resolution?.sequence || []), ...(story.resolution?.aftermath || [])];
}

for (const caseId of INVESTIGATION_CASE_IDS) {
  test(`${caseId}: authored overlay preserves frozen legacy content, truth, prices and ordinary clue identities`, () => {
    const baseline = getInvestigationContent(caseId, 0);
    const before = JSON.stringify(baseline);
    const spec = getInvestigationContent(caseId);
    assert.equal(spec.case_design_revision, 1);
    assert.equal(baseline.case_design_revision, undefined);
    assert.notEqual(spec, baseline);
    assert.ok(Object.isFrozen(spec) && Object.isFrozen(spec.targets));
    assert.equal(JSON.stringify(getInvestigationContent(caseId, 0)), before);
    assert.deepEqual(spec.report.answers, baseline.report.answers);
    assert.deepEqual(spec.targets.map(item => [item.target_id, item.clue_id, item.zone_id, item.action_tag, item.method_id]),
      baseline.targets.map(item => [item.target_id, item.clue_id, item.zone_id, item.action_tag, item.method_id]));
    assert.deepEqual(spec.puzzle.answer, baseline.puzzle.answer);
    assert.deepEqual(spec.puzzle.required_clues, baseline.puzzle.required_clues);
    assert.deepEqual(spec.puzzle.items.map(item => item.id), baseline.puzzle.items.map(item => item.id));
    if (caseId !== 'Lvl_02') assert.deepEqual(spec.puzzle, baseline.puzzle);
    assert.deepEqual(spec.hidden, baseline.hidden);
    assert.deepEqual(spec.relations.slice(0, baseline.relations.length), baseline.relations);
    assert.deepEqual(spec.relations.filter(item => item.alternative), baseline.relations.filter(item => item.alternative),
      'additional corroboration never replaces the two alternative explanations required for higher grades');
    for (const ids of Object.values(spec.report.support)) assert.ok(ids.every(id => !id.includes('secret')));
    for (const target of spec.targets) {
      assertBilingual(target.result);
      if (target.result !== baseline.targets.find(item => item.clue_id === target.clue_id).result) {
        assert.deepEqual(spec.clue_overrides[target.clue_id].description, target.result,
          'the initialized clue and inspection result must share the same revised facts');
      }
    }
  });

  test(`${caseId}: story stages depend on specific acquired facts, never elapsed turns or raw clue counts`, () => {
    const spec = getInvestigationContent(caseId);
    const run = runFor(caseId);
    assert.equal(publicInvestigationStory(run, spec).stage, 'opening');
    const unrelated = spec.targets.map(item => item.clue_id).filter(id => !spec.case_design.pursuit.includes(id)
      && !spec.case_design.convergence.includes(id));
    run.state.unlocked_clues = [...unrelated, spec.hidden.clue_id];
    assert.equal(publicInvestigationStory(run, spec).stage, 'opening');
    run.state.unlocked_clues = [...spec.case_design.pursuit];
    assert.equal(publicInvestigationStory(run, spec).stage, 'pursuit');
    run.state.unlocked_clues = [...spec.case_design.convergence];
    assert.equal(publicInvestigationStory(run, spec).stage, 'convergence');
    assert.equal(publicInvestigationStory(run, spec).resolution, null);
  });

  test(`${caseId}: progressive projection is bilingual, earned, isolated and contains no future configuration`, () => {
    const spec = getInvestigationContent(caseId);
    const all = spec.targets.map(item => item.clue_id);
    for (let length = 0; length <= all.length; length += 1) {
      const run = runFor(caseId, all.slice(0, length));
      const before = JSON.stringify(run);
      const story = publicInvestigationStory(run, spec);
      assertBilingual(story.focus);
      assert.equal(story.resolution, null);
      for (const entry of storyEntries(story)) {
        assertBilingual(entry.title); assertBilingual(entry.body);
        assert.ok(entry.evidence_ids.length > 0);
        assert.ok(entry.evidence_ids.every(id => run.state.unlocked_clues.includes(id)));
        assert.deepEqual(Object.keys(entry).sort(), ['body', 'evidence_ids', 'id', 'title']);
      }
      assert.equal(JSON.stringify(run), before);
      assert.equal(JSON.stringify(story).includes('required_clues'), false);
      assert.equal(JSON.stringify(story).includes('testimony_stages'), false);
      assert.equal(JSON.stringify(story).includes(spec.hidden.result.zh), false);
      story.focus.zh = 'MUTATED';
      assert.notEqual(publicInvestigationStory(run, spec).focus.zh, 'MUTATED');
    }
  });

  test(`${caseId}: closure requires an actual passing completion and only reviews obtained ordinary sources`, () => {
    const spec = getInvestigationContent(caseId);
    const all = spec.targets.map(item => item.clue_id);
    const run = runFor(caseId, all);
    for (const [status, passed] of [['active', true], ['completed', false], ['abandoned', true], ['completed', undefined]]) {
      run.status = status; run.judge_result = { is_passed: passed };
      assert.equal(publicInvestigationStory(run, spec).resolution, null);
    }
    run.status = 'completed'; run.judge_result = { is_passed: true };
    const story = publicInvestigationStory(run, spec);
    assert.equal(story.stage, 'convergence');
    assert.ok(story.resolution.sequence.length >= 3 && story.resolution.aftermath.length >= 1);
    assertBilingual(story.resolution.title);
    for (const entry of storyEntries(story)) {
      assertBilingual(entry.title); assertBilingual(entry.body);
      assert.ok(entry.evidence_ids.every(id => all.includes(id)));
      assert.ok(entry.evidence_ids.every(id => !id.includes('secret')));
    }
    run.status = 'settled';
    assert.equal(publicInvestigationStory(run, spec).resolution, null, 'a settled run needs its successful final report');
    run.final_report = { ...spec.report.answers, evidence_by_dimension: structuredClone(spec.report.support) };
    assert.deepEqual(publicInvestigationStory(run, spec), story,
      'settling a passing completed report must preserve the same earned story review');
    for (const [status, passed] of [['active', true], ['failed', true], ['abandoned', true], ['settled', false], ['settled', undefined]]) {
      run.status = status; run.judge_result = { is_passed: passed };
      assert.equal(publicInvestigationStory(run, spec).resolution, null,
        'the saved report alone must never expose a failed, unfinished or abandoned solution');
    }
    run.status = 'settled'; run.judge_result = { is_passed: true };
    run.state.unlocked_clues = [];
    const withoutSources = publicInvestigationStory(run, spec);
    assert.deepEqual(withoutSources.resolution.sequence, []);
    assert.deepEqual(withoutSources.resolution.aftermath, []);
    assert.deepEqual(withoutSources.milestones, []);
  });
}

test('unknown content IDs and legacy or unsupported design revisions never opt in to authored story', () => {
  assert.equal(getInvestigationContent('unknown'), null);
  const baseline = getInvestigationContent('Lvl_01', 0);
  for (const marker of [undefined, 0, 2, '1', null]) {
    assert.equal(getInvestigationContent('Lvl_01', marker === undefined ? 0 : marker), baseline);
    const run = runFor('Lvl_01'); run.investigation.case_design_revision = marker;
    assert.equal(publicInvestigationStory(run, getInvestigationContent('Lvl_01')), null);
  }
  const legacy = runFor('Lvl_01'); legacy.investigation_version = 1;
  assert.equal(publicInvestigationStory(legacy, getInvestigationContent('Lvl_01')), null);
  assert.equal(publicInvestigationStory(runFor('Lvl_01'), baseline), null);
});

test('first-case ordinary evidence establishes a present person, device session and this action without hidden corroboration', () => {
  const spec = getInvestigationContent('Lvl_01');
  const ordinary = spec.targets.find(item => item.clue_id === 'c_05');
  assert.match(ordinary.observation.zh, /活体/);
  for (const phrase of ['N-17', 'Mei', '活体', '脉冲', '23:17']) assert.ok(ordinary.result.zh.includes(phrase));
  assert.doesNotMatch(ordinary.result.zh, /EMP-X7|匿名|隐藏/);
  assert.deepEqual(spec.report.support, getInvestigationContent('Lvl_01', 0).report.support);
  for (const id of ['c_01', 'c_03', 'c_05', 'c_08']) {
    const target = spec.targets.find(item => item.clue_id === id);
    const old = getInvestigationContent('Lvl_01', 0).targets.find(item => item.clue_id === id);
    assertBilingual(target.failure_explanation);
    assert.notDeepEqual(target.methods, old.methods);
    assert.ok(target.methods.some(item => item.id === target.method_id));
  }
});

test('ghost device limits are observable before inspection and ordinary sources distinguish plan, activation, exit and recovery', () => {
  const spec = getInvestigationContent('Lvl_02');
  const device = spec.targets.find(item => item.clue_id === 'd_03');
  assert.match(device.observation.zh, /40cm/);
  assert.match(device.observation.zh, /无法远程启动或携带第二人/);
  assert.match(device.result.zh, /02:26/);
  assert.match(device.result.zh, /Aria本人/);
  assert.match(device.result.zh, /02:41/);
  assert.match(device.result.zh, /28cm非承重隔墙/);
  assert.match(spec.report.methods.find(item => item.id === 'phase_shift').label.zh, /额定隔墙/);
  assert.match(spec.puzzle.items.find(item => item.id === 'phase').label.zh, /28cm非承重隔墙/);
  assert.match(spec.puzzle.workbench.edges.find(item => item.a === 'lab' && item.b === 'phase').label.zh, /28cm非承重隔墙/);
  assert.match(spec.testimonies.npc_02[0].response.zh, /薄隔墙/);
  const old = getInvestigationContent('Lvl_02', 0);
  assert.match(old.report.methods.find(item => item.id === 'phase_shift').label.zh, /越过锁门/);
  assert.match(old.puzzle.items.find(item => item.id === 'phase').label.zh, /跨越锁门/);
  assert.match(old.testimonies.npc_02[0].response.zh, /越过一扇锁门/);
  const plan = spec.targets.find(item => item.clue_id === 'd_05');
  assert.match(plan.result.zh, /不单独证明已经成功离开/);
  const roof = spec.targets.find(item => item.clue_id === 'd_06');
  assert.match(roof.result.zh, /02:34/);
  assert.match(roof.result.zh, /不能单独识别人名/);
  const run = runFor('Lvl_02', ['d_03']);
  assert.ok(publicInvestigationStory(run, spec).milestones.some(item => item.id === 'ghost_limits'));
  for (const id of ['d_01', 'd_03', 'd_05', 'd_06']) {
    const target = spec.targets.find(item => item.clue_id === id);
    assertBilingual(target.failure_explanation);
    assert.equal(target.methods.length, 3);
  }
});

test('character-reaction milestones require their recorded testimony rather than merely possessing the triggering exhibits', () => {
  const spec = getInvestigationContent('Lvl_01');
  const run = runFor('Lvl_01', spec.targets.map(item => item.clue_id));
  assert.equal(publicInvestigationStory(run, spec).milestones.some(item => item.id === 'neon_return'), false);
  run.investigation.testimony_stages.npc_01 = 1;
  assert.equal(publicInvestigationStory(run, spec).milestones.some(item => item.id === 'neon_return'), true);
});

test('the drug-assisted third-case mechanism requires its ordinary dosing and chemical evidence while legacy support stays fixed', () => {
  const spec = getInvestigationContent('Lvl_03');
  const old = getInvestigationContent('Lvl_03', 0);
  assert.deepEqual(old.report.support.method, ['e_01', 'e_04']);
  assert.deepEqual(spec.report.support.method, ['e_01', 'e_04', 'e_07']);
  const drug = spec.targets.find(item => item.clue_id === 'e_07');
  assert.match(drug.result.zh, /独立定量泵/);
  assert.match(drug.result.zh, /Sable本人/);
  const required = new Set(Object.values(spec.report.support).flat());
  assert.equal(required.size, 7, 'complete ordinary proof stays within the existing eight-object case');
});
