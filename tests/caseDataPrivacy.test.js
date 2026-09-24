import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { CASE_NARRATIVE_LIBRARY } from '../src/game/caseNarrativeLibrary.js';

const SERVER_ONLY_KEYS = new Set([
  'truth_summary',
  'hidden_motive',
  'valid_edges',
  'branches',
  'branch_triggers',
  'actualAlignment',
  'actual_alignment',
  'culprit',
  'killer',
  'report_answers',
]);

function collectForbiddenKeys(value, path = 'case', found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (SERVER_ONLY_KEYS.has(key)) found.push(`${path}.${key}`);
    collectForbiddenKeys(child, `${path}.${key}`, found);
  }
  return found;
}

test('public case data contains no server-only answer fields', () => {
  for (const caseData of ALL_CASES) {
    assert.deepEqual(collectForbiddenKeys(caseData, caseData.case_id), []);
  }
});

test('public dramatic narrative library contains no server-only answer fields or hidden clue ids', () => {
  assert.deepEqual(collectForbiddenKeys(CASE_NARRATIVE_LIBRARY, 'narrative'), []);
  const serialized = JSON.stringify(CASE_NARRATIVE_LIBRARY);
  assert.doesNotMatch(serialized, /\b(?:clue|c|d|e|f|g|h|i|j)_secret_[a-z0-9_:-]+\b/i);
});

test('hidden clue copy stays generic so answer text cannot ship in the client bundle', () => {
  const hiddenCopy = new Set([
    '匿名线索', '遗留数据', '离线账本', '覆盖缓存', '离线记录', '诊断缓存', '黑匣子记录', '因果快照',
    'Anonymous Lead', 'Residual Data', 'Offline Ledger', 'Override Cache', 'Offline Record',
    'Diagnostic Cache', 'Black Box Record', 'Causal Snapshot',
  ]);
  for (const caseData of ALL_CASES) {
    const hiddenIds = new Set((caseData.hidden_clues || []).map(item => item.clue_id));
    const hiddenEntries = (caseData.clue_dictionary || []).filter(item => hiddenIds.has(item.clue_id));
    assert.equal(hiddenEntries.length, hiddenIds.size, `${caseData.case_id} hidden clue mapping is incomplete`);
    for (const clue of hiddenEntries) {
      assert.ok(hiddenCopy.has(clue.keyword), `${caseData.case_id}/${clue.clue_id} exposes answer-like keyword`);
      assert.match(clue.description, /(?:待验证|尚待核验|still needs to be verified)/i);
    }
  }
});
