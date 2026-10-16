import { clearLegacyDraft, localDraftStorage, readLocalDraftRaw } from './localDraftStorage.js';

export const REPORT_DRAFT_PREFIX = 'td-report-draft-v1:';
export const MAX_REPORT_DRAFT_BYTES = 16_384;
const DIMENSIONS = Object.freeze(['opportunity', 'method', 'motive', 'timeline']);
const CHOICE_FIELDS = Object.freeze(['conclusionId', 'methodId', 'motiveId', 'timelineId']);
const DRAFT_FIELDS = new Set([...CHOICE_FIELDS, 'evidenceIds', 'evidenceByDimension']);
const ENVELOPE_FIELDS = new Set(['version', 'owner_uid', 'run_id', 'case_id', 'investigation_version', 'draft']);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_:+-]{0,179}$/;

/** @typedef {{ownerUid?: string, runId?: string, caseId?: string, investigationVersion?: number}} ReportDraftContext */
/** @typedef {{conclusionId: string, methodId: string, motiveId: string, timelineId: string, evidenceIds: string[], evidenceByDimension: Partial<Record<'opportunity'|'method'|'motive'|'timeline', string[]>>}} ReportDraft */
/** @typedef {'saved'|'memory'|'empty'} ReportDraftStatus */
/** @typedef {{value: ReportDraft, status: ReportDraftStatus}} ReportDraftResult */

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function identifier(value) { return typeof value === 'string' && IDENTIFIER.test(value) ? value : ''; }
function evidenceIds(value, maximum) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 64).map(identifier).filter(Boolean))].slice(0, maximum);
}
function currentVersion(version) { return version === 1 ? 1 : 2; }
function validContext(context) {
  return typeof context?.ownerUid === 'string' && context.ownerUid.length > 0 && context.ownerUid.length <= 128
    && Boolean(identifier(context.runId)) && Boolean(identifier(context.caseId))
    && [1, 2].includes(context.investigationVersion);
}
function contextKey(context) {
  return `${REPORT_DRAFT_PREFIX}${encodeURIComponent(context.ownerUid)}:${encodeURIComponent(context.runId)}`;
}
function empty(value) {
  return CHOICE_FIELDS.every(key => !value[key]) && !value.evidenceIds.length;
}
function smallEnough(raw) {
  return typeof raw === 'string' && raw.length <= MAX_REPORT_DRAFT_BYTES
    && new TextEncoder().encode(raw).length <= MAX_REPORT_DRAFT_BYTES;
}

/** @returns {ReportDraft} */
export function defaultReportDraft() {
  return { conclusionId: '', methodId: '', motiveId: '', timelineId: '', evidenceIds: [], evidenceByDimension: {} };
}

export function normalizeReportDraft(value, { investigationVersion = 2 } = {}) {
  const source = plain(value) ? value : {};
  const next = defaultReportDraft();
  CHOICE_FIELDS.forEach(key => { next[key] = identifier(source[key]); });
  if (currentVersion(investigationVersion) === 1) next.evidenceIds = evidenceIds(source.evidenceIds, 4);
  else {
    if (plain(source.evidenceByDimension)) DIMENSIONS.forEach(key => {
      const selected = evidenceIds(source.evidenceByDimension[key], 9);
      if (selected.length) next.evidenceByDimension[key] = selected;
    });
    next.evidenceIds = [...new Set(Object.values(next.evidenceByDimension).flat())];
  }
  return next;
}

// Options may still be loading during recovery. Keep references until both
// the legal choices and the authoritative discovered-evidence list are ready.
export function sanitizeReportDraft(value, { reportOptions = undefined, knownClueIds = undefined, investigationVersion = 2 } = {}) {
  const next = normalizeReportDraft(value, { investigationVersion });
  const collections = ['conclusions', 'methods', 'motives', 'timelines'];
  if (!plain(reportOptions) || !Array.isArray(knownClueIds)
    || ![...collections, 'availableEvidence'].every(key => Array.isArray(reportOptions[key]))) return next;
  CHOICE_FIELDS.forEach((key, index) => {
    if (!reportOptions[collections[index]].some(option => identifier(option?.id) === next[key])) next[key] = '';
  });
  const known = new Set(knownClueIds.filter(id => identifier(id)));
  const available = new Set(reportOptions.availableEvidence.map(option => identifier(option?.id)).filter(id => known.has(id)));
  if (currentVersion(investigationVersion) === 1) next.evidenceIds = next.evidenceIds.filter(id => available.has(id));
  else {
    DIMENSIONS.forEach(key => {
      const selected = (next.evidenceByDimension[key] || []).filter(id => available.has(id));
      if (selected.length) next.evidenceByDimension[key] = selected;
      else delete next.evidenceByDimension[key];
    });
    next.evidenceIds = [...new Set(Object.values(next.evidenceByDimension).flat())];
  }
  return next;
}

/** @param {ReportDraftContext} context @returns {ReportDraftResult} */
export function readReportDraft(context, storage = localDraftStorage()) {
  const value = defaultReportDraft();
  if (!validContext(context) || !storage) return { value, status: 'memory' };
  try {
    const { raw, legacy } = readLocalDraftRaw(storage, contextKey(context));
    if (raw === null) return { value, status: 'empty' };
    if (!smallEnough(raw)) return { value, status: 'memory' };
    const saved = JSON.parse(raw);
    if (!plain(saved) || Object.keys(saved).some(key => !ENVELOPE_FIELDS.has(key))
      || saved.version !== 1 || saved.owner_uid !== context.ownerUid || saved.run_id !== context.runId
      || saved.case_id !== context.caseId || saved.investigation_version !== context.investigationVersion
      || !plain(saved.draft) || Object.keys(saved.draft).some(key => !DRAFT_FIELDS.has(key))) {
      return { value, status: 'memory' };
    }
    const restored = normalizeReportDraft(saved.draft, { investigationVersion: context.investigationVersion });
    if (legacy) return writeReportDraft(context, restored, storage);
    return { value: restored, status: empty(restored) ? 'empty' : 'saved' };
  } catch { return { value, status: 'memory' }; }
}

/** @param {ReportDraftContext} context @returns {ReportDraftResult} */
export function removeReportDraft(context, storage = localDraftStorage()) {
  const value = defaultReportDraft();
  if (!validContext(context) || !storage) return { value, status: 'memory' };
  try {
    const key = contextKey(context);
    clearLegacyDraft(storage, key);
    storage.removeItem(key);
    return { value, status: storage.getItem(key) === null ? 'empty' : 'memory' };
  } catch { return { value, status: 'memory' }; }
}

/** @param {ReportDraftContext} context @returns {ReportDraftResult} */
export function writeReportDraft(context, value, storage = localDraftStorage()) {
  const normalized = normalizeReportDraft(value, { investigationVersion: context?.investigationVersion });
  if (!validContext(context) || !storage) return { value: normalized, status: 'memory' };
  if (empty(normalized)) return removeReportDraft(context, storage);
  try {
    const serialized = JSON.stringify({ version: 1, owner_uid: context.ownerUid, run_id: context.runId,
      case_id: context.caseId, investigation_version: context.investigationVersion, draft: normalized });
    if (!smallEnough(serialized)) return { value: normalized, status: 'memory' };
    const key = contextKey(context);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) return { value: normalized, status: 'memory' };
    clearLegacyDraft(storage, key);
    return { value: normalized, status: 'saved' };
  } catch { return { value: normalized, status: 'memory' }; }
}
