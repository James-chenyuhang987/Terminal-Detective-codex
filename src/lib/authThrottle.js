const STORAGE_KEY = 'td_firebase_auth_throttle_v1';
const ACTION_STORAGE_PREFIX = `${STORAGE_KEY}:`;
const SUCCESS_COOLDOWN_MS = 60_000;
const RATE_LIMIT_BACKOFF_MS = Object.freeze([120_000, 240_000, 480_000, 900_000]);

export const AUTH_THROTTLE_ACTIONS = Object.freeze({
  EMAIL_LOGIN: 'email_login',
  REGISTER: 'register',
  VERIFY_EMAIL: 'verify_email',
  RESET_PASSWORD: 'reset_password',
  GITHUB_LOGIN: 'github_login',
});

function storageOrDefault(storage) {
  return storage || (typeof localStorage === 'undefined' ? null : localStorage);
}

function emptyState() {
  return { version: 1, actions: {} };
}

function readState(storage) {
  const target = storageOrDefault(storage);
  if (!target) return emptyState();
  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) || 'null');
    if (parsed?.version !== 1 || !parsed.actions || typeof parsed.actions !== 'object' || Array.isArray(parsed.actions)) {
      return emptyState();
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

function actionStorageKey(action) {
  return `${ACTION_STORAGE_PREFIX}${encodeURIComponent(action)}`;
}

function normalizedActionState(value) {
  return value
    && Number.isFinite(value.until)
    && value.until >= 0
    && Number.isInteger(value.strikes)
    && value.strikes >= 0
    ? { until: value.until, strikes: value.strikes }
    : { until: 0, strikes: 0 };
}

function actionState(action, storage) {
  const target = storageOrDefault(storage);
  try {
    const raw = target?.getItem(actionStorageKey(action));
    if (raw !== null && raw !== undefined) return normalizedActionState(JSON.parse(raw));
  } catch {
    return { until: 0, strikes: 0 };
  }
  return normalizedActionState(readState(storage).actions[action]);
}

function writeActionState(action, value, storage) {
  const target = storageOrDefault(storage);
  if (!target) return false;
  try {
    target.setItem(actionStorageKey(action), JSON.stringify(normalizedActionState(value)));
    return true;
  } catch {
    return false;
  }
}

export function authThrottleRemaining(action, storage, now = Date.now()) {
  return Math.max(0, Math.ceil((actionState(action, storage).until - now) / 1000));
}

export function recordAuthSuccess(action, storage, now = Date.now(), cooldownMs = SUCCESS_COOLDOWN_MS) {
  writeActionState(action, { until: now + cooldownMs, strikes: 0 }, storage);
  return Math.ceil(cooldownMs / 1000);
}

export function recordAuthRateLimit(action, storage, now = Date.now()) {
  const previous = actionState(action, storage);
  const strikes = Math.min(previous.strikes + 1, RATE_LIMIT_BACKOFF_MS.length);
  const duration = RATE_LIMIT_BACKOFF_MS[strikes - 1];
  writeActionState(action, { until: now + duration, strikes }, storage);
  return Math.ceil(duration / 1000);
}

export function clearAuthThrottle(action, storage) {
  writeActionState(action, { until: 0, strikes: 0 }, storage);
}

export const authThrottleInternals = Object.freeze({
  STORAGE_KEY,
  actionStorageKey,
  SUCCESS_COOLDOWN_MS,
  RATE_LIMIT_BACKOFF_MS,
  readState,
});
