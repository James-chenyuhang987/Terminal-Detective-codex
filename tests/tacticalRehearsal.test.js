import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TACTICAL_SCENES,
  advanceTacticalRehearsal,
  buildTacticalRehearsal,
  getTacticalScenes,
  resolveTacticalChoice,
} from '../src/game/tacticalRehearsal.js';
import {
  CASE_NEON_BLOOD,
  GENERAL_FORMATION_CONFIG,
  buildCaseMatchReadout,
  calcCaseMatchScore,
  compareCaseMatchReadouts,
  getCaseMatchConfig,
} from '../src/game/casePresets.js';
import { AGENT_SPECIALTIES, calcTeamSynergy, effectiveAttrs } from '../src/game/specialtySystem.js';

const starterTeam = [
  {
    agent_id: 'NEXUS-01',
    logic_power: 20,
    observation_focus: 10,
    confusion_resistance: 10,
    hack_level: 10,
  },
  {
    agent_id: 'AURORA-09',
    logic_power: 10,
    observation_focus: 20,
    confusion_resistance: 10,
    hack_level: 10,
  },
  {
    agent_id: 'CIPHER-47',
    logic_power: 10,
    observation_focus: 10,
    confusion_resistance: 10,
    hack_level: 20,
  },
];

function rehearsal(team = starterTeam, patch = {}) {
  return buildTacticalRehearsal({
    agents: team,
    synergy_skills: [],
    command_plan: { doctrine_id: 'evidence_control', contingency_id: 'cognitive_stabilizer' },
    ...patch,
  });
}

function teamFromSpecs(specs) {
  return specs.map((spec, index) => ({
    agent_id: AGENT_SPECIALTIES[index].id,
    ...effectiveAttrs(index, spec),
  }));
}

test('tactical rehearsal exposes a stable three-scene order', () => {
  const first = rehearsal();
  const second = rehearsal();
  assert.deepEqual(first.scenes.map(scene => scene.id), [
    'surveillance_gap',
    'testimony_conflict',
    'terminal_anomaly',
  ]);
  assert.deepEqual(first.scenes.map(scene => scene.id), second.scenes.map(scene => scene.id));
  assert.deepEqual(first.scenes.map(scene => scene.options.map(option => option.agentId)), second.scenes.map(scene => scene.options.map(option => option.agentId)));
  assert.equal(first.durationSeconds, 45);
  assert.deepEqual(getTacticalScenes().map(scene => scene.id), first.scenes.map(scene => scene.id));
});

test('published scene definitions are deeply frozen', () => {
  assert.equal(Object.isFrozen(TACTICAL_SCENES), true);
  for (const scene of TACTICAL_SCENES) {
    assert.equal(Object.isFrozen(scene), true);
    assert.equal(Object.isFrozen(scene.options), true);
    for (const option of scene.options) {
      assert.equal(Object.isFrozen(option), true);
      assert.equal(Object.isFrozen(option.focus), true);
    }
  }

  const originalWeight = TACTICAL_SCENES[0].options[0].focus.logic_power;
  assert.throws(() => {
    TACTICAL_SCENES[0].options[0].focus.logic_power = 0;
  }, TypeError);
  assert.equal(TACTICAL_SCENES[0].options[0].focus.logic_power, originalWeight);
});

test('general formation uses balanced public weights instead of a case preset', () => {
  assert.equal(GENERAL_FORMATION_CONFIG.id, 'GENERAL');
  assert.deepEqual(GENERAL_FORMATION_CONFIG.weights, {
    logic_power: 0.25,
    observation_focus: 0.25,
    confusion_resistance: 0.25,
    hack_level: 0.25,
  });
  assert.equal(Object.values(GENERAL_FORMATION_CONFIG.weights).reduce((sum, weight) => sum + weight, 0), 1);
  assert.equal(getCaseMatchConfig('GENERAL'), GENERAL_FORMATION_CONFIG);

  const general = rehearsal(starterTeam, { caseConfig: GENERAL_FORMATION_CONFIG });
  const generalById = rehearsal(starterTeam, { caseId: 'GENERAL' });
  const neon = rehearsal(starterTeam, { caseConfig: CASE_NEON_BLOOD });
  assert.equal(general.caseId, 'GENERAL');
  assert.deepEqual(generalById.caseWeights, GENERAL_FORMATION_CONFIG.weights);
  assert.deepEqual(general.caseWeights, GENERAL_FORMATION_CONFIG.weights);
  assert.notDeepEqual(general.caseWeights, neon.caseWeights);
});

test('match feedback normalizes invalid attributes and does not invent an empty-roster strength', () => {
  const invalidTeam = [{ agent_id: 'BROKEN', logic_power: Infinity, hack_level: -10 }];
  const score = calcCaseMatchScore(invalidTeam, GENERAL_FORMATION_CONFIG);
  const readout = buildCaseMatchReadout(invalidTeam, GENERAL_FORMATION_CONFIG);

  assert.equal(score.ratios.logic_power, 0);
  assert.equal(readout.coverage.find(item => item.key === 'logic_power')?.ratio, 0);
  assert.deepEqual(buildCaseMatchReadout([], GENERAL_FORMATION_CONFIG).strengths, []);
});

test('match feedback attributes each capability to the actual strongest agent', () => {
  const customTeam = [
    { agent_id: 'ORBIT-12', logic_power: 7, observation_focus: 39, confusion_resistance: 8, hack_level: 12 },
    { agent_id: 'EMBER-04', logic_power: 40, observation_focus: 9, confusion_resistance: 13, hack_level: 6 },
    { agent_id: 'MIRAGE-88', logic_power: 11, observation_focus: 14, confusion_resistance: 38, hack_level: 36 },
  ];
  const score = calcCaseMatchScore(customTeam, GENERAL_FORMATION_CONFIG);
  const readout = buildCaseMatchReadout(customTeam, GENERAL_FORMATION_CONFIG);
  const owners = Object.fromEntries(readout.coverage.map(item => [item.key, item.owner]));

  assert.deepEqual(score.owners, {
    logic_power: 'EMBER-04',
    observation_focus: 'ORBIT-12',
    confusion_resistance: 'MIRAGE-88',
    hack_level: 'MIRAGE-88',
  });
  assert.deepEqual(owners, score.owners);
  assert.ok(readout.coverage.every(item => item.agentIndex >= 0));
});

test('weak and balanced squads keep their actual coverage classification', () => {
  const unallocated = buildCaseMatchReadout(teamFromSpecs([{}, {}, {}]));
  assert.deepEqual(unallocated.strengths, []);
  assert.deepEqual(unallocated.risks.map(item => item.key), ['hack_level', 'logic_power', 'observation_focus']);
  assert.ok(unallocated.risks.every(item => item.ratio === 0.5));

  const balanced = buildCaseMatchReadout(teamFromSpecs([
    { logic_power: 5 }, { observation_focus: 5 }, { hack_level: 5 },
  ]));
  assert.deepEqual(balanced.strengths, []);
  assert.deepEqual(balanced.risks, []);
  assert.ok(balanced.coverage.every(item => item.ratio === 0.625));
});

test('public feedback prioritizes weighted gaps and coverage without mutating inputs', () => {
  const team = teamFromSpecs([{}, {}, {}]);
  const originalTeam = structuredClone(team);
  const originalConfig = structuredClone(GENERAL_FORMATION_CONFIG);
  const readout = buildCaseMatchReadout(team, GENERAL_FORMATION_CONFIG);

  assert.deepEqual(readout.risks.map(item => item.key), [
    'confusion_resistance', 'logic_power', 'observation_focus', 'hack_level',
  ]);
  assert.equal(readout.risks[0].ratio, 0.25);
  assert.deepEqual(readout.coverage.map(item => item.key), Object.keys(GENERAL_FORMATION_CONFIG.weights));
  assert.deepEqual(team, originalTeam);
  assert.deepEqual(GENERAL_FORMATION_CONFIG, originalConfig);
  assert.deepEqual(buildCaseMatchReadout(team, GENERAL_FORMATION_CONFIG), readout);

  const strong = buildCaseMatchReadout(teamFromSpecs([
    { logic_power: 20 }, { observation_focus: 20 }, { hack_level: 10 },
  ]));
  assert.deepEqual(strong.strengths.map(item => item.key), ['logic_power', 'hack_level', 'observation_focus']);
});

test('a legal specialty shift can improve coverage without inventing a sacrifice', () => {
  const before = buildCaseMatchReadout(teamFromSpecs([
    { logic_power: 10, confusion_resistance: 10 },
    { logic_power: 20 },
    { hack_level: 20 },
  ]));
  const after = buildCaseMatchReadout(teamFromSpecs([
    { logic_power: 10, confusion_resistance: 10 },
    { logic_power: 10, observation_focus: 10 },
    { hack_level: 20 },
  ]));
  const originalBefore = structuredClone(before);
  const originalAfter = structuredClone(after);
  const change = compareCaseMatchReadouts(before, after);

  assert.equal(before.tradeoff.conditional, true);
  assert.equal(before.tradeoff.sacrifice.conditional, true);
  assert.equal(change.gains.length, 1);
  assert.equal(change.gains[0].key, 'observation_focus');
  assert.equal(change.gains[0].previousValue, 20);
  assert.equal(change.gains[0].value, 30);
  assert.equal(change.gains[0].delta, 10);
  assert.equal(change.gains[0].ratioDelta, 0.25);
  assert.equal(change.gains[0].owner, 'AURORA-09');
  assert.deepEqual(change.losses, []);
  assert.deepEqual(before, originalBefore);
  assert.deepEqual(after, originalAfter);

  const reverse = compareCaseMatchReadouts(after, before);
  assert.deepEqual(reverse.gains, []);
  assert.equal(reverse.losses[0].delta, -10);
  assert.equal(reverse.losses[0].ratioDelta, -0.25);
});

test('readout comparison reports actual gains and losses and ignores unrelated changes', () => {
  const beforeTeam = teamFromSpecs([
    { logic_power: 10, confusion_resistance: 10 },
    { logic_power: 10, observation_focus: 10 },
    { hack_level: 10, ap_cost_discount: 10 },
  ]);
  const afterTeam = teamFromSpecs([
    { logic_power: 5, confusion_resistance: 15 },
    { logic_power: 10, observation_focus: 10 },
    { hack_level: 10, ap_cost_discount: 10 },
  ]);
  const before = buildCaseMatchReadout(beforeTeam, GENERAL_FORMATION_CONFIG);
  const after = buildCaseMatchReadout(afterTeam, GENERAL_FORMATION_CONFIG);
  const change = compareCaseMatchReadouts(before, after);
  assert.deepEqual(change.gains.map(item => [item.key, item.delta]), [['confusion_resistance', 5]]);
  assert.deepEqual(change.losses.map(item => [item.key, item.delta]), [['logic_power', -5]]);

  const empty = { gains: [], losses: [] };
  assert.deepEqual(compareCaseMatchReadouts(before, before), empty);
  assert.deepEqual(compareCaseMatchReadouts(null, after), empty);
  assert.deepEqual(compareCaseMatchReadouts(before, buildCaseMatchReadout(afterTeam, CASE_NEON_BLOOD)), empty);
  assert.deepEqual(compareCaseMatchReadouts(before, buildCaseMatchReadout(
    beforeTeam.map(agent => ({ ...agent, agent_id: `REPLACEMENT-${agent.agent_id}` })),
    GENERAL_FORMATION_CONFIG,
  )), empty);
});

test('rehearsal summary reuses the public case match readout', () => {
  const expected = buildCaseMatchReadout(starterTeam, GENERAL_FORMATION_CONFIG, 'zh');
  const state = rehearsal(starterTeam, { caseConfig: GENERAL_FORMATION_CONFIG });

  assert.deepEqual(state.summary, expected);
  assert.deepEqual(state.coverage, expected.coverage);
  assert.deepEqual(state.strengths, expected.strengths);
  assert.deepEqual(state.risks, expected.risks);
  assert.deepEqual(state.tradeoffs, expected.tradeoffs);
});

test('agent attributes and synergy visibly change rehearsal options', () => {
  const baseline = rehearsal();
  const specialistTeam = starterTeam.map(agent => ({ ...agent }));
  specialistTeam[1].observation_focus = 40;
  specialistTeam[2].hack_level = 40;
  const specialist = rehearsal(specialistTeam, { synergy_skills: ['digital_forensics'] });

  const baselineObservation = baseline.scenes[0].options.find(option => option.agentId === 'AURORA-09');
  const specialistObservation = specialist.scenes[0].options.find(option => option.agentId === 'AURORA-09');
  const baselineTechnical = baseline.scenes[0].options.find(option => option.agentId === 'CIPHER-47');
  const specialistTechnical = specialist.scenes[0].options.find(option => option.agentId === 'CIPHER-47');
  assert.ok(specialistObservation.fitScore > baselineObservation.fitScore);
  assert.ok(specialistTechnical.fitScore > baselineTechnical.fitScore);
  assert.notDeepEqual(specialist.summary.strengths, baseline.summary.strengths);
  assert.ok(specialist.matchScore >= 0 && specialist.matchScore <= 100);
});

test('public skill effects and risk explanations change the rehearsal without persistence', () => {
  const baseline = rehearsal();
  const withEffects = rehearsal(starterTeam, {
    skill_effects: { bonus_hack_chance: 0.12, bonus_clue_chance: 0.08 },
  });
  const baseTechnical = baseline.scenes[0].options.find(option => option.agentId === 'CIPHER-47');
  const boostedTechnical = withEffects.scenes[0].options.find(option => option.agentId === 'CIPHER-47');
  assert.ok(boostedTechnical.fitScore > baseTechnical.fitScore);
  assert.equal(typeof boostedTechnical.risk, 'string');
  assert.equal(typeof boostedTechnical.riskEn, 'string');
  assert.ok(Object.hasOwn(boostedTechnical, 'signals'));

  const strong = rehearsal([
    { agent_id: 'NEXUS-01', logic_power: 40, observation_focus: 10, confusion_resistance: 40, hack_level: 10 },
    { agent_id: 'AURORA-09', logic_power: 40, observation_focus: 40, confusion_resistance: 10, hack_level: 10 },
    { agent_id: 'CIPHER-47', logic_power: 10, observation_focus: 10, confusion_resistance: 10, hack_level: 40 },
  ], { synergy_skills: ['cross_validation', 'digital_forensics', 'ghost_protocol'] });
  assert.ok(strong.scenes[0].options.some(option => option.riskDelta < 0));
});

test('equipped skill-tree keys and support tempo effects change matching options', () => {
  const baseline = rehearsal();
  const hackingSkill = rehearsal(starterTeam, {
    skill_effects: { hack_success_rate: 0.20 },
  });
  const apSkill = rehearsal(starterTeam, {
    skill_effects: { ap_cost_discount: 0.15 },
  });
  const confusionSkill = rehearsal(starterTeam, {
    skill_effects: { npc_confusion_reduce: 0.20, interrogation_bonus: 0.30 },
  });

  const technical = value => value.scenes[0].options.find(option => option.agentId === 'CIPHER-47');
  const interrogation = value => value.scenes[1].options.find(option => option.agentId === 'CIPHER-47');
  assert.ok(technical(hackingSkill).fitScore > technical(baseline).fitScore);
  assert.ok(technical(apSkill).fitScore > technical(baseline).fitScore);
  assert.ok(interrogation(confusionSkill).fitScore > interrogation(baseline).fitScore);
  assert.ok(technical(hackingSkill).signals.skill > 0);
});

test('spending spare specialty points on action efficiency improves only the handler tempo', () => {
  const specs = [
    { logic_power: 10, confusion_resistance: 10 },
    { observation_focus: 10, logic_power: 10 },
    { hack_level: 10 },
  ];
  const improvedSpecs = specs.map((spec, index) => index === 2 ? { ...spec, ap_cost_discount: 10 } : { ...spec });
  const activeSkills = values => calcTeamSynergy(values).active.map(skill => skill.id);
  assert.deepEqual(activeSkills(specs), activeSkills(improvedSpecs));
  const before = rehearsal(teamFromSpecs(specs), { synergy_skills: activeSkills(specs) });
  const after = rehearsal(teamFromSpecs(improvedSpecs), { synergy_skills: activeSkills(improvedSpecs) });

  for (const [index, scene] of before.scenes.entries()) {
    assert.deepEqual(after.scenes[index].options.slice(0, 2), scene.options.slice(0, 2));
    const initial = scene.options[2];
    const improved = after.scenes[index].options[2];
    assert.equal(initial.signals.efficiency, 4);
    assert.equal(improved.signals.efficiency, 8);
    assert.equal(improved.impact.tempo - initial.impact.tempo, 4);
    assert.equal(improved.fitScore, initial.fitScore);
    assert.equal(improved.impact.clarity, initial.impact.clarity);
    assert.equal(improved.impact.stability, initial.impact.stability);
    assert.equal(improved.riskDelta, initial.riskDelta);
    assert.match(improved.reason, /20%.*\+8/);
    assert.match(improved.reasonEn, /20%.*8 handling tempo/);
  }
  assert.equal(after.matchScore, before.matchScore);
});

test('rehearsal efficiency signals and metrics stay bounded for extreme attributes', () => {
  for (const [discount, expected] of [[-10, 0], [Infinity, 0], [NaN, 0], [30, 12], [300, 12]]) {
    const state = rehearsal(starterTeam.map(agent => ({ ...agent, ap_cost_discount: discount })));
    for (const option of state.scenes.flatMap(scene => scene.options)) {
      assert.equal(option.signals.efficiency, expected);
      assert.ok(option.impact.tempo >= 0 && option.impact.tempo <= 100);
    }
  }
});

test('full public coverage never appears as both a strength and a risk', () => {
  const fullTeam = starterTeam.map(agent => ({
    ...agent,
    logic_power: 40,
    observation_focus: 40,
    confusion_resistance: 40,
    hack_level: 40,
  }));
  const rehearsalState = rehearsal(fullTeam);
  const rehearsalStrengths = new Set(rehearsalState.strengths.map(item => item.key));
  assert.equal(rehearsalState.risks.some(item => rehearsalStrengths.has(item.key)), false);

  const readout = buildCaseMatchReadout(fullTeam);
  const readoutStrengths = new Set(readout.strengths.map(item => item.key));
  assert.equal(readout.risks.some(item => readoutStrengths.has(item.key)), false);
});

test('choices are free, replaceable and do not mutate the source rehearsal', () => {
  const initial = rehearsal();
  const firstScene = initial.scenes[0];
  const firstChoice = advanceTacticalRehearsal(initial, firstScene.id, firstScene.options[0].agentId);
  assert.equal(initial.progress.completedScenes, 0);
  assert.equal(firstChoice.progress.completedScenes, 1);
  assert.equal(firstChoice.choices.length, 1);
  assert.equal(firstChoice.choices[0].risk, firstScene.options[0].risk);
  assert.equal(firstChoice.choices[0].riskEn, firstScene.options[0].riskEn);

  const retry = advanceTacticalRehearsal(firstChoice, firstScene.id, firstScene.options[2].agentId);
  assert.equal(retry.progress.completedScenes, 1);
  assert.equal(retry.choices.length, 1);
  assert.equal(retry.choices[0].agentId, firstScene.options[2].agentId);

  const second = advanceTacticalRehearsal(retry, retry.scenes[1].id, retry.scenes[1].options[1].agentId);
  const complete = advanceTacticalRehearsal(second, second.scenes[2].id, second.scenes[2].options[2].agentId);
  assert.equal(complete.completed, true);
  assert.equal(complete.progress.completedScenes, 3);
  assert.equal(complete.activeSceneId, null);
  assert.equal(resolveTacticalChoice(initial, 'missing_scene', 'NEXUS-01').error, 'invalid_tactical_choice');
});

test('rehearsal output contains no persistent or hidden-answer fields', () => {
  const value = rehearsal(starterTeam.map((agent, index) => ({
    ...agent,
    stamina: 12,
    profile: { private_note: index },
  })));
  const forbidden = new Set(['reward', 'rewards', 'stamina', 'profile', 'answer', 'solution', 'culprit']);
  const visit = current => {
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      assert.equal(forbidden.has(key.toLowerCase()), false, `forbidden field: ${key}`);
      visit(child);
    }
  };
  visit(value);
  const serialized = JSON.stringify(value).toLowerCase();
  for (const word of forbidden) assert.equal(serialized.includes(`"${word}"`), false, `serialized field: ${word}`);
  assert.equal(value.profile, undefined);
  assert.equal(value.stamina, undefined);
  assert.equal(value.rewards, undefined);
});
