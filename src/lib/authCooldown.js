const DEFAULT_SECONDS = 60;
const MAX_SECONDS = 15 * 60;

function targetStorage(storage) {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

function readState(key, storage) {
  const target = targetStorage(storage);
  try {
    const raw = target?.getItem(key);
    if (!raw) return { until: 0, strikes: 0 };
    const legacyUntil = Number(raw);
    if (Number.isFinite(legacyUntil)) return { until: legacyUntil, strikes: 0 };
    const parsed = JSON.parse(raw);
    return {
      until: Math.max(0, Number(parsed?.until) || 0),
      strikes: Math.max(0, Math.min(8, Math.floor(Number(parsed?.strikes) || 0))),
    };
  } catch {
    return { until: 0, strikes: 0 };
  }
}

export function cooldownRemaining(key, storage, now = Date.now()) {
  return Math.max(0, Math.ceil((readState(key, storage).until - now) / 1000));
}

/**
 * Successful email sends use a predictable 60 second pause. A real provider
 * rate-limit response increases the local pause exponentially, which avoids
 * repeatedly hitting Firebase while still allowing recovery without support.
 */
/** @param {string} key @param {{ rateLimited?: boolean, storage?: any, now?: number }} options */
export function startAuthCooldown(key, options = {}) {
  const { rateLimited = false, storage, now = Date.now() } = options;
  const target = targetStorage(storage);
  const current = readState(key, target);
  const strikes = rateLimited ? Math.min(8, current.strikes + 1) : 0;
  const seconds = rateLimited
    ? Math.min(MAX_SECONDS, DEFAULT_SECONDS * (2 ** strikes))
    : DEFAULT_SECONDS;
  const next = { until: now + seconds * 1000, strikes };
  try { target?.setItem(key, JSON.stringify(next)); } catch { /* private storage may be unavailable */ }
  return seconds;
}

export function clearAuthCooldown(key, storage) {
  try { targetStorage(storage)?.removeItem(key); } catch { /* no-op */ }
}

export const authCooldownInternals = Object.freeze({ readState, DEFAULT_SECONDS, MAX_SECONDS });
