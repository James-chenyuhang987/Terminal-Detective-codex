import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalThought,
  buildPublicCaseContext,
  NARRATIVE_ACTIONS,
  NARRATIVE_OUTCOMES,
  renderNarrative,
  resolvePublicZoneName,
} from '../src/game/narrativeEngine.js';
import { Case_Data_Lvl_01, localizeCase } from '../src/game/caseData.js';
import { createInitialGameState, generateObservation } from '../src/game/gameState.js';

test('local narrative library covers every action and outcome with at least six bilingual variants', () => {
  for (const actionTag of NARRATIVE_ACTIONS) {
    for (const outcome of NARRATIVE_OUTCOMES) {
      for (const lang of ['zh', 'en']) {
        const variants = new Set();
        for (let index = 0; index < 96; index += 1) {
          const result = renderNarrative({
            actionTag,
            outcome,
            lang,
            agentName: 'AURORA-09',
            zoneName: 'PUBLIC ZONE',
            clueName: 'PUBLIC CLUE',
            seed: `coverage:${actionTag}:${outcome}:${lang}:${index}`,
          });
          assert.ok(result.text.length > 12);
          variants.add(result.templateId);
        }
        assert.ok(variants.size >= 6, `${actionTag}/${outcome}/${lang} only rendered ${variants.size} variants`);
      }
    }
  }
});

test('narrative output is stable and recent template ids prevent immediate repetition', () => {
  const event = {
    actionTag: 'analyze_forensics', outcome: 'clue', lang: 'zh',
    agentName: 'AURORA-09', zoneName: '法证室', clueName: '公开证物', seed: 'stable-seed',
  };
  const first = renderNarrative(event);
  assert.deepEqual(renderNarrative(event), first);
  const next = renderNarrative(event, [first.templateId]);
  assert.notEqual(next.templateId, first.templateId);
});

test('narrative engine only interpolates explicit safe public fields', () => {
  const event = {
    actionTag: 'search_area', outcome: 'progress', lang: 'en', seed: 'privacy',
    agentName: 'NEXUS-01', zoneName: 'PUBLIC ATRIUM', clueName: 'PUBLIC TRACE',
    killer: 'SHOULD_NEVER_RENDER', truth: 'HIDDEN_TRUTH_SHOULD_NEVER_RENDER',
  };
  const text = renderNarrative(event).text;
  assert.doesNotMatch(text, /SHOULD_NEVER_RENDER|HIDDEN_TRUTH_SHOULD_NEVER_RENDER/);
});

test('first turn creates a coherent public case opening without leaking internal zone ids', () => {
  const caseData = localizeCase(Case_Data_Lvl_01, 'zh');
  const state = createInitialGameState(caseData);
  const context = buildPublicCaseContext({ gameState: state, caseData, lang: 'zh' });
  const observation = generateObservation(state, caseData, 'zh');
  const thought = buildLocalThought({
    gameState: state,
    caseData,
    agentStrategy: { primary_agent_id: 'AURORA-09', team: [{ agent_id: 'AURORA-09' }] },
    observation,
    lang: 'zh',
  });

  assert.equal(context.isOpening, true);
  assert.equal(context.zoneName, '数据中心 · 案发现场');
  assert.match(observation, /案件开场.*霓虹血迹/s);
  assert.match(observation, /Victor Zhao/);
  assert.match(observation, /相关人员.*Mei Lin/s);
  assert.match(observation, /首要任务/);
  assert.match(thought, /第一条判断必须从现场/);
  assert.doesNotMatch(`${observation}\n${thought}`, /zone_datacenter/);
});

test('public zone resolver and narrative output replace raw internal ids with readable fallbacks', () => {
  assert.equal(resolvePublicZoneName(Case_Data_Lvl_01, 'zone_datacenter', 'en'), 'Data Center · Crime Scene');
  const text = renderNarrative({
    actionTag: 'search_area', outcome: 'progress', lang: 'zh',
    zoneId: 'zone_datacenter', clueIds: ['c_01'], seed: 'raw-id-guard',
  }).text;
  assert.doesNotMatch(text, /zone_datacenter|c_01/);
});
