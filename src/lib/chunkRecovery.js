const RECOVERY_STORAGE_KEY = 'td_chunk_recovery_v1';
const RECOVERY_QUERY_KEY = '__td_reload';
const RECOVERY_WINDOW_MS = 90_000;
const pendingRuntimes = new WeakSet();
const recoveryAttempts = new WeakMap();

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading (?:css )?chunk .+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
];

function errorMessage(error) {
  if (typeof error === 'string') return error;
  return String(error?.message || error?.reason?.message || '');
}

function recoverySignature(error) {
  const message = errorMessage(error);
  const asset = message.match(/https?:\/\/[^\s)]+|\/[^\s)]+\.(?:js|css)/i)?.[0];
  return asset || message.slice(0, 240) || 'unknown-chunk';
}

function readRecoveryState(runtime) {
  try {
    const parsed = JSON.parse(runtime.sessionStorage?.getItem(RECOVERY_STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeRecoveryState(runtime, state) {
  try {
    runtime.sessionStorage?.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Recovery must still work when storage is blocked or full.
  }
}

function readRecoveryMarker(runtime) {
  try {
    const marker = new URL(runtime.location.href).searchParams.get(RECOVERY_QUERY_KEY);
    if (!marker || !/^[a-z0-9]+$/i.test(marker)) return null;
    const attemptedAt = Number.parseInt(marker, 36);
    return Number.isSafeInteger(attemptedAt) && attemptedAt > 0 ? attemptedAt : null;
  } catch {
    return null;
  }
}

export function isChunkLoadError(error) {
  const message = errorMessage(error);
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

export function buildLatestVersionUrl(href, now = Date.now()) {
  const url = new URL(href);
  url.searchParams.set(RECOVERY_QUERY_KEY, Math.floor(now).toString(36));
  return url.toString();
}

export function reloadLatestVersion(runtime = window, now = Date.now()) {
  const target = buildLatestVersionUrl(runtime.location.href, now);
  runtime.location.replace(target);
  return target;
}

export function attemptChunkRecovery(error, runtime = window, now = Date.now()) {
  if (!isChunkLoadError(error)) return false;
  if (pendingRuntimes.has(runtime)) return true;

  const attempts = [recoveryAttempts.get(runtime), readRecoveryMarker(runtime), readRecoveryState(runtime)?.attemptedAt];
  // Bound the whole recovery cycle, not just one chunk: offline deployments can
  // fail on different lazy modules after the initial document has loaded.
  if (attempts.some(attemptedAt => Number.isSafeInteger(attemptedAt) && attemptedAt > 0
    && now >= attemptedAt && now - attemptedAt < RECOVERY_WINDOW_MS)) return false;

  pendingRuntimes.add(runtime);
  recoveryAttempts.set(runtime, now);
  writeRecoveryState(runtime, { signature: recoverySignature(error), attemptedAt: now });
  try {
    reloadLatestVersion(runtime, now);
    return true;
  } catch {
    pendingRuntimes.delete(runtime);
    return false;
  }
}

export function installChunkRecovery(runtime = window) {
  // Keep the URL fallback after address-bar cleanup when browser storage is blocked.
  const attemptedAt = readRecoveryMarker(runtime);
  if (attemptedAt !== null) recoveryAttempts.set(runtime, attemptedAt);
  const onPreloadError = (event) => {
    const error = event?.payload || event?.reason || event;
    if (attemptChunkRecovery(error, runtime)) event?.preventDefault?.();
  };

  runtime.addEventListener('vite:preloadError', onPreloadError);

  // Remove the cache-busting marker from the address bar after the fresh
  // document has loaded. The fetched document remains the cache-busted one.
  try {
    const cleanUrl = new URL(runtime.location.href);
    if (cleanUrl.searchParams.has(RECOVERY_QUERY_KEY)) {
      cleanUrl.searchParams.delete(RECOVERY_QUERY_KEY);
      runtime.history.replaceState(runtime.history.state, '', cleanUrl.toString());
    }
  } catch {
    // An unusual URL must not prevent the app from booting.
  }

  return () => {
    runtime.removeEventListener('vite:preloadError', onPreloadError);
  };
}
