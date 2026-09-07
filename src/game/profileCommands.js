import { createProfileOperationId } from './profileWal.js';

export const PROFILE_COMMAND_PREFIX = 'td_profile_commands_v1:';
const COMMAND_FIELDS = Object.freeze({
  identity: ['patch'], checkin: [], purchase_item: ['item_id', 'quantity'],
  consume_energy_cell: [], buy_use_energy_cell: [], equip_item: ['item_id'],
  unlock_tech: ['tech_id'], claim_achievement: ['achievement_id'],
  claim_task: ['kind', 'task_id'], claim_weekly: [], claim_level: ['level'],
  visit_lobby: [], save_team: ['team_config'], skill_loadout: ['skill_loadout'],
  purchase_agent: ['agent_id'], activate_support: ['agent_id'],
  mail_read: ['mail_id'], mail_reply: ['mail_id', 'choice_id'],
  start_case: ['case_id', 'team_config'], settle_case: ['run_id'],
});
const IDENTITY_FIELDS = new Set(['detective_name', 'avatar', 'signature', 'identity_badge', 'detective_tags']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

/** @returns {never} */
function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function validJson(value, depth = 0) {
  if (depth > 7) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 1024;
  if (Array.isArray(value)) return value.length <= 256 && value.every(item => validJson(item, depth + 1));
  return plain(value) && Object.keys(value).length <= 80
    && Object.entries(value).every(([key, item]) => !FORBIDDEN.has(key) && validJson(item, depth + 1));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]));
}

export function profileCommand(type, args = {}) {
  const fields = typeof type === 'string' && Object.hasOwn(COMMAND_FIELDS, type) ? COMMAND_FIELDS[type] : null;
  if (!fields || !plain(args) || Object.keys(args).some(key => !fields.includes(key)) || !validJson(args)) {
    fail('PROFILE_COMMAND_INVALID');
  }
  if (type === 'identity' && (!plain(args.patch) || Object.keys(args.patch).some(key => !IDENTITY_FIELDS.has(key)))) {
    fail('PROFILE_COMMAND_INVALID');
  }
  return canonicalJson({ type, ...args });
}

function checkedCommand(value) {
  if (!plain(value)) fail('PROFILE_COMMAND_INVALID');
  const { type, ...args } = value;
  return profileCommand(type, args);
}

function targetStorage(storage) {
  const target = storage || globalThis.localStorage;
  if (!target) fail('PROFILE_WAL_UNAVAILABLE');
  return target;
}

function ownerPrefix(ownerUid) {
  if (typeof ownerUid !== 'string' || !ownerUid || ownerUid.length > 128) fail('PROFILE_WAL_OWNER_INVALID');
  return `${PROFILE_COMMAND_PREFIX}${encodeURIComponent(ownerUid)}:operation:`;
}

function checksum(value) {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function storedKeys(storage) {
  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index));
  } catch { return fail('PROFILE_WAL_UNAVAILABLE'); }
}

export function readProfileCommands(ownerUid, storage) {
  const target = targetStorage(storage);
  const prefix = ownerPrefix(ownerUid);
  const entries = storedKeys(target).filter(key => key?.startsWith(prefix)).map(key => {
    let raw;
    try { raw = target.getItem(key); } catch { fail('PROFILE_WAL_UNAVAILABLE'); }
    try {
      const { checksum: savedChecksum, ...entry } = JSON.parse(raw);
      if (entry.version !== 1 || entry.ownerUid !== ownerUid
        || !/^[A-Za-z0-9._:-]{16,128}$/.test(entry.operationId)
        || typeof entry.lineageId !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(entry.lineageId)
        || !Number.isSafeInteger(entry.baseRevision) || entry.baseRevision < 0
        || key !== `${prefix}${entry.operationId}` || savedChecksum !== checksum(entry)) fail('PROFILE_WAL_CORRUPT');
      checkedCommand(entry.command);
      return entry;
    } catch { return fail('PROFILE_WAL_CORRUPT'); }
  });
  if (entries.length > 1) fail('PROFILE_WAL_DIVERGED');
  return entries;
}

export function appendProfileCommand({ ownerUid, lineageId, command, baseRevision, operationId = createProfileOperationId() }, storage) {
  const target = targetStorage(storage);
  const existing = readProfileCommands(ownerUid, target);
  if (existing.length) fail('PROFILE_COMMAND_PENDING');
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0
    || typeof lineageId !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(lineageId)
    || !/^[A-Za-z0-9._:-]{16,128}$/.test(operationId)) fail('PROFILE_COMMAND_INVALID');
  const entry = { version: 1, ownerUid, lineageId, operationId, baseRevision, command: checkedCommand(command) };
  const key = `${ownerPrefix(ownerUid)}${operationId}`;
  const serialized = JSON.stringify({ ...entry, checksum: checksum(entry) });
  try {
    target.setItem(key, serialized);
    if (target.getItem(key) !== serialized) fail('PROFILE_WAL_UNAVAILABLE');
  } catch { fail('PROFILE_WAL_UNAVAILABLE'); }
  readProfileCommands(ownerUid, target);
  return entry;
}

export function removeProfileCommand(ownerUid, operationId, storage) {
  const target = targetStorage(storage);
  const key = `${ownerPrefix(ownerUid)}${operationId}`;
  try {
    target.removeItem(key);
    if (target.getItem(key) !== null) fail('PROFILE_WAL_UNAVAILABLE');
  } catch { fail('PROFILE_WAL_UNAVAILABLE'); }
}

export function clearProfileCommands(ownerUid, storage) {
  const target = targetStorage(storage);
  const prefix = ownerPrefix(ownerUid);
  for (const key of storedKeys(target).filter(key => key?.startsWith(prefix))) {
    removeProfileCommand(ownerUid, key.slice(prefix.length), target);
  }
}

export function hasLegacyProfileWrites(ownerUid, storage) {
  const target = targetStorage(storage);
  const legacyOwner = `td_profile_wal_v1:${encodeURIComponent(ownerUid)}`;
  return storedKeys(target).some(key => key === legacyOwner || key?.startsWith(`${legacyOwner}:operation:`));
}
