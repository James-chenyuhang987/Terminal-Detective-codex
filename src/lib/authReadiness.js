function readinessError(code, status = 503) {
  const error = /** @type {Error & { code?: string, httpStatus?: number }} */ (new Error(code));
  error.code = code;
  error.httpStatus = status;
  return error;
}

export async function requestAuthReadiness(serverUrl, expectedProjectId, {
  fetchImpl = fetch,
  timeoutMs = 10_000,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${serverUrl}/api/auth/config`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw readinessError('AUTH_BACKEND_UNAVAILABLE', response.status);
    if (!payload?.firebase || payload.firebase_project_id !== expectedProjectId) {
      throw readinessError('FIREBASE_PROJECT_MISMATCH');
    }
    if (!payload?.ready || !payload?.checks?.database || !payload?.checks?.schema) {
      throw readinessError('AUTH_BACKEND_NOT_READY');
    }
    return payload;
  } catch (error) {
    if (error?.code) throw error;
    throw readinessError(error?.name === 'AbortError' ? 'AUTH_BACKEND_TIMEOUT' : 'AUTH_BACKEND_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}
