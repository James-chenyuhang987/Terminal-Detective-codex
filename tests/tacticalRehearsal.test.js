import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REHEARSAL_EVENTS,
  evaluateRehearsalChoice,
  getRehearsalEvent,
  summarizeRehearsal,
} from '../src/game/tacticalRehearsal.js';
import { calcCaseMatchScore, getCaseMatchConfig, getCaseMatchFeedback } from '../src/game/casePresets.js';

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

  const balanced = getCaseMatchFeedback([
    { hack_level: 28, observation_focus: 28 },
  ], { weights: { hack_level: 0.5, observation_focus: 0.5 } });
  assert.equal(balanced.strengths.length, 2);
  assert.equal(balanced.risks.length, 0);
});

test('case matching keeps empty or malformed formations finite and honest', () => {
  const empty = calcCaseMatchScore([]);
  assert.equal(empty.score, 0);
  assert.deepEqual(empty.ratios, {
    hack_level: 0,
    logic_power: 0,
    observation_focus: 0,
  });
  assert.ok(Object.values(empty.ratios).every(Number.isFinite));

  const feedback = getCaseMatchFeedback(undefined);
  assert.deepEqual(feedback.strengths, []);
  assert.equal(feedback.risks.length, 2);
  feedback.risks.forEach(item => {
    assert.ok(Number.isFinite(item.ratio));
    assert.ok(Number.isFinite(item.percent));
  });

  const malformed = calcCaseMatchScore([
    { hack_level: -10, observation_focus: Number.POSITIVE_INFINITY },
    null,
  ], null);
  const booleanValues = calcCaseMatchScore([{ hack_level: true, logic_power: false, observation_focus: true }]);
  assert.equal(malformed.score, 0);
  assert.equal(booleanValues.score, 0);
  assert.ok(Object.values(malformed.ratios).every(Number.isFinite));
});

test('case config lookup rejects inherited and malformed case ids', () => {
  assert.equal(getCaseMatchConfig('Lvl_02').id, 'Lvl_02');
  assert.equal(getCaseMatchConfig('__proto__').id, 'Lvl_01');
  assert.equal(getCaseMatchConfig('constructor').id, 'Lvl_01');
  assert.equal(getCaseMatchConfig({ toString: () => { throw new Error('should not coerce'); } }).id, 'Lvl_01');
});

test('case feedback keeps special weight keys renderable', () => {
  const weights = Object.create(null);
  Object.defineProperty(weights, '__proto__', { enumerable: true, value: 1 });
  const feedback = getCaseMatchFeedback([{ constructor: 40 }], { weights });

  assert.equal(feedback.score, 0);
  assert.equal(feedback.risks[0].key, '__proto__');
  assert.equal(feedback.risks[0].label, '__proto__');
  assert.equal(feedback.risks[0].owner, 'TACTICAL');
});

test('case matching sanitizes weights and attributes without mutating inputs', () => {
  const formation = [
    { hack_level: 40, observation_focus: -8 },
    { hack_level: Number.NaN, observation_focus: Number.POSITIVE_INFINITY },
  ];
  const caseConfig = {
    weights: { hack_level: '2', observation_focus: 1, logic_power: Number.NaN, confusion_resistance: -1 },
  };
  const formationBefore = structuredClone(formation);
  const configBefore = structuredClone(caseConfig);

  const match = calcCaseMatchScore(formation, caseConfig);
  assert.equal(match.score, 67);
  assert.deepEqual(match.ratios, { hack_level: 1, observation_focus: 0 });
  assert.deepEqual(formation, formationBefore);
  assert.deepEqual(caseConfig, configBefore);

  const invalidWeights = getCaseMatchFeedback([], { weights: { hack_level: Number.NaN, observation_focus: -1 } });
  assert.equal(invalidWeights.score, 0);
  assert.ok(invalidWeights.risks.every(item => Number.isFinite(item.percent)));
});

test('tactical rehearsal handles high, medium, low, and malformed choices', () => {
  const high = evaluateRehearsalChoice(REHEARSAL_EVENTS[1], { agent_id: 'NEXUS', logic_power: 40, confusion_resistance: 40 });
  const medium = evaluateRehearsalChoice(REHEARSAL_EVENTS[1], { agent_id: 'NEXUS', logic_power: 20, confusion_resistance: 20 });
  const low = evaluateRehearsalChoice(REHEARSAL_EVENTS[0], {});
  const malformed = evaluateRehearsalChoice(null, { logic_power: -20 });
  const booleanValues = evaluateRehearsalChoice(REHEARSAL_EVENTS[0], { observation_focus: true });
  const unknownEvent = evaluateRehearsalChoice({ actionTag: '__proto__', riskLevel: 'constructor' }, { observation_focus: Symbol(), agent_id: Symbol() });

  assert.deepEqual([high.expertise, high.outcome], [100, 'clean']);
  assert.deepEqual([medium.expertise, medium.outcome], [50, 'tradeoff']);
  assert.deepEqual([low.expertise, low.outcome], [0, 'exposed']);
  assert.equal(booleanValues.expertise, 0);
  assert.equal(malformed.focusKeys[0], 'observation_focus');
  assert.equal(malformed.mitigation, 0);
  assert.ok(malformed.confusion.every(Number.isFinite));
  assert.equal(unknownEvent.focusKeys[0], 'observation_focus');
  assert.equal(unknownEvent.forecast.trap, 22);
  assert.equal(unknownEvent.agentId, null);
});

test('rehearsal summary ignores malformed rows and clamps expertise', () => {
  assert.deepEqual(summarizeRehearsal([
    { expertise: 140, outcome: 'clean' },
    null,
    [],
    { expertise: -20, outcome: 'exposed' },
    { expertise: Number.NaN, outcome: 'tradeoff' },
    { outcome: 'tradeoff' },
  ]), {
    averageExpertise: 50,
    clean: 1,
    exposed: 1,
    tradeoffs: 0,
  });
});
