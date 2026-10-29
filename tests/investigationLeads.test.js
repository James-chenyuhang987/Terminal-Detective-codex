import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContactLeads } from '../src/game/investigationLeads.js';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, publicRun, applyRunCommand } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';

const now = new Date('2026-10-26T10:00:00Z');

test('all eight cases expose three public contact leads without inventing testimony, routes or deductions', () => {
  for (const caseData of ALL_CASES) {
    const run = createRun({ id: `leads-${caseData.case_id}`, caseData, teamConfig: buildTeamConfig(), now, investigationVersion: 2 });
    const view = publicRun(run);
    const before = JSON.stringify(view);
    const spec = getInvestigationContent(caseData.case_id, run.investigation.case_design_revision);
    for (const lang of ['zh', 'en']) {
      const leads = buildContactLeads({ investigation: view.investigation, caseData, currentZone: view.state.current_zone, lang });
      assert.equal(leads.length, 3);
      for (const lead of leads) {
        assert.equal(lead.statement, view.investigation.initial_statements[lead.id][lang]);
        assert.equal(lead.stage, 0);
        assert.equal(lead.latestTestimony, '');
        assert.ok(!('required_clues' in lead));
        if (lead.route !== null) {
          let moved = run;
          for (const zone_id of lead.route) moved = applyRunCommand(moved, { type: 'travel', zone_id }, now).run;
          assert.equal(moved.state.current_zone, lead.zoneId);
          const options = applyRunCommand(moved, { type: 'interrogation_options', npc_id: lead.id }, now);
          assert.equal(options.run.state.action_points_left, run.state.action_points_left);
          assert.equal(options.run.state.turn_count, run.state.turn_count);
          assert.deepEqual(options.run.state.agent_stamina, run.state.agent_stamina);
        }
      }
      const json = JSON.stringify(leads);
      for (const stages of Object.values(spec.testimonies)) for (const stage of stages) {
        assert.ok(!json.includes(stage.response[lang]), 'unearned follow-up must remain private');
      }
    }
    assert.equal(JSON.stringify(view), before);
  }
});

test('contact leads show only the latest earned testimony and keep inaccessible people separate from reachable routes', () => {
  const caseData = { npcs: [{ npc_id: 'n', name: 'Witness', role: 'Guard', initial_statement: 'Old account' }, { npc_id: 'unknown', name: 'Not in scene' }],
    scene: { zones: { here: { label: 'Here' }, hall: { label: 'Hall' }, destination: { label: 'Destination' } } },
    zone_connections: [['here', 'hall'], ['hall', 'destination']] };
  const investigation = { npc_zones: { n: 'destination' }, zone_access: { hall: { available: true }, destination: { available: false } },
    initial_statements: { n: { zh: '公开陈述', en: 'Current public account' } }, testimony_stages: { n: 1 },
    testimony_records: { n: [{ stage: 2, response: 'FUTURE' }, { stage: 1, response: { zh: '已取得补充', en: 'Earned follow-up' } }] } };
  const options = { investigation, caseData, currentZone: 'here', lang: 'en' };
  const before = JSON.stringify(options);
  let leads = buildContactLeads(options);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].statement, 'Current public account');
  assert.equal(leads[0].latestTestimony, 'Earned follow-up');
  assert.equal(leads[0].route, null);
  assert.equal(JSON.stringify(options), before);
  investigation.zone_access.destination.available = true;
  assert.deepEqual(buildContactLeads(options)[0].route, ['hall', 'destination']);
  investigation.testimony_stages.n = 2;
  assert.equal(buildContactLeads(options)[0].latestTestimony, 'FUTURE');
  investigation.testimony_stages.n = '2';
  leads = buildContactLeads(options);
  assert.equal(leads[0].stage, 0);
  assert.equal(leads[0].latestTestimony, '');
  assert.deepEqual(buildContactLeads({}), []);
});
