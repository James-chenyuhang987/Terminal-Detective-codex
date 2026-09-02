export const RECENT_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

export function isRecentAuthTime(authTime, now = Date.now(), maxAge = RECENT_AUTH_MAX_AGE_MS) {
  const timestamp = Date.parse(String(authTime || ''));
  return Number.isFinite(timestamp)
    && timestamp <= now + 60_000
    && now - timestamp <= maxAge;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_TRANSIENT_RETRIES = 2;
const TRANSIENT_STATUSES = new Set([0, 408, 429, 502, 503, 504]);

function statusOf(error) {
  return Number(error?.httpStatus || error?.status) || 0;
}

function abortError() {
  return Object.assign(new Error('AUTH_SESSION_TIMEOUT'), {
    name: 'AbortError',
    code: 'AUTH_SESSION_TIMEOUT',
    httpStatus: 408,
  });
}

function wait(delayMs, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function withAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

export function createSessionBootstrap(fetchSession, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  transientRetries = DEFAULT_TRANSIENT_RETRIES,
  retryDelayMs = attempt => attempt * 250,
} = {}) {
  let generation = 0;
  let cachedToken = '';
  let cachedSession = null;
  const inFlight = new Map();
  const controllers = new Set();

  const fetchOnce = (token, signal) => {
    if (token === cachedToken && cachedSession) return Promise.resolve(cachedSession);
    if (inFlight.has(token)) return inFlight.get(token);

    const requestGeneration = generation;
    const request = withAbort(
      Promise.resolve().then(() => fetchSession(token, { signal })),
      signal,
    )
      .then(session => {
        if (requestGeneration === generation) {
          cachedToken = token;
          cachedSession = session;
        }
        return session;
      })
      .finally(() => {
        if (inFlight.get(token) === request) inFlight.delete(token);
      });
    inFlight.set(token, request);
    return request;
  };

  return {
    async run(firebaseUser, { forceRefresh = false } = {}) {
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let transientAttempts = 0;
      let refreshed = Boolean(forceRefresh);
      const runRequest = async token => {
        while (true) {
          if (controller.signal.aborted) throw abortError();
          try {
            return await fetchOnce(token, controller.signal);
          } catch (error) {
            const status = statusOf(error);
            if (status === 401 && !refreshed) {
              refreshed = true;
              const refreshedToken = await withAbort(
                firebaseUser.getIdToken(true),
                controller.signal,
              );
              return runRequest(refreshedToken);
            }
            if (!TRANSIENT_STATUSES.has(status) || transientAttempts >= transientRetries) throw error;
            transientAttempts += 1;
            await wait(retryDelayMs(transientAttempts), controller.signal);
          }
        }
      };
      try {
        const token = await withAbort(
          firebaseUser.getIdToken(Boolean(forceRefresh)),
          controller.signal,
        );
        return await runRequest(token);
      } finally {
        clearTimeout(timeout);
        controllers.delete(controller);
      }
    },
    clear() {
      generation += 1;
      cachedToken = '';
      cachedSession = null;
      inFlight.clear();
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}

export const authSessionInternals = Object.freeze({
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TRANSIENT_RETRIES,
  TRANSIENT_STATUSES,
});
