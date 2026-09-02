import { sanitizeProfilePatch } from './playerProfile.js';

export const PROFILE_WAL_VERSION = 2;
export const PROFILE_WAL_PREFIX = 'td_profile_wal_v1:';
const LEGACY_PROFILE_WAL_VERSION = 1;
const LEGACY_LINEAGE_ID = 'legacy';
const MAX_PENDING_OPERATIONS = 500;
const OPERATION_KEY_SEGMENT = ':operation:';
let lastOperationTime = 0;

function walError(code, message = code) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  error.code = code;
  return error;
}

function storageTarget(storage) {
  const target = storage || (typeof localStorage === 'undefined' ? null : localStorage);
  if (!target) throw walError('PROFILE_WAL_UNAVAILABLE', 'Local profile storage is unavailable.');
  return target;
}

function ownerKey(ownerUid) {
  if (typeof ownerUid !== 'string' || !ownerUid || ownerUid.length > 128) {
    throw walError('PROFILE_WAL_OWNER_INVALID', 'A valid profile owner is required.');
  }
  return `${PROFILE_WAL_PREFIX}${encodeURIComponent(ownerUid)}`;
}

function operationKey(ownerUid, operationId) {
  return `${ownerKey(ownerUid)}${OPERATION_KEY_SEGMENT}${encodeURIComponent(operationId)}`;
}

function nextOperationTimestamp() {
  const now = Date.now();
  lastOperationTime = Math.max(now, lastOperationTime + 1);
  return new Date(lastOperationTime).toISOString();
}

function checksumValue(value) {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function entryCore(entry) {
  return {
    version: PROFILE_WAL_VERSION,
    ownerUid: entry.ownerUid,
    operationId: entry.operationId,
    lineageId: entry.lineageId,
    patch: entry.patch,
    baseRevision: entry.baseRevision,
    createdAt: entry.createdAt,
    attempts: entry.attempts,
    status: 'pending',
  };
}

function checkedEntry(value, ownerUid) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw walError('PROFILE_WAL_CORRUPT', 'Pending profile data is damaged.');
  }
  const patch = sanitizeProfilePatch(value.patch);
  const isLegacy = value.version === LEGACY_PROFILE_WAL_VERSION;
  const core = entryCore({
    ...value,
    lineageId: isLegacy ? LEGACY_LINEAGE_ID : value.lineageId,
    patch,
    baseRevision: Math.floor(Number(value.baseRevision)),
    attempts: Math.floor(Number(value.attempts)),
  });
  const checksumCore = isLegacy
    ? {
      version: LEGACY_PROFILE_WAL_VERSION,
      ownerUid: core.ownerUid,
      operationId: core.operationId,
      patch: core.patch,
      baseRevision: core.baseRevision,
      createdAt: core.createdAt,
      attempts: core.attempts,
      status: core.status,
    }
    : core;
  const valid = (isLegacy || value.version === PROFILE_WAL_VERSION)
    && value.ownerUid === ownerUid
    && typeof value.operationId === 'string'
    && value.operationId.length >= 16
    && value.operationId.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(value.operationId)
    && typeof core.lineageId === 'string'
    && core.lineageId.length > 0
    && core.lineageId.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(core.lineageId)
    && patch
    && Object.keys(patch).length > 0
    && Number.isInteger(core.baseRevision)
    && core.baseRevision >= 0
    && typeof value.createdAt === 'string'
    && Number.isFinite(Date.parse(value.createdAt))
    && Number.isInteger(core.attempts)
    && core.attempts >= 0
    && value.status === 'pending'
    && value.checksum === checksumValue(checksumCore);
  if (!valid) throw walError('PROFILE_WAL_CORRUPT', 'Pending profile data is damaged.');
  return { ...core, checksum: checksumValue(core) };
}

function storageKeys(target) {
  try {
    const length = Number(target.length);
    if (!Number.isInteger(length) || length < 0 || typeof target.key !== 'function') {
      throw new Error('Storage key enumeration is unavailable.');
    }
    const keys = [];
    for (let index = 0; index < length; index += 1) {
      const key = target.key(index);
      if (typeof key === 'string') keys.push(key);
    }
    return keys;
  } catch {
    throw walError('PROFILE_WAL_UNAVAILABLE', 'Local profile storage is unavailable.');
  }
}

function readStoredEntry(target, key, ownerUid) {
  let raw;
  try {
    raw = target.getItem(key);
  } catch {
    throw walError('PROFILE_WAL_UNAVAILABLE', 'Local profile storage is unavailable.');
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const entry = checkedEntry(parsed, ownerUid);
    if (parsed.version !== PROFILE_WAL_VERSION) writeStoredEntry(target, key, entry);
    return entry;
  } catch (error) {
    if (error?.code) throw error;
    throw walError('PROFILE_WAL_CORRUPT', 'Pending profile data is damaged.');
  }
}

function writeStoredEntry(target, key, entry) {
  const serialized = JSON.stringify(entry);
  try {
    target.setItem(key, serialized);
    if (target.getItem(key) !== serialized) throw new Error('Profile WAL verification failed.');
  } catch {
    throw walError('PROFILE_WAL_UNAVAILABLE', 'Local profile storage could not be updated.');
  }
}

function removeStoredEntry(target, key) {
  try {
    target.removeItem(key);
    if (target.getItem(key) !== null) throw new Error('Profile WAL verification failed.');
  } catch {
    throw walError('PROFILE_WAL_UNAVAILABLE', 'Local profile storage could not be updated.');
  }
}

function sameOperationContent(left, right) {
  return left.ownerUid === right.ownerUid
    && left.operationId === right.operationId
    && left.lineageId === right.lineageId
    && left.baseRevision === right.baseRevision
    && left.attempts === right.attempts
    && left.status === right.status
    && JSON.stringify(left.patch) === JSON.stringify(right.patch);
}

function readLegacyEntries(target, key, ownerUid) {
  let raw;
  try {
    raw = target.getItem(key);
  } catch {
    throw walError('PROFILE_WAL_UNAVAILABLE', 'Local profile storage is unavailable.');
  }
  if (!raw) return { exists: false, entries: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw walError('PROFILE_WAL_CORRUPT', 'Pending profile data is damaged.');
  }
  if (![LEGACY_PROFILE_WAL_VERSION, PROFILE_WAL_VERSION].includes(parsed?.version)
    || parsed?.ownerUid !== ownerUid
    || !Array.isArray(parsed.entries)) {
    throw walError('PROFILE_WAL_CORRUPT', 'Pending profile data is damaged.');
  }
  if (parsed.entries.length > MAX_PENDING_OPERATIONS
    || new Set(parsed.entries.map(entry => entry?.operationId)).size !== parsed.entries.length) {
    throw walError('PROFILE_WAL_CORRUPT', 'Pending profile data is damaged.');
  }
  return {
    exists: true,
    entries: parsed.entries.map(entry => checkedEntry(entry, ownerUid)),
  };
}

function readDocument(ownerUid, storage) {
  const target = storageTarget(storage);
  const key = ownerKey(ownerUid);
  const prefix = `${key}${OPERATION_KEY_SEGMENT}`;
  const legacy = readLegacyEntries(target, key, ownerUid);
  const entriesById = new Map(legacy.entries
    .map(entry => [entry.operationId, entry]));
  for (const entryKey of storageKeys(target).filter(item => item.startsWith(prefix))) {
    const entry = readStoredEntry(target, entryKey, ownerUid);
    if (!entry || entryKey !== operationKey(ownerUid, entry.operationId)) {
      throw walError('PROFILE_WAL_CORRUPT', 'Pending profile data is damaged.');
    }
    const existing = entriesById.get(entry.operationId);
    if (existing && existing.checksum !== entry.checksum) {
      if (!legacy.exists || !sameOperationContent(existing, entry)) {
        throw walError('PROFILE_WAL_OPERATION_REUSED', 'A pending operation id was reused.');
      }
      continue;
    }
    entriesById.set(entry.operationId, entry);
  }
  const legacyOrder = new Map(legacy.entries.map((entry, index) => [entry.operationId, index]));
  let entries = [...entriesById.values()].sort((left, right) => {
    const leftLegacyIndex = legacyOrder.get(left.operationId);
    const rightLegacyIndex = legacyOrder.get(right.operationId);
    if (leftLegacyIndex !== undefined && rightLegacyIndex !== undefined) {
      return leftLegacyIndex - rightLegacyIndex;
    }
    if (leftLegacyIndex !== undefined) return -1;
    if (rightLegacyIndex !== undefined) return 1;
    return Date.parse(left.createdAt) - Date.parse(right.createdAt)
      || left.operationId.localeCompare(right.operationId);
  });
  if (entries.length > MAX_PENDING_OPERATIONS) {
    throw walError('PROFILE_WAL_FULL', 'Too many profile changes are waiting to sync.');
  }
  if (legacy.exists) {
    let previousTime = 0;
    entries = entries.map(entry => {
      const createdTime = Math.max(Date.parse(entry.createdAt), previousTime + 1);
      previousTime = createdTime;
      const core = entryCore({ ...entry, createdAt: new Date(createdTime).toISOString() });
      return { ...core, checksum: checksumValue(core) };
    });
    for (const entry of entries) {
      const entryKey = operationKey(ownerUid, entry.operationId);
      writeStoredEntry(target, entryKey, entry);
    }
    removeStoredEntry(target, key);
  }
  return { target, entries };
}

export function createProfileOperationId(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  const value = typeof randomUUID === 'function'
    ? randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `profile-${String(value).replace(/[^A-Za-z0-9._:-]/g, '')}`;
}

export function readProfileOperations(ownerUid, storage) {
  return readDocument(ownerUid, storage).entries;
}

export function applyPendingProfileOperations(profile, entries) {
  return (Array.isArray(entries) ? entries : []).reduce(
    (current, entry) => ({ ...current, ...(entry?.patch || {}) }),
    profile || {},
  );
}

export function appendProfileOperation({
  ownerUid,
  operationId = createProfileOperationId(),
  lineageId = LEGACY_LINEAGE_ID,
  patch,
  baseRevision,
  createdAt = undefined,
}, storage) {
  const state = readDocument(ownerUid, storage);
  if (state.entries.some(entry => entry.lineageId !== lineageId)) {
    throw walError('PROFILE_WAL_DIVERGED', 'Pending profile changes came from concurrent sessions.');
  }
  const cleanPatch = sanitizeProfilePatch(patch);
  if (!cleanPatch || !Object.keys(cleanPatch).length) {
    throw walError('PROFILE_WAL_PATCH_INVALID', 'The pending profile patch is invalid.');
  }
  const latestStoredTime = state.entries.reduce(
    (latest, entry) => Math.max(latest, Date.parse(entry.createdAt)),
    0,
  );
  const requestedTime = Date.parse(createdAt || nextOperationTimestamp());
  const orderedCreatedAt = createdAt
    ? createdAt
    : new Date(Math.max(requestedTime, latestStoredTime + 1)).toISOString();
  const core = entryCore({
    ownerUid,
    operationId,
    lineageId,
    patch: cleanPatch,
    baseRevision: Math.max(0, Math.floor(Number(baseRevision) || 0)),
    createdAt: orderedCreatedAt,
    attempts: 0,
  });
  const entry = checkedEntry({ ...core, checksum: checksumValue(core) }, ownerUid);
  const existing = state.entries.find(item => item.operationId === operationId);
  if (existing) {
    if (existing.checksum !== entry.checksum) {
      throw walError('PROFILE_WAL_OPERATION_REUSED', 'A pending operation id was reused.');
    }
    return existing;
  }
  if (state.entries.length >= MAX_PENDING_OPERATIONS) {
    throw walError('PROFILE_WAL_FULL', 'Too many profile changes are waiting to sync.');
  }
  writeStoredEntry(state.target, operationKey(ownerUid, operationId), entry);
  return entry;
}

export function updateProfileOperation(ownerUid, operationId, changes = {}, storage) {
  const state = readDocument(ownerUid, storage);
  const existing = state.entries.find(entry => entry.operationId === operationId);
  if (!existing) throw walError('PROFILE_WAL_OPERATION_MISSING', 'Pending profile operation was not found.');
  const core = entryCore({
    ...existing,
    baseRevision: changes.baseRevision === undefined
      ? existing.baseRevision
      : Math.max(0, Math.floor(Number(changes.baseRevision) || 0)),
    attempts: changes.incrementAttempts ? existing.attempts + 1 : existing.attempts,
  });
  const updated = { ...core, checksum: checksumValue(core) };
  writeStoredEntry(state.target, operationKey(ownerUid, operationId), updated);
  return updated;
}

export function removeProfileOperation(ownerUid, operationId, storage) {
  const state = readDocument(ownerUid, storage);
  removeStoredEntry(state.target, operationKey(ownerUid, operationId));
  return state.entries.filter(entry => entry.operationId !== operationId);
}

export function clearProfileOperations(ownerUid, storage) {
  const target = storageTarget(storage);
  const key = ownerKey(ownerUid);
  const prefix = `${key}${OPERATION_KEY_SEGMENT}`;
  for (const storedKey of storageKeys(target)) {
    if (storedKey === key || storedKey.startsWith(prefix)) removeStoredEntry(target, storedKey);
  }
}

export const profileWalInternals = Object.freeze({
  checksumValue,
  ownerKey,
  operationKey,
  MAX_PENDING_OPERATIONS,
});
