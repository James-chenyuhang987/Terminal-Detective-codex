const PREFIX = 'td-hypotheses-v1:';
const LIMIT = 20;
const MAX_BYTES = 32_768;
const ID = /^[A-Za-z0-9][A-Za-z0-9_:+-]{0,179}$/;
const RELATIONS = new Set(['supports', 'contradicts', 'precedes']);

export function hypothesisKey(item) {
  const pair = item.relation === 'precedes' ? [item.a, item.b] : [item.a, item.b].sort();
  return JSON.stringify([item.relation, ...pair]);
}

export function normalizeHypotheses(value, knownIds = undefined) {
  if (!Array.isArray(value)) return [];
  const known = Array.isArray(knownIds) ? new Set(knownIds) : null;
  const records = new Map();
  for (const item of value.slice(-64)) {
    if (!item || typeof item.a !== 'string' || typeof item.b !== 'string' || !ID.test(item.a) || !ID.test(item.b) || item.a === item.b
      || !RELATIONS.has(item.relation) || (known && (!known.has(item.a) || !known.has(item.b)))) continue;
    const record = { a: item.a, b: item.b, relation: item.relation,
      note: typeof item.note === 'string' ? item.note.trim().slice(0, 280) : '' };
    records.set(hypothesisKey(record), record);
  }
  return [...records.values()].slice(-LIMIT);
}

export function pendingHypotheses(items, knownIds, linkedPairs = []) {
  const confirmed = new Set(linkedPairs.filter(item => item.valid).map(item => hypothesisKey({
    a: item.a, b: item.b, relation: item.relation_type || 'supports',
  })));
  return normalizeHypotheses(items, knownIds).filter(item => !confirmed.has(hypothesisKey(item)));
}

function validContext(context) {
  return typeof context?.ownerUid === 'string' && context.ownerUid.length > 0 && context.ownerUid.length <= 128
    && typeof context.runId === 'string' && ID.test(context.runId)
    && typeof context.caseId === 'string' && ID.test(context.caseId);
}
function storageKey(context) { return `${PREFIX}${encodeURIComponent(context.ownerUid)}:${encodeURIComponent(context.runId)}`; }
function sessionStore() { try { return globalThis.sessionStorage || null; } catch { return null; } }
function bounded(raw) { return typeof raw === 'string' && raw.length <= MAX_BYTES && new TextEncoder().encode(raw).length <= MAX_BYTES; }

export function readHypotheses(context, storage = sessionStore()) {
  if (!validContext(context) || !storage) return { value: [], status: 'memory' };
  try {
    const raw = storage.getItem(storageKey(context));
    if (raw === null) return { value: [], status: 'empty' };
    if (!bounded(raw)) return { value: [], status: 'memory' };
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || saved.ownerUid !== context.ownerUid || saved.runId !== context.runId
      || saved.caseId !== context.caseId || !Array.isArray(saved.items)) return { value: [], status: 'memory' };
    return { value: normalizeHypotheses(saved.items), status: 'saved' };
  } catch { return { value: [], status: 'memory' }; }
}

export function writeHypotheses(context, items, storage = sessionStore()) {
  const value = normalizeHypotheses(items);
  if (!validContext(context) || !storage) return { value, status: 'memory' };
  try {
    const key = storageKey(context);
    if (!value.length) {
      storage.removeItem(key);
      return { value, status: storage.getItem(key) === null ? 'empty' : 'memory' };
    }
    const raw = JSON.stringify({ version: 1, ownerUid: context.ownerUid, runId: context.runId, caseId: context.caseId, items: value });
    if (!bounded(raw)) return { value, status: 'memory' };
    storage.setItem(key, raw);
    return { value, status: storage.getItem(key) === raw ? 'saved' : 'memory' };
  } catch { return { value, status: 'memory' }; }
}
