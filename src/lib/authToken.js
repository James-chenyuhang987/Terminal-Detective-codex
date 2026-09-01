let tokenProvider = null;

/**
 * Registers the single Firebase token source used by every Cloudflare API client.
 * Keeping this outside the individual game modules prevents auth refresh logic from
 * being duplicated across profile, rules and account requests.
 */
export function setAuthTokenProvider(provider) {
  tokenProvider = typeof provider === 'function' ? provider : null;
}

export async function getAuthToken(forceRefresh = false) {
  if (!tokenProvider) return '';
  const value = await tokenProvider(Boolean(forceRefresh));
  return typeof value === 'string' ? value : '';
}

function mergeHeaders(initial, token) {
  const headers = new Headers(initial || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

/**
 * Authenticated fetch with one, and only one, forced-token refresh after a 401.
 * Callers keep ownership of all other retries so a broken login can never create
 * an infinite request loop.
 */
export async function fetchWithAuth(input, init = {}) {
  const firstToken = await getAuthToken(false);
  const firstResponse = await fetch(input, {
    ...init,
    headers: mergeHeaders(init.headers, firstToken),
  });
  if (firstResponse.status !== 401 || !firstToken) return firstResponse;

  const refreshedToken = await getAuthToken(true);
  if (!refreshedToken) return firstResponse;
  return fetch(input, {
    ...init,
    headers: mergeHeaders(init.headers, refreshedToken),
  });
}
