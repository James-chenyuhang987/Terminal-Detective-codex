import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';
import { REPORT_EXPLANATION_REVISION, publicReportEvidenceRoles, explainSubmittedReport } from '../server/investigationV2/reportExplanation.js';

const DIMENSIONS = ['opportunity', 'method', 'motive', 'timeline'];
function runFor(caseId, ids = []) {
  return { case_id: caseId, investigation_version: 2,
    investigation: { report_explanation_revision: REPORT_EXPLANATION_REVISION, case_design_revision: 1, raw_materials_revision: 1 },
    state: { unlocked_clues: [...ids] } };
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); Object.values(value).forEach(freeze);
  }
  return value;
}

for (const caseId of INVESTIGATION_CASE_IDS) {
  test(`${caseId}: bilingual evidence scopes cover every ordinary material and all four dimensions without revealing other materials`, () => {
    const spec = getInvestigationContent(caseId);
    const dimensions = new Set();
    for (const target of spec.targets) {
      const run = freeze(runFor(caseId, [target.clue_id]));
      const before = JSON.stringify(run);
      const descriptions = [];
      for (const lang of ['zh', 'en']) {
        const roles = publicReportEvidenceRoles(run, spec, lang);
        assert.equal(roles.length, 1);
        assert.equal(roles[0].clue_id, target.clue_id);
        assert.deepEqual(Object.keys(roles[0]).sort(), ['clue_id', 'roles']);
        assert.ok(roles[0].roles.length > 0);
        for (const role of roles[0].roles) {
          assert.deepEqual(Object.keys(role).sort(), ['dimension', 'explanation']);
          assert.ok(DIMENSIONS.includes(role.dimension));
          dimensions.add(role.dimension);
          assert.equal(typeof role.explanation, 'string');
          assert.ok(role.explanation.length > 30);
          for (const other of [...spec.targets, spec.hidden].filter(item => item.clue_id !== target.clue_id)) {
            assert.ok(!JSON.stringify(roles).includes(other.clue_id), 'no unowned IDs or complete support route');
            assert.ok(!JSON.stringify(roles).includes(other.result[lang]), 'no full undiscovered result');
          }
        }
        descriptions.push(roles[0].roles[0].explanation);
        roles[0].roles[0].explanation = 'MUTATED';
        assert.notEqual(publicReportEvidenceRoles(run, spec, lang)[0].roles[0].explanation, 'MUTATED');
      }
      assert.notEqual(descriptions[0], descriptions[1]);
      assert.equal(JSON.stringify(run), before);
    }
    assert.deepEqual([...dimensions].sort(), [...DIMENSIONS].sort());
    assert.deepEqual(publicReportEvidenceRoles(runFor(caseId), spec), []);
  });

  test(`${caseId}: submitted explanation requires a complete existing route and retains extra attachments as background`, () => {
    const spec = getInvestigationContent(caseId);
    const all = spec.targets.map(item => item.clue_id);
    const run = freeze(runFor(caseId, all));
    for (const lang of ['zh', 'en']) {
      const groups = freeze(Object.fromEntries(DIMENSIONS.map(key => [key, [...all, ...all]])));
      const before = JSON.stringify({ run, spec, groups });
      const review = explainSubmittedReport(run, spec, groups, lang);
      assert.deepEqual(review.dimensions.map(item => item.dimension), DIMENSIONS);
      for (const entry of review.dimensions) {
        const used = caseId === 'Lvl_03' && entry.dimension === 'opportunity'
          ? ['e_03', 'e_05', 'e_04'] : spec.report.support[entry.dimension];
        assert.deepEqual(entry.used_evidence_ids, used, 'both complete ordinary opportunity routes retain their supporting records');
        assert.deepEqual(entry.context_evidence_ids, all.filter(id => !entry.used_evidence_ids.includes(id)));
        assert.match(entry.explanation, lang === 'en' ? /jointly supported by these attachments/ : /本环节由这些附证共同支持/);
        assert.match(entry.explanation, lang === 'en' ? /selected conclusion is checked separately/ : /所选结论仍由系统另行校验/);
        assert.deepEqual(new Set([...entry.used_evidence_ids, ...entry.context_evidence_ids]), new Set(all));
        assert.ok(!entry.explanation.includes(spec.hidden.clue_id));
        for (const extra of entry.context_evidence_ids) {
          const description = publicReportEvidenceRoles(run, spec, lang).find(item => item.clue_id === extra).roles[0].explanation;
          assert.ok(!entry.explanation.includes(description), 'background notes stay out of the main causal explanation');
        }
      }
      assert.equal(JSON.stringify({ run, spec, groups }), before);
      review.dimensions[0].used_evidence_ids.push('MUTATED');
      assert.ok(!explainSubmittedReport(run, spec, groups, lang).dimensions[0].used_evidence_ids.includes('MUTATED'));
    }
  });

  test(`${caseId}: incomplete groups explain only their submitted known facts without exposing missing source IDs`, () => {
    const spec = getInvestigationContent(caseId);
    for (const lang of ['zh', 'en']) {
      const groups = Object.fromEntries(DIMENSIONS.map(key => [key, spec.report.support[key].slice(1)]));
      const obtained = [...new Set(Object.values(groups).flat())];
      const run = freeze(runFor(caseId, obtained));
      const result = explainSubmittedReport(run, spec, groups, lang);
      for (const entry of result.dimensions) {
        assert.deepEqual(entry.used_evidence_ids, []);
        assert.deepEqual(entry.context_evidence_ids, groups[entry.dimension]);
        assert.doesNotMatch(entry.explanation, /本环节由这些附证共同支持|jointly supported by these attachments/);
        for (const id of [...spec.targets.map(item => item.clue_id), spec.hidden.clue_id]) {
          if (!groups[entry.dimension].includes(id)) assert.ok(!JSON.stringify(entry).includes(id));
        }
      }
      const injected = explainSubmittedReport(run, spec, Object.fromEntries(DIMENSIONS.map(key =>
        [key, [...spec.report.support[key], 'unknown_id', '__proto__']])), lang);
      for (const entry of injected.dimensions) {
        assert.ok([...entry.used_evidence_ids, ...entry.context_evidence_ids].every(id => obtained.includes(id)));
        assert.ok(!JSON.stringify(entry).includes('unknown_id'));
        assert.ok(!JSON.stringify(entry).includes('__proto__'));
      }
    }
  });
}

test('single-material explanations do not introduce facts from other evidence or presume a responsible person', () => {
  const checks = [
    ['Lvl_01', 'c_03', /Mei|23:19|活体/],
    ['Lvl_02', 'd_03', /02:34|Harlan|密钥交付/],
    ['Lvl_02', 'd_06', /Aria|02:26|Harlan/],
    ['Lvl_03', 'e_04', /酒杯|抑制剂|glass|suppressant/],
    ['Lvl_04', 'f_01', /Elias|D-4|03:11/],
    ['Lvl_05', 'g_02', /Rook|DEP-82/],
    ['Lvl_06', 'h_02', /Tessa|神经毒/],
    ['Lvl_06', 'h_05', /手套|毒|glove|poison/],
    ['Lvl_08', 'j_02', /Lucan|ENV-42|11.2/],
    ['Lvl_08', 'j_05', /混气|氩|低氧|mixing|argon|oxygen/],
  ];
  for (const [caseId, id, forbidden] of checks) {
    const spec = getInvestigationContent(caseId);
    for (const lang of ['zh', 'en']) assert.doesNotMatch(JSON.stringify(publicReportEvidenceRoles(runFor(caseId, [id]), spec, lang)), forbidden);
  }
});

test('hidden alternative routes are recognized only when enabled and entirely obtained and attached', () => {
  const spec = getInvestigationContent('Lvl_01');
  const ids = ['c_05', 'c_08', spec.hidden.clue_id];
  const groups = { opportunity: ['c_05', spec.hidden.clue_id], method: [], motive: [], timeline: [...ids] };
  const run = runFor('Lvl_01', ids);
  const result = explainSubmittedReport(run, spec, groups);
  assert.deepEqual(result.dimensions[0].used_evidence_ids, groups.opportunity);
  assert.deepEqual(result.dimensions[3].used_evidence_ids, groups.timeline);
  assert.deepEqual(result.dimensions[3].context_evidence_ids, []);
  assert.equal(publicReportEvidenceRoles(run, spec).find(item => item.clue_id === spec.hidden.clue_id).roles[0].explanation, spec.hidden.result.zh);
  for (const revision of [undefined, 0, 2, '1']) {
    run.investigation.raw_materials_revision = revision;
    assert.deepEqual(explainSubmittedReport(run, spec, groups).dimensions[0].used_evidence_ids, []);
  }
  run.investigation.raw_materials_revision = 1;
  run.state.unlocked_clues = ['c_05', 'c_08'];
  const withoutHidden = explainSubmittedReport(run, spec, groups);
  assert.deepEqual(withoutHidden.dimensions[0].used_evidence_ids, []);
  assert.ok(!JSON.stringify(withoutHidden).includes(spec.hidden.clue_id));
  assert.ok(!JSON.stringify(publicReportEvidenceRoles(run, spec)).includes(spec.hidden.clue_id));
});

test('an insufficient group explains relevant acquired facts and summarizes unrelated background once', () => {
  const spec = getInvestigationContent('Lvl_01');
  const run = runFor('Lvl_01', ['c_01', 'c_04', 'c_06', 'c_08']);
  const groups = { opportunity: [], method: ['c_01', 'c_04', 'c_06', 'c_08'], motive: [], timeline: [] };
  for (const lang of ['zh', 'en']) {
    const entry = explainSubmittedReport(run, spec, groups, lang).dimensions.find(item => item.dimension === 'method');
    assert.deepEqual(entry.used_evidence_ids, []);
    assert.deepEqual(entry.context_evidence_ids, groups.method);
    const roles = publicReportEvidenceRoles(run, spec, lang);
    assert.ok(entry.explanation.includes(roles.find(item => item.clue_id === 'c_01').roles[0].explanation));
    for (const id of ['c_04', 'c_06', 'c_08']) {
      assert.ok(!entry.explanation.includes(roles.find(item => item.clue_id === id).roles[0].explanation));
    }
    assert.match(entry.explanation, lang === 'en' ? /3 attachment\(s\) are retained as background/ : /有3份附件保留为背景/);
  }
});

test('legacy, unmarked and future revisions remain untouched, including frozen case content', () => {
  const spec = getInvestigationContent('Lvl_01');
  const ids = spec.targets.map(item => item.clue_id);
  for (const marker of [undefined, 0, 2, '1', null]) {
    const run = runFor('Lvl_01', ids); run.investigation.report_explanation_revision = marker;
    const before = JSON.stringify(run);
    assert.deepEqual(publicReportEvidenceRoles(run, spec), []);
    assert.equal(explainSubmittedReport(run, spec, spec.report.support), null);
    assert.equal(JSON.stringify(run), before);
  }
  const old = runFor('Lvl_01', ids); old.investigation_version = 1;
  assert.deepEqual(publicReportEvidenceRoles(old, spec), []);
  assert.equal(explainSubmittedReport(old, spec, spec.report.support), null);
  const run = runFor('Lvl_01', ids);
  assert.deepEqual(publicReportEvidenceRoles(run, getInvestigationContent('Lvl_01', 0)), []);
  delete run.investigation.case_design_revision;
  assert.equal(explainSubmittedReport(run, spec, spec.report.support), null);
  assert.deepEqual(publicReportEvidenceRoles(null, spec), []);
  assert.equal(explainSubmittedReport(null, spec, {}), null);
});
