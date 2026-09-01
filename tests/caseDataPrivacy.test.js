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
