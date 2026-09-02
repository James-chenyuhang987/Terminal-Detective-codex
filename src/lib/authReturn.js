const LEGACY_AUTH_QUERY_KEYS = Object.freeze([
  'error',
  'error_code',
  'error_description',
  'error_uri',
]);

function legacyErrorHash(hash) {
  const value = String(hash || '').replace(/^#/, '');
  if (!value || value.startsWith('/') || value.startsWith('!/')) return false;
  const params = new URLSearchParams(value);
  return LEGACY_AUTH_QUERY_KEYS.some(key => params.has(key));
}

export function sanitizedAuthReturnUrl(value) {
  const url = new URL(value, 'https://terminal-detective.invalid');
  let changed = false;
  for (const key of LEGACY_AUTH_QUERY_KEYS) {
    if (!url.searchParams.has(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  if (legacyErrorHash(url.hash)) {
    url.hash = '';
    changed = true;
  }
  return {
    changed,
    path: `${url.pathname}${url.search}${url.hash}`,
  };
}

export function sanitizeAuthReturnLocation(location = window.location, history = window.history) {
  const result = sanitizedAuthReturnUrl(location.href);
  if (result.changed) history.replaceState(history.state, '', result.path);
  return result.changed;
}

export const authReturnInternals = Object.freeze({ legacyErrorHash });
