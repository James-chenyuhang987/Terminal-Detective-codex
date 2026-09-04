let tokenProvider = null;

/**
 * Registers the single Firebase token source used by every Cloudflare API client.
 * Keeping this outside the individual game modules prevents auth refresh logic from
 * being duplicated across profile, rules and account requests.
 */
export function setAuthTokenProvider(provider) {
  tokenProvider = typeof provider === 'function' ? provider : null;
}

function abortError() {
  if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError');
  return Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || abortError();
}

async function waitForToken(value, signal) {
  if (!signal) return value;
  throwIfAborted(signal);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason || abortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([value, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export async function getAuthToken(forceRefresh = false, signal) {
  if (!tokenProvider) return '';
  const value = await waitForToken(
    Promise.resolve().then(() => tokenProvider(Boolean(forceRefresh), signal)),
    signal,
  );
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
  const firstToken = await getAuthToken(false, init.signal);
  const firstResponse = await fetch(input, {
    ...init,
    headers: mergeHeaders(init.headers, firstToken),
  });
  if (firstResponse.status !== 401 || !firstToken) return firstResponse;

  const refreshedToken = await getAuthToken(true, init.signal);
  if (!refreshedToken) return firstResponse;
  return fetch(input, {
    ...init,
    headers: mergeHeaders(init.headers, refreshedToken),
  });
}
