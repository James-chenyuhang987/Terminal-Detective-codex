const ALLOWED_RULE_TASKS = new Set([
  'decision_options',
  'interrogation_options',
  'interrogation_resolve',
  'link_check',
  'link_cinematic',
  'report_options',
  'report_judge',
]);

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'userId',
  'user_id',
  'ownerId',
  'owner_id',
  'accountId',
  'account_id',
  'firebaseUid',
  'firebase_uid',
  'email',
  'sub',
  'role',
  'isAdmin',
  'is_admin',
]);

const LIMITS = Object.freeze({
  depth: 7,
  arrayLength: 256,
  objectKeys: 80,
  stringLength: 1024,
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateValue(value, depth = 0) {
  if (depth > LIMITS.depth) return 'PAYLOAD_TOO_DEEP';
  if (value === null || typeof value === 'boolean') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? '' : 'INVALID_NUMBER';
  if (typeof value === 'string') {
    return value.length <= LIMITS.stringLength ? '' : 'STRING_TOO_LONG';
  }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.arrayLength) return 'ARRAY_TOO_LARGE';
    for (const item of value) {
      const invalid = validateValue(item, depth + 1);
      if (invalid) return invalid;
    }
    return '';
  }
  if (!isPlainObject(value)) return 'INVALID_OBJECT';
  const keys = Object.keys(value);
  if (keys.length > LIMITS.objectKeys) return 'OBJECT_TOO_LARGE';
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) return 'FORBIDDEN_IDENTITY_FIELD';
    if (key.length > 80) return 'INVALID_OBJECT_KEY';
    const invalid = validateValue(value[key], depth + 1);
    if (invalid) return invalid;
  }
  return '';
}

export function validateRuleEnvelope(body) {
  if (!isPlainObject(body)) return { error: 'INVALID_RULE_REQUEST' };
  const keys = Object.keys(body);
  if (keys.some(key => key !== 'task' && key !== 'payload')) {
    return { error: 'INVALID_RULE_REQUEST' };
  }
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!ALLOWED_RULE_TASKS.has(task)) return { error: 'UNKNOWN_RULE_TASK' };
  const payload = body.payload === undefined ? {} : body.payload;
  if (!isPlainObject(payload)) return { error: 'INVALID_RULE_PAYLOAD' };
  const invalid = validateValue(payload);
  if (invalid) return { error: invalid };
  return { task, payload };
}

export const requestSecurityInternals = Object.freeze({
  ALLOWED_RULE_TASKS,
  FORBIDDEN_KEYS,
  LIMITS,
  isPlainObject,
  validateValue,
});
