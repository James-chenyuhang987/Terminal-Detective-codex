import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { INSPECTION_REVISION, usesScopedInspection, applyInspectionContent } from '../server/investigationV2/inspectionContent.js';

const fresh = () => ({ case_id: 'Lvl_03', investigation_version: 2,
  investigation: { case_design_revision: 1, inspection_revision: INSPECTION_REVISION } });
const bilingual = value => {
  for (const lang of ['zh', 'en']) assert.ok(typeof value?.[lang] === 'string' && value[lang].trim());
};

test('scoped inspection content is enabled only for explicitly versioned new Butterfly runs', () => {
  const baseline = getInvestigationContent('Lvl_03');
  assert.equal(usesScopedInspection(fresh()), true);
  const ineligible = [null, {}, { ...fresh(), investigation_version: 1 }, { ...fresh(), investigation_version: '2' },
    { ...fresh(), investigation: {} }, { ...fresh(), investigation: { case_design_revision: 1 } },
    { ...fresh(), investigation: { case_design_revision: 0, inspection_revision: 1 } },
    { ...fresh(), investigation: { case_design_revision: 2, inspection_revision: 1 } },
    { ...fresh(), investigation: { case_design_revision: 1, inspection_revision: '1' } },
    { ...fresh(), investigation: { case_design_revision: 1, inspection_revision: 2 } },
    ...INVESTIGATION_CASE_IDS.filter(id => id !== 'Lvl_03').map(case_id => ({ ...fresh(), case_id }))];
  for (const run of ineligible) {
    assert.equal(usesScopedInspection(run), false);
    assert.equal(applyInspectionContent(run, baseline), baseline);
  }
  const anotherCase = getInvestigationContent('Lvl_07');
  assert.equal(applyInspectionContent(fresh(), anotherCase), anotherCase);
  assert.equal(applyInspectionContent(fresh(), null), null);
});

test('all eight objects retain their original evidence, full methods, entry actions and truth', () => {
  const baseline = getInvestigationContent('Lvl_03');
  const before = JSON.stringify(baseline);
  const revised = applyInspectionContent(fresh(), baseline);
  assert.equal(revised.targets.length, 8);
  assert.notEqual(revised, baseline);
  for (const [index, target] of revised.targets.entries()) {
    const original = baseline.targets[index];
    for (const key of ['target_id', 'zone_id', 'clue_id', 'method_id', 'action_tag', 'result', 'required_clues', 'expert_note']) {
      assert.deepEqual(target[key], original[key], `${target.target_id}: ${key}`);
    }
    assert.deepEqual(target.methods.map(item => item.id), original.methods.map(item => item.id));
    assert.equal(target.methods.length, 3);
    assert.equal(target.methods[0].id, target.method_id);
    assert.equal(target.methods.filter(item => item.finding).length, 1);
    assert.equal(target.methods[0].finding, undefined);
    assert.equal(target.methods[2].finding, undefined);
    for (const value of [target.inquiry, target.observation, target.failure_explanation,
      target.methods[1].finding.result, target.methods[1].finding.limitation]) bilingual(value);
    for (const method of target.methods) {
      bilingual(method.label);
      bilingual(method.scope);
      assert.notDeepEqual(method.label, original.methods.find(item => item.id === method.id).label,
        `${target.target_id}/${method.id}: replace the generic method with a specific inquiry`);
    }
    assert.notDeepEqual(target.methods[1].finding.result, target.result, 'a preliminary finding cannot return the full evidence');
  }
  for (const key of Object.keys(baseline).filter(key => key !== 'targets')) assert.equal(revised[key], baseline[key]);
  assert.equal(JSON.stringify(baseline), before);
});

test('preliminary findings keep proof boundaries without attributing the crime or leaking future specifics', () => {
  const targets = applyInspectionContent(fresh(), getInvestigationContent('Lvl_03')).targets;
  for (const target of targets) {
    const preliminary = target.methods[1].finding;
    assert.match(preliminary.limitation.zh, /不能|不足|尚未|还不能/);
    assert.doesNotMatch(JSON.stringify(preliminary), /Sable|Ren|Lena|4\.7|01:20|01:26|5万|50[ ,]?000|e_0[1-8]|p_/);
    assert.doesNotMatch(JSON.stringify(target.methods.map(({ label, scope }) => ({ label, scope }))),
      /完整方法|正确方法|有效方法|必得|correct method|guaranteed|full verification/i);
  }
  const notes = Object.fromEntries(targets.map(target => [target.clue_id, target.methods[1].finding]));
  assert.match(notes.e_01.limitation.zh, /输出功率/);
  assert.match(notes.e_04.limitation.zh, /有代码不等于运行过/);
  assert.match(notes.e_07.limitation.zh, /不能识别投放者/);
  assert.match(notes.e_08.limitation.zh, /一笔消费不能覆盖/);
});

test('authored inspection overrides do not leak mutable content across runs', () => {
  const baseline = getInvestigationContent('Lvl_03');
  const before = JSON.stringify(baseline);
  const first = applyInspectionContent(fresh(), baseline);
  first.targets[0].observation.zh = 'changed observation';
  first.targets[0].methods[1].finding.result.zh = 'changed finding';
  first.targets[0].methods[0].scope.en = 'changed scope';
  const second = applyInspectionContent(fresh(), baseline);
  assert.notEqual(second.targets[0].observation.zh, first.targets[0].observation.zh);
  assert.notEqual(second.targets[0].methods[1].finding.result.zh, first.targets[0].methods[1].finding.result.zh);
  assert.notEqual(second.targets[0].methods[0].scope.en, first.targets[0].methods[0].scope.en);
  assert.equal(JSON.stringify(baseline), before);
});
