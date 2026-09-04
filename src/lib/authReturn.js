import { authRedirectFeedback } from './authErrors.js';

const LEGACY_AUTH_QUERY_KEYS = Object.freeze([
  'auth',
  'error',
  'error_code',
  'error_description',
  'error_uri',
]);

let pendingAuthReturn = { action: '', feedback: '' };

function paramsObject(params) {
  return Object.fromEntries(params.entries());
}

function legacyErrorHash(hash) {
  const value = String(hash || '').replace(/^#/, '');
  if (!value || value.startsWith('/') || value.startsWith('!/')) return false;
  const params = new URLSearchParams(value);
  return LEGACY_AUTH_QUERY_KEYS.some(key => params.has(key));
}

function parseAuthReturnUrl(value) {
  const url = new URL(value, 'https://terminal-detective.invalid');
  const action = url.searchParams.get('auth') || '';
  let feedback = authRedirectFeedback(paramsObject(url.searchParams));
  let changed = false;
  for (const key of LEGACY_AUTH_QUERY_KEYS) {
    if (!url.searchParams.has(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  if (legacyErrorHash(url.hash)) {
    const hashParams = new URLSearchParams(String(url.hash).replace(/^#\??/, ''));
    feedback ||= authRedirectFeedback(paramsObject(hashParams));
    url.hash = '';
    changed = true;
  }
  return {
    action,
    changed,
    feedback,
    path: `${url.pathname}${url.search}${url.hash}`,
  };
}

export function sanitizedAuthReturnUrl(value) {
  const { changed, path } = parseAuthReturnUrl(value);
  return { changed, path };
}

export function sanitizeAuthReturnLocation(location = window.location, history = window.history) {
  const result = parseAuthReturnUrl(location.href);
  if (result.changed) history.replaceState(history.state, '', result.path);
  return result.changed;
}

export function captureAuthReturnLocation(location = window.location, history = window.history) {
  const result = parseAuthReturnUrl(location.href);
  pendingAuthReturn = { action: result.action, feedback: result.feedback };
  if (result.changed) history.replaceState(history.state, '', result.path);
  return pendingAuthReturn;
}

export function consumeCapturedAuthReturn() {
  const result = pendingAuthReturn;
  pendingAuthReturn = { action: '', feedback: '' };
  return result;
}

export const authReturnInternals = Object.freeze({ legacyErrorHash, parseAuthReturnUrl });
