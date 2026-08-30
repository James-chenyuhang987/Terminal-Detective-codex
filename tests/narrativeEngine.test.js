import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NARRATIVE_ACTIONS,
  NARRATIVE_OUTCOMES,
  renderNarrative,
} from '../src/game/narrativeEngine.js';

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

