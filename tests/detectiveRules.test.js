import test from 'node:test';
import assert from 'node:assert/strict';

import { getCaseSecret } from '../server/detectiveRules/caseSecrets.js';
import {
  buildDecisionPacks,
  buildInterrogationPacks,
  buildReportOptions,
  checkLink,
  inspectDecisionCandidates,
  judgeReport,
  resolveInterrogation,
} from '../server/detectiveRules/rules.js';

const lowAgent = {
  agentId: 'LOW-01', logicPower: 0, observationFocus: 0, hackLevel: 0, confusionResistance: 0,
};
const eliteAgent = {
  agentId: 'ELITE-01', logicPower: 40, observationFocus: 40, hackLevel: 40, confusionResistance: 40,
};
const baseDecision = {
  caseId: 'Lvl_01', runId: 'run-rules', turn: 3, actionPoints: 18, confusion: 8,
  recentActionTags: [], team: [lowAgent, eliteAgent], lang: 'zh',
};

test('strong agents receive better options and more accurate stable alignment estimates', () => {
  const diagnostics = inspectDecisionCandidates(baseDecision);
  const byAgent = Object.fromEntries(diagnostics.map(item => [item.agentId, item.candidates]));
  const average = items => items.reduce((sum, item) => sum + item.actualAlignment, 0) / items.length;
  assert.ok(average(byAgent['ELITE-01']) > average(byAgent['LOW-01']));
  assert.ok(byAgent['LOW-01'].some(item => item.actualAlignment >= 70), 'low agents must retain a useful route');

  const result = buildDecisionPacks(baseDecision);
  const repeated = buildDecisionPacks(baseDecision);
  assert.deepEqual(repeated, result, 'refreshing the same state must not reroll cards or estimates');
  assert.equal(result.packs['LOW-01'].cards.length, 3);
  assert.equal(result.packs['ELITE-01'].cards.length, 3);
  assert.equal(new Set(result.packs['LOW-01'].cards.map(card => card.actionTag)).size, 3);
  assert.equal(new Set(result.packs['ELITE-01'].cards.map(card => card.actionTag)).size, 3);
  assert.equal(JSON.stringify(result).includes('actualAlignment'), false, 'protected alignment must not reach clients');

  const diagnosticMap = Object.fromEntries(diagnostics.flatMap(group => group.candidates.map(item => [`${group.agentId}:${item.actionTag}`, item.actualAlignment])));
  const meanError = agentId => result.packs[agentId].cards.reduce((sum, card) => (
    sum + Math.abs(card.estimatedAlignment - diagnosticMap[`${agentId}:${card.actionTag}`])
  ), 0) / 3;
  assert.ok(meanError('ELITE-01') <= meanError('LOW-01'));
});

test('worker rules reduce option accuracy when an agent has low stamina', () => {
  const full = buildDecisionPacks({
    ...baseDecision,
    team: [{ ...eliteAgent, stamina: 100 }],
  });
  const depleted = buildDecisionPacks({
    ...baseDecision,
    team: [{ ...eliteAgent, stamina: 0 }],
  });

  assert.equal(full.packs['ELITE-01'].expertise, 72);
  assert.ok(depleted.packs['ELITE-01'].expertise < full.packs['ELITE-01'].expertise);
  assert.ok(depleted.packs['ELITE-01'].expertise <= Math.round(full.packs['ELITE-01'].expertise * 0.7));
});

test('worker rules reject missing, malformed, and duplicate agent identities', () => {
  assert.throws(() => buildDecisionPacks({
    ...baseDecision,
    team: [{ ...eliteAgent, agentId: undefined }],
  }), /INVALID_TEAM/);
  assert.throws(() => buildDecisionPacks({
    ...baseDecision,
    team: [{ ...eliteAgent, agentId: 'ELITE 01' }],
  }), /INVALID_TEAM/);
  assert.throws(() => buildDecisionPacks({
    ...baseDecision,
    team: [eliteAgent, { ...lowAgent, agentId: eliteAgent.agentId }],
  }), /INVALID_TEAM/);
});

test('interrogation is option-only, evidence-gated, deterministic and executor-validated', () => {
  const payload = {
    caseId: 'Lvl_01', npcId: 'npc_01', runId: 'interrogation-run', turn: 2,
    unlockedClueIds: ['c_01'], askedQuestionIds: [], team: [eliteAgent], lang: 'en',
  };
  const options = buildInterrogationPacks(payload);
  const questions = options.packs['ELITE-01'].questions;
  assert.equal(questions.length, 3);
  assert.ok(questions.some(question => question.requiredClueIds.includes('c_01')));
  assert.equal(JSON.stringify(options).includes('actualAlignment'), false);
  assert.deepEqual(buildInterrogationPacks(payload), options);

  const selected = questions[0];
  const resolutionPayload = {
    ...payload, questionId: selected.questionId, executorAgentId: 'ELITE-01', emotionLevel: 'calm',
  };
  assert.deepEqual(resolveInterrogation(resolutionPayload), resolveInterrogation(resolutionPayload));
  const evidenceQuestion = questions.find(question => question.requiredClueIds.includes('c_01'));
  const evidenceResult = resolveInterrogation({
    ...resolutionPayload,
    questionId: evidenceQuestion.questionId,
  });
  assert.equal(evidenceResult.nextEmotion, 'broken');
  assert.equal(evidenceResult.revealedClueIds.length, 1);
  assert.equal(evidenceResult.revealedClueIds[0].includes('_secret_'), false);
  const depletedResult = resolveInterrogation({
    ...resolutionPayload,
    questionId: evidenceQuestion.questionId,
    team: [{ ...eliteAgent, stamina: 0 }],
  });
  assert.equal(depletedResult.nextEmotion, 'calm');
  assert.equal(depletedResult.revealedClueIds.length, 0, 'depleted intellect must weaken interrogation accuracy');
  assert.equal(resolveInterrogation({
    ...resolutionPayload,
    questionId: evidenceQuestion.questionId,
    askedQuestionIds: [evidenceQuestion.questionId],
  }).revealedClueIds.length, 0, 'repeating the same confrontation cannot farm clues');
  assert.throws(() => resolveInterrogation({ ...resolutionPayload, executorAgentId: 'UNKNOWN' }), /INVALID_TEAM/);
  assert.throws(() => resolveInterrogation({
    ...resolutionPayload,
    team: [{ ...eliteAgent, agentId: undefined }],
    executorAgentId: 'AGENT-1',
  }), /INVALID_TEAM/);
  assert.throws(() => resolveInterrogation({
    ...resolutionPayload,
    questionId: 'question:Lvl_01:npc_01:evidence:c_02',
  }), /STALE_OPTIONS|QUESTION_LOCKED/);
});

test('link and structured report rules remain deterministic and keep answers server-side', () => {
  const secret = getCaseSecret('Lvl_01');
  const [clueAId, clueBId] = secret.validEdges[0];
  assert.equal(checkLink({ caseId: 'Lvl_01', clueAId, clueBId }).isValid, true);
  const clueIds = Object.keys(secret.clues);
  const invalidPair = clueIds.flatMap((a, index) => clueIds.slice(index + 1).map(b => [a, b]))
    .find(([a, b]) => !secret.validEdges.some(([x, y]) => (x === a && y === b) || (x === b && y === a)));
  assert.equal(checkLink({ caseId: 'Lvl_01', clueAId: invalidPair[0], clueBId: invalidPair[1] }).isValid, false);

  const validEvidence = [...new Set(secret.validEdges.flat())].slice(0, 3);
  const optionPayload = { caseId: 'Lvl_01', runId: 'report-run', unlockedClueIds: validEvidence, lang: 'zh' };
  const options = buildReportOptions(optionPayload);
  assert.deepEqual(buildReportOptions(optionPayload), options);
  assert.ok(options.conclusions.some(item => item.id === 'conclusion:mei'));
  assert.equal(JSON.stringify(options).includes('correct'), false);

  const sReport = judgeReport({
    ...optionPayload,
    conclusionId: 'conclusion:mei', methodId: 'method:emp', motiveId: 'motive:revenge',
    timelineId: 'timeline:2317', evidenceIds: validEvidence,
  });
  assert.equal(sReport.score, 'S');
  const cReport = judgeReport({
    ...optionPayload,
    conclusionId: 'conclusion:mei', methodId: 'method:network_only', motiveId: 'motive:random',
    timelineId: 'timeline:unknown', evidenceIds: validEvidence.slice(0, 1),
  });
  assert.equal(cReport.score, 'C');
  const wrongConclusion = options.conclusions.find(item => item.id !== 'conclusion:mei').id;
  assert.equal(judgeReport({
    ...optionPayload,
    conclusionId: wrongConclusion, methodId: 'method:emp', motiveId: 'motive:revenge',
    timelineId: 'timeline:2317', evidenceIds: validEvidence,
  }).score, 'D');
  assert.throws(() => judgeReport({
    ...optionPayload,
    conclusionId: 'conclusion:forged-client-answer', methodId: 'method:emp', motiveId: 'motive:revenge',
    timelineId: 'timeline:2317', evidenceIds: validEvidence,
  }), /INVALID_REPORT_OPTION/);
});
