import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand } from '../server/gameAuthority/runAuthority.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';

const NOW = new Date('2026-10-15T12:00:00Z');
const act = (run, command) => applyRunCommand(run, command, NOW);

function question(run, npcId, tone) {
  const offer = act(run, { type: 'interrogation_options', npc_id: npcId });
  const executorId = Object.keys(offer.result.packs)[0];
  const selected = offer.result.packs[executorId].questions.find(item => item.tone === tone);
  return { selected, ...act(offer.run, { type: 'question', npc_id: npcId,
    question_id: selected.questionId, executor_agent_id: executorId }) };
}

function investigationProgress(run) {
  return { state: run.state, investigation: run.investigation, npc_emotions: run.npc_emotions,
    asked_question_ids: run.asked_question_ids, truth_fragments: run.truth_fragments,
    linked_pairs: run.linked_pairs, attempted_link_keys: run.attempted_link_keys,
    report_attempts: run.report_attempts, bsod_count: run.bsod_count, recovery_count: run.recovery_count,
    next_crisis_turn: run.next_crisis_turn, pending_crisis: run.pending_crisis };
}

for (const caseId of INVESTIGATION_CASE_IDS) {
  test(`${caseId}: completed testimony reviews cannot change cooperation, statistics or investigation rewards`, () => {
    const spec = getInvestigationContent(caseId);
    for (const mode of ['new-v2', 'restored-v2']) {
      for (const npcId of Object.keys(spec.testimonies)) {
        let run = createRun({ id: `review-audit-${caseId}-${mode}-${npcId}`,
          caseData: ALL_CASES.find(item => item.case_id === caseId),
          teamConfig: buildTeamConfig(), now: NOW, investigationVersion: 2 });
        if (mode === 'restored-v2') delete run.investigation.raw_materials_revision;
        run.state.current_zone = spec.npc_zones[npcId];
        run.state.visited_zones = [...new Set([...run.state.visited_zones, run.state.current_zone])];
        run.state.unlocked_clues = [...new Set(spec.testimonies[npcId].flatMap(item => item.required_clues))];
        for (let index = 0; index < 2; index++) {
          const answered = question(run, npcId, 'evidence');
          assert.equal(answered.result.progressed, true);
          run = answered.run;
        }
        assert.equal(run.npc_emotions[npcId].cooperation, 2);
        assert.equal(run.npc_emotions[npcId].history_count, 2);
        const before = structuredClone(investigationProgress(run));
        for (const tone of ['firm', 'gentle', 'evidence', 'firm']) {
          const reviewed = question(JSON.parse(JSON.stringify(run)), npcId, tone);
          assert.equal(reviewed.selected.ap_cost, 0);
          assert.equal(reviewed.selected.stamina_cost, 0);
          assert.equal(reviewed.result.repeated, true);
          assert.equal(reviewed.result.progressed, false);
          assert.equal(reviewed.result.cooperationChange, 0);
          assert.equal(reviewed.result.emotionShift, 0);
          assert.equal(reviewed.result.response, spec.testimonies[npcId][1].response.zh);
          assert.deepEqual(investigationProgress(reviewed.run), before,
            `${mode}/${npcId}/${tone} must only replay the saved testimony`);
          run = reviewed.run;
        }
      }
    }
  });
}

test('an unfinished direct question still has its disclosed turn, stamina and cooperation consequences', () => {
  const caseData = ALL_CASES[0];
  const spec = getInvestigationContent(caseData.case_id);
  const npcId = Object.keys(spec.testimonies)[0];
  const run = createRun({ id: 'review-audit-unfinished', caseData,
    teamConfig: buildTeamConfig(), now: NOW, investigationVersion: 2 });
  run.state.current_zone = spec.npc_zones[npcId];
  const direct = question(run, npcId, 'firm');
  assert.equal(direct.run.state.action_points_left, run.state.action_points_left - 1);
  assert.equal(direct.run.state.turn_count, run.state.turn_count + 1);
  assert.equal(direct.run.npc_emotions[npcId].history_count, 1);
  assert.equal(direct.run.npc_emotions[npcId].cooperation, -1);
  assert.equal(direct.result.cooperationChange, -1);
  assert.equal(direct.result.repeated, false);
});
