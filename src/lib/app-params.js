const isNode = typeof window === 'undefined';
const runtimeEnv = /** @type {ImportMetaEnv} */ (import.meta.env || {});
const DEFAULT_APP_ID = 'terminal-detective';

function runtimeOrigin() {
  if (!isNode && window.location?.origin) return window.location.origin;
  return 'http://127.0.0.1:8787';
}

function normalizeServerUrl(value) {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : 'same-origin';
  if (candidate === 'same-origin') return runtimeOrigin();
  return candidate.replace(/\/+$/, '');
}

export const appParams = Object.freeze({
  appId: runtimeEnv.VITE_APP_ID || DEFAULT_APP_ID,
  serverUrl: normalizeServerUrl(runtimeEnv.VITE_API_SERVER_URL),
});
