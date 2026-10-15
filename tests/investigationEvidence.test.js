import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvestigationEvidence } from '../src/game/investigationEvidence.js';

test('investigation archive joins only earned evidence to public sources and earned expert observations', () => {
  const input = { state: { unlocked_clues: ['earned', 'missing-record'], revealed_clues: [
    { clue_id: 'earned', keyword: '签章', description: '复制卡使用另一签章。', en: { keyword: 'Signature', description: 'The copied card uses another signature.' } },
    { clue_id: 'hidden', keyword: 'Never reveal this', description: 'unearned text' },
  ] }, investigation: {
    targets: [{ target_id: 'reader', label: { zh: '读卡器', en: 'Card reader' }, zone_label: { zh: '入口', en: 'Entrance' } }],
    completed_checks: [{ target_id: 'reader', clue_ids: ['earned'], expert_note: { zh: '分开记录签章。', en: 'Preserve signatures separately.' } },
      { target_id: 'hidden-source', clue_ids: ['hidden'], expert_note: { en: 'unearned analysis' } }],
  } };
  const before = JSON.stringify(input);
  const en = buildInvestigationEvidence({ ...input, lang: 'en' });
  assert.deepEqual(en.clues.map(clue => clue.clue_id), ['earned']);
  assert.equal(en.clues[0].keyword, 'Signature');
  assert.equal(en.clues[0].description, 'The copied card uses another signature.');
  assert.equal(en.sources.earned, 'Card reader · Entrance');
  assert.equal(en.expertNotes.earned, 'Preserve signatures separately.');
  assert.equal(JSON.stringify(en).includes('unearned'), false);
  const zh = buildInvestigationEvidence({ ...input, lang: 'zh' });
  assert.equal(zh.clues[0].keyword, '签章');
  assert.equal(zh.sources.earned, '读卡器 · 入口');
  assert.equal(JSON.stringify(input), before, 'reading never mutates the authoritative snapshot');
});

test('archive handles legacy snapshots and missing optional metadata without inventing clues or professional notes', () => {
  assert.deepEqual(buildInvestigationEvidence({}), { clues: [], sources: {}, expertNotes: {} });
  const state = { unlocked_clues: ['a'], revealed_clues: [{ clue_id: 'a', keyword: 'Known', description: 'Earned record.' }] };
  const legacy = buildInvestigationEvidence({ state, lang: 'en' });
  assert.equal(legacy.clues[0].description, 'Earned record.');
  assert.deepEqual(legacy.expertNotes, {});
  const withZone = buildInvestigationEvidence({ state, investigation: { clue_zones: { a: 'lobby' } }, zones: { lobby: { label: 'Lobby' } } });
  assert.equal(withZone.sources.a, 'Lobby');
});
