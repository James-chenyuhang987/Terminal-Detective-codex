import { localDraftStorage } from './localDraftStorage.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_:+-]{0,179}$/;
const MAX_BYTES = 32_768;
const SPATIAL_PREFIX = 'td-spatial-workspace-v1:';
const PUZZLE_PREFIX = 'td-reconstruction-draft-v1:';
const LINK_PREFIX = 'td-link-draft-v1:';
const ownRecord = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const identifier = value => typeof value === 'string' && ID.test(value);
const bounded = raw => typeof raw === 'string' && raw.length <= MAX_BYTES && new TextEncoder().encode(raw).length <= MAX_BYTES;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const angle = value => value % (Math.PI * 2);
const ownerScope = context => typeof context?.ownerUid === 'string' && context.ownerUid.length > 0 && context.ownerUid.length <= 128
  && identifier(context.runId);
const keyFor = (prefix, context) => `${prefix}${encodeURIComponent(context.ownerUid)}:${encodeURIComponent(context.runId)}`;

export function emptySpatialWorkspace() { return { arrived: false, rooms: {} }; }

export function normalizeSpatialWorkspace(value, caseId) {
  const next = emptySpatialWorkspace();
  if (!ownRecord(value)) return next;
  next.arrived = value.arrived === true;
  if (!ownRecord(value.rooms)) return next;
  for (const [key, saved] of Object.entries(value.rooms).slice(0, 16)) {
    let parts;
    try { parts = JSON.parse(key); } catch { continue; }
    if (!Array.isArray(parts) || parts.length !== 2 || parts[0] !== caseId || !identifier(parts[1]) || !ownRecord(saved)
      || !Array.isArray(saved.position) || saved.position.length !== 3
      || !saved.position.every(item => finite(item) && Math.abs(item) <= 10_000)
      || ![saved.rotationY, saved.yaw, saved.pitch].every(finite)) continue;
    // Coordinates still pass the actual room's collision/spawn check through
    // restoreSpatial when the scene mounts. Never restore locomotion state.
    next.rooms[key] = { position: [saved.position[0], 0, saved.position[2]],
      rotationY: angle(saved.rotationY), yaw: angle(saved.yaw), pitch: Math.max(.35, Math.min(1.05, saved.pitch)) };
  }
  return next;
}

export function readSpatialWorkspace(context, storage = localDraftStorage()) {
  const value = emptySpatialWorkspace();
  if (!ownerScope(context) || !identifier(context.caseId) || !storage) return { value, status: 'memory' };
  try {
    const raw = storage.getItem(keyFor(SPATIAL_PREFIX, context));
    if (raw === null) return { value, status: 'empty' };
    if (!bounded(raw)) return { value, status: 'memory' };
    const saved = JSON.parse(raw);
    if (!ownRecord(saved) || saved.version !== 1 || saved.owner_uid !== context.ownerUid
      || saved.run_id !== context.runId || saved.case_id !== context.caseId) return { value, status: 'memory' };
    return { value: normalizeSpatialWorkspace(saved.spatial, context.caseId), status: 'saved' };
  } catch { return { value, status: 'memory' }; }
}

export function writeSpatialWorkspace(context, value, storage = localDraftStorage()) {
  const normalized = normalizeSpatialWorkspace(value, context?.caseId);
  if (!ownerScope(context) || !identifier(context.caseId) || !storage) return { value: normalized, status: 'memory' };
  try {
    const raw = JSON.stringify({ version: 1, owner_uid: context.ownerUid, run_id: context.runId,
      case_id: context.caseId, spatial: normalized });
    if (!bounded(raw)) return { value: normalized, status: 'memory' };
    const key = keyFor(SPATIAL_PREFIX, context);
    if (storage.getItem(key) !== raw) storage.setItem(key, raw);
    return { value: normalized, status: storage.getItem(key) === raw ? 'saved' : 'memory' };
  } catch { return { value: normalized, status: 'memory' }; }
}

export function emptyReconstructionDraft() { return { answerIds: [], view: {} }; }

export function normalizeReconstructionDraft(value) {
  const next = emptyReconstructionDraft();
  if (!ownRecord(value)) return next;
  if (Array.isArray(value.answerIds)) next.answerIds = [...new Set(value.answerIds.slice(0, 64).filter(identifier))].slice(0, 32);
  if (!ownRecord(value.view)) return next;
  const view = value.view;
  if (identifier(view.activeId)) next.view.activeId = view.activeId;
  if (typeof view.showReference === 'boolean') next.view.showReference = view.showReference;
  if (finite(view.frame)) next.view.frame = Math.max(0, Math.min(3_600, view.frame));
  for (const field of ['offsets', 'alignments']) {
    if (!ownRecord(view[field])) continue;
    const pairs = Object.entries(view[field]).slice(0, 32).filter(([id, amount]) => identifier(id) && finite(amount))
      .map(([id, amount]) => [id, Math.max(-3_600, Math.min(3_600, amount))]);
    if (pairs.length) next.view[field] = Object.fromEntries(pairs);
  }
  return next;
}

export function readReconstructionDraft(context, storage = localDraftStorage()) {
  const value = emptyReconstructionDraft();
  if (!ownerScope(context) || !identifier(context.puzzleId) || !storage) return { value, status: 'memory' };
  try {
    const raw = storage.getItem(`${keyFor(PUZZLE_PREFIX, context)}:${encodeURIComponent(context.puzzleId)}`);
    if (raw === null) return { value, status: 'empty' };
    if (!bounded(raw)) return { value, status: 'memory' };
    const saved = JSON.parse(raw);
    if (!ownRecord(saved) || saved.version !== 1 || saved.owner_uid !== context.ownerUid
      || saved.run_id !== context.runId || saved.puzzle_id !== context.puzzleId) return { value, status: 'memory' };
    return { value: normalizeReconstructionDraft(saved.draft), status: 'saved' };
  } catch { return { value, status: 'memory' }; }
}

export function writeReconstructionDraft(context, value, storage = localDraftStorage()) {
  const normalized = normalizeReconstructionDraft(value);
  if (!ownerScope(context) || !identifier(context.puzzleId) || !storage) return { value: normalized, status: 'memory' };
  try {
    const key = `${keyFor(PUZZLE_PREFIX, context)}:${encodeURIComponent(context.puzzleId)}`;
    if (!normalized.answerIds.length && !Object.keys(normalized.view).length) {
      storage.removeItem(key);
      return { value: normalized, status: storage.getItem(key) === null ? 'empty' : 'memory' };
    }
    const raw = JSON.stringify({ version: 1, owner_uid: context.ownerUid, run_id: context.runId,
      puzzle_id: context.puzzleId, draft: normalized });
    if (!bounded(raw)) return { value: normalized, status: 'memory' };
    storage.setItem(key, raw);
    return { value: normalized, status: storage.getItem(key) === raw ? 'saved' : 'memory' };
  } catch { return { value: normalized, status: 'memory' }; }
}

export function normalizeLinkDraft(value) {
  return { relation: ['supports', 'contradicts', 'precedes'].includes(value?.relation) ? value.relation : 'supports',
    firstClue: identifier(value?.firstClue) ? value.firstClue : '', secondClue: identifier(value?.secondClue) ? value.secondClue : '' };
}

export function readLinkDraft(context, storage = localDraftStorage()) {
  const value = normalizeLinkDraft(null);
  if (!ownerScope(context) || !identifier(context.caseId) || !storage) return { value, status: 'memory' };
  try {
    const raw = storage.getItem(keyFor(LINK_PREFIX, context));
    if (raw === null) return { value, status: 'empty' };
    if (!bounded(raw)) return { value, status: 'memory' };
    const saved = JSON.parse(raw);
    if (!ownRecord(saved) || saved.version !== 1 || saved.owner_uid !== context.ownerUid
      || saved.run_id !== context.runId || saved.case_id !== context.caseId) return { value, status: 'memory' };
    return { value: normalizeLinkDraft(saved.draft), status: 'saved' };
  } catch { return { value, status: 'memory' }; }
}

export function writeLinkDraft(context, value, storage = localDraftStorage()) {
  const normalized = normalizeLinkDraft(value);
  if (!ownerScope(context) || !identifier(context.caseId) || !storage) return { value: normalized, status: 'memory' };
  try {
    const key = keyFor(LINK_PREFIX, context);
    const raw = JSON.stringify({ version: 1, owner_uid: context.ownerUid, run_id: context.runId,
      case_id: context.caseId, draft: normalized });
    if (storage.getItem(key) !== raw) storage.setItem(key, raw);
    return { value: normalized, status: storage.getItem(key) === raw ? 'saved' : 'memory' };
  } catch { return { value: normalized, status: 'memory' }; }
}
