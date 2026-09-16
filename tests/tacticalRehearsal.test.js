import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REHEARSAL_EVENTS,
  evaluateRehearsalChoice,
  getRehearsalEvent,
  summarizeRehearsal,
} from '../src/game/tacticalRehearsal.js';
import { getCaseMatchFeedback } from '../src/game/casePresets.js';

const agents = [
  { agent_id: 'NEXUS', logic_power: 20, observation_focus: 8, hack_level: 4, confusion_resistance: 18 },
  { agent_id: 'AURORA', logic_power: 12, observation_focus: 20, hack_level: 5, confusion_resistance: 10 },
  { agent_id: 'CIPHER', logic_power: 7, observation_focus: 6, hack_level: 20, confusion_resistance: 8 },
];

test('tactical rehearsal clamps event selection and keeps choices advisory', () => {
  assert.equal(getRehearsalEvent(-10).id, REHEARSAL_EVENTS[0].id);
  assert.equal(getRehearsalEvent(999).id, REHEARSAL_EVENTS.at(-1).id);
  const agentBefore = structuredClone(agents[2]);
  const result = evaluateRehearsalChoice(REHEARSAL_EVENTS[2], agents[2]);
  assert.equal(result.agentId, 'CIPHER');
  assert.ok(result.expertise >= 0 && result.expertise <= 100);
  assert.deepEqual(agents[2], agentBefore);
});

test('tactical rehearsal summarizes clean, tradeoff, and exposed routes', () => {
  const results = [
    { expertise: 90, outcome: 'clean' },
    { expertise: 55, outcome: 'tradeoff' },
    { expertise: 20, outcome: 'exposed' },
  ];
  assert.deepEqual(summarizeRehearsal(results), {
    averageExpertise: 55,
    clean: 1,
    tradeoffs: 1,
    exposed: 1,
  });
});

test('case feedback explains strengths and risks without a second score algorithm', () => {
  const feedback = getCaseMatchFeedback([
    { hack_level: 40, observation_focus: 8 },
    { hack_level: 10, observation_focus: 4 },
  ], {
    weights: { hack_level: 0.5, observation_focus: 0.5 },
  });
  assert.equal(feedback.strengths[0].key, 'hack_level');
  assert.equal(feedback.risks[0].key, 'observation_focus');
  assert.equal(feedback.strengths[0].percent, 100);
  assert.equal(feedback.risks[0].percent, 20);
});
