import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_REPORT_DRAFT_BYTES, REPORT_DRAFT_PREFIX, defaultReportDraft, normalizeReportDraft,
  sanitizeReportDraft, readReportDraft, writeReportDraft, removeReportDraft,
} from '../src/game/reportDraft.js';

const context = { ownerUid: 'owner-a', runId: 'run-1', caseId: 'Lvl_01', investigationVersion: 2 };
const draft = { conclusionId: 'suspect-1', methodId: 'method-1', motiveId: 'motive-1', timelineId: 'timeline-1',
  evidenceIds: ['ignored-flat-id'], evidenceByDimension: { opportunity: ['c_01', 'c_02'], method: ['c_02'], timeline: ['c_03'] } };

function storage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const scopeKey = value => `${REPORT_DRAFT_PREFIX}${encodeURIComponent(value.ownerUid)}:${encodeURIComponent(value.runId)}`;
function options(extra = {}) {
  return { conclusions: [{ id: 'suspect-1', label: 'Private prose must not be stored' }], methods: [{ id: 'method-1' }],
    motives: [{ id: 'motive-1' }], timelines: [{ id: 'timeline-1' }],
    availableEvidence: ['c_01', 'c_02', 'c_04'].map(id => ({ id })), ...extra };
}

test('session refresh restores only report references, never authority state or option prose', () => {
  const store = storage();
  const result = writeReportDraft(context, { ...draft, AP: 999, rewards: { gold: 99 }, runSnapshot: { secret: true },
    label: 'suspect description', evidenceByDimension: { ...draft.evidenceByDimension, secret: ['private-answer'] } }, store);
  assert.equal(result.status, 'saved');
  const saved = JSON.parse(store.getItem(scopeKey(context)));
  assert.deepEqual(Object.keys(saved).sort(), ['case_id', 'draft', 'investigation_version', 'owner_uid', 'run_id', 'version']);
  assert.deepEqual(saved.draft, { ...draft, evidenceIds: ['c_01', 'c_02', 'c_03'] });
  assert.ok(!JSON.stringify(saved).includes('private') && !JSON.stringify(saved).includes('AP'));
  assert.deepEqual(readReportDraft(context, store), result);
});

test('draft keys isolate the complete owner and run even when identifiers contain delimiters', () => {
  const store = storage();
  const scopes = [context, { ...context, ownerUid: 'owner' }, { ...context, runId: 'run-2' },
    { ...context, ownerUid: 'a:b', runId: 'c' }, { ...context, ownerUid: 'a', runId: 'b:c' },
    { ...context, ownerUid: '探员:甲' }];
  scopes.forEach((scope, index) => writeReportDraft(scope, { ...draft, conclusionId: `choice-${index}` }, store));
  assert.equal(store.data.size, scopes.length);
  scopes.forEach((scope, index) => assert.equal(readReportDraft(scope, store).value.conclusionId, `choice-${index}`));
  assert.equal(readReportDraft({ ...context, ownerUid: 'owner-unknown' }, store).status, 'empty');
});

test('case and investigation version metadata cannot restore a draft from another case or ruleset', () => {
  const store = storage();
  writeReportDraft(context, draft, store);
  for (const scope of [{ ...context, caseId: 'Lvl_02' }, { ...context, investigationVersion: 1 }]) {
    assert.deepEqual(readReportDraft(scope, store), { value: defaultReportDraft(), status: 'memory' });
  }
  assert.equal(readReportDraft(context, store).status, 'saved');
});

test('v1 retains bounded legacy evidence choices without converting to a v2 report', () => {
  const store = storage();
  const legacy = { ...context, investigationVersion: 1 };
  const result = writeReportDraft(legacy, { ...draft, evidenceIds: ['c_01', 'c_01', 'c_02', 'c_03', 'c_04', 'c_05'] }, store);
  assert.deepEqual(result.value.evidenceIds, ['c_01', 'c_02', 'c_03', 'c_04']);
  assert.deepEqual(result.value.evidenceByDimension, {});
  assert.deepEqual(readReportDraft(legacy, store), result);
});

test('normalization keeps cross-dimension citations but rejects invalid IDs and prototype objects', () => {
  const value = normalizeReportDraft({ ...draft, methodId: '<script>', motiveId: 'x'.repeat(181),
    evidenceByDimension: { opportunity: ['c_01', 'c_01', '<img>', null, {}, 'c_02'], method: ['c_01'],
      timeline: Array.from({ length: 30 }, (_, index) => `c_${index}`) } });
  assert.equal(value.methodId, '');
  assert.equal(value.motiveId, '');
  assert.deepEqual(value.evidenceByDimension.opportunity, ['c_01', 'c_02']);
  assert.deepEqual(value.evidenceByDimension.method, ['c_01']);
  assert.equal(value.evidenceByDimension.timeline.length, 9);
  assert.deepEqual(normalizeReportDraft(Object.create(draft)), defaultReportDraft());
  assert.deepEqual(normalizeReportDraft(['suspect-1']), defaultReportDraft());
});

test('loading options and missing known evidence do not erase recoverable selections', () => {
  const normalized = normalizeReportDraft(draft);
  for (const authority of [{}, { reportOptions: options() }, { knownClueIds: [] },
    { reportOptions: { conclusions: [], methods: [], motives: [], timelines: [] }, knownClueIds: [] }]) {
    assert.deepEqual(sanitizeReportDraft(draft, authority), normalized);
  }
  assert.deepEqual(sanitizeReportDraft(draft), normalized);
});

test('loaded authority retains only legal choices and evidence both known and publicly available', () => {
  const actual = sanitizeReportDraft(draft, { reportOptions: options({ methods: [] }), knownClueIds: ['c_01', 'c_03'] });
  assert.equal(actual.conclusionId, 'suspect-1');
  assert.equal(actual.methodId, '');
  assert.deepEqual(actual.evidenceByDimension, { opportunity: ['c_01'] });
  assert.deepEqual(actual.evidenceIds, ['c_01']);
  const legacy = sanitizeReportDraft({ ...draft, evidenceIds: ['c_01', 'c_02', 'c_03'] },
    { reportOptions: options(), knownClueIds: ['c_02', 'c_03'], investigationVersion: 1 });
  assert.deepEqual(legacy.evidenceIds, ['c_02']);
  assert.deepEqual(legacy.evidenceByDimension, {});
  assert.deepEqual(sanitizeReportDraft(draft, { reportOptions: options({ availableEvidence: [] }), knownClueIds: [] }).evidenceIds, []);
});

test('malformed, oversized and unexpected stored envelopes are ignored safely', () => {
  const store = storage();
  writeReportDraft(context, draft, store);
  const valid = JSON.parse(store.getItem(scopeKey(context)));
  const invalid = ['{broken', ' '.repeat(MAX_REPORT_DRAFT_BYTES + 1), JSON.stringify(null), JSON.stringify([]),
    JSON.stringify({ ...valid, version: 2 }), JSON.stringify({ ...valid, owner_uid: 'another-owner' }),
    JSON.stringify({ ...valid, AP: 99 }), JSON.stringify({ ...valid, draft: { ...draft, runSnapshot: {} } })];
  for (const raw of invalid) {
    store.data.set(scopeKey(context), raw);
    assert.deepEqual(readReportDraft(context, store), { value: defaultReportDraft(), status: 'memory' });
  }
  // JS string length alone would pass this Unicode envelope, but UTF-8 bytes exceed the limit.
  const unicode = JSON.stringify({ ...valid, draft: { ...valid.draft, conclusionId: '案'.repeat(6_000) } });
  assert.ok(unicode.length < MAX_REPORT_DRAFT_BYTES);
  store.data.set(scopeKey(context), unicode);
  assert.equal(readReportDraft(context, store).status, 'memory');
});

test('read, write and remove failures fall back to the current memory value', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(readReportDraft(context, throwing).status, 'memory');
  assert.deepEqual(writeReportDraft(context, draft, throwing), { value: normalizeReportDraft(draft), status: 'memory' });
  assert.deepEqual(removeReportDraft(context, throwing), { value: defaultReportDraft(), status: 'memory' });
  assert.deepEqual(writeReportDraft(context, draft, null), { value: normalizeReportDraft(draft), status: 'memory' });
  assert.equal(readReportDraft(context, null).status, 'memory');
});

test('silently blocked writes and removals are not advertised as saved', () => {
  const blockedWrite = { getItem: () => null, setItem() {}, removeItem() {} };
  assert.equal(writeReportDraft(context, draft, blockedWrite).status, 'memory');
  const blockedRemove = { getItem: () => 'still-present', setItem() {}, removeItem() {} };
  assert.equal(removeReportDraft(context, blockedRemove).status, 'memory');
  assert.equal(writeReportDraft(context, defaultReportDraft(), blockedRemove).status, 'memory');
});

test('clearing and saving an empty report remove only the scoped report key', () => {
  const store = storage();
  const other = { ...context, runId: 'run-2' };
  writeReportDraft(context, draft, store);
  writeReportDraft(other, draft, store);
  store.setItem('td-player-run', 'authoritative-journal');
  assert.equal(removeReportDraft(context, store).status, 'empty');
  assert.equal(store.getItem(scopeKey(context)), null);
  assert.equal(readReportDraft(other, store).status, 'saved');
  assert.equal(store.getItem('td-player-run'), 'authoritative-journal');
  assert.equal(writeReportDraft(other, defaultReportDraft(), store).status, 'empty');
  assert.equal(readReportDraft(other, store).status, 'empty');
});

test('invalid or unavailable context cannot access persistent storage', () => {
  const inaccessible = { getItem() { assert.fail('invalid context read'); }, setItem() { assert.fail('invalid context write'); } };
  for (const invalid of [{}, { ...context, ownerUid: '' }, { ...context, runId: '/invalid' },
    { ...context, caseId: undefined }, { ...context, investigationVersion: 3 }]) {
    assert.equal(readReportDraft(invalid, inaccessible).status, 'memory');
    assert.equal(writeReportDraft(invalid, draft, inaccessible).status, 'memory');
    assert.equal(removeReportDraft(invalid, inaccessible).status, 'memory');
  }
});

test('default storage persists reports beyond a tab session, migrates validated legacy drafts and handles denied browser storage', t => {
  const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    for (const [key, descriptor] of [['sessionStorage', sessionDescriptor], ['localStorage', localDescriptor]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('privacy mode'); } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('privacy mode'); } });
  assert.equal(writeReportDraft(context, draft).status, 'memory');
  assert.equal(readReportDraft(context).status, 'memory');
  assert.equal(removeReportDraft(context).status, 'memory');
  const oldSession = storage();
  writeReportDraft(context, draft, oldSession);
  const store = storage();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: oldSession });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  assert.deepEqual(readReportDraft(context).value, normalizeReportDraft(draft));
  assert.equal(oldSession.data.size, 0, 'a validated old session draft moves to durable local storage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage() });
  assert.deepEqual(readReportDraft(context).value, normalizeReportDraft(draft), 'a newly opened tab session restores the same local draft');
  assert.equal(writeReportDraft(context, draft).status, 'saved');
  assert.deepEqual(readReportDraft(context).value, normalizeReportDraft(draft));
  assert.equal(removeReportDraft(context).status, 'empty');
  assert.equal(readReportDraft(context).status, 'empty');
});

test('a damaged legacy session is never copied and a failed legacy cleanup cannot resurrect a cleared report', t => {
  const previous = Object.fromEntries(['localStorage', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => Object.entries(previous).forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }));
  const durable = storage(); const legacy = storage(); const key = scopeKey(context);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: durable });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: legacy });
  legacy.setItem(key, '{broken');
  assert.equal(readReportDraft(context).status, 'memory');
  assert.equal(durable.data.size, 0);
  writeReportDraft(context, draft, legacy);
  writeReportDraft(context, draft);
  legacy.setItem(key, JSON.stringify({ version: 1, owner_uid: context.ownerUid, run_id: context.runId,
    case_id: context.caseId, investigation_version: 2, draft: normalizeReportDraft(draft) }));
  legacy.removeItem = () => {};
  assert.equal(removeReportDraft(context).status, 'memory');
  assert.deepEqual(readReportDraft(context).value, normalizeReportDraft(draft), 'the durable copy stays until the older session copy can be removed safely');
});
