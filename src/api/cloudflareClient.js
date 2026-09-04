import { appParams } from '../lib/app-params.js';
import { fetchWithAuth } from '../lib/authToken.js';

const JSON_HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
});

function requestError(response, body, functionName) {
  const error = /** @type {Error & { status?: number, code?: string, data?: any }} */ (
    new Error(body?.message || body?.detail || body?.error || `Function ${functionName} failed (${response.status}).`)
  );
  error.status = response.status;
  error.code = body?.code || body?.error || 'FUNCTION_UNAVAILABLE';
  error.data = body;
  return error;
}

async function invoke(functionName, data = {}, options = {}) {
  if (!functionName || typeof functionName !== 'string') throw new Error('A Cloudflare function name is required.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Function ${functionName} must receive an object with named parameters.`);
  }
  const response = await fetchWithAuth(`${appParams.serverUrl}/api/apps/${appParams.appId}/functions/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
    signal: options.signal,
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = { error: 'INVALID_FUNCTION_RESPONSE', message: text.slice(0, 240) }; }
  }
  if (!response.ok) throw requestError(response, body, functionName);
  return { data: body };
}

// Authentication is injected centrally as a short-lived Firebase ID token. A
// single 401 refresh is handled by fetchWithAuth for every game function.
export const cloudflareApi = Object.freeze({ functions: Object.freeze({ invoke }) });
