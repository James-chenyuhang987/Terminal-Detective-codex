import { appParams } from '../lib/app-params.js';

function headers() {
  const value = /** @type {Record<string, string>} */ ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-App-Id': String(appParams.appId),
  });
  if (typeof window !== 'undefined' && window.location?.href) value['X-Origin-URL'] = window.location.href;
  return value;
}

function requestError(response, body, functionName) {
  const error = /** @type {Error & { status?: number, code?: string, data?: any }} */ (
    new Error(body?.message || body?.detail || body?.error || `Function ${functionName} failed (${response.status}).`)
  );
  error.status = response.status;
  error.code = body?.code || body?.error || 'FUNCTION_UNAVAILABLE';
  error.data = body;
  return error;
}

async function invoke(functionName, data = {}) {
  if (!functionName || typeof functionName !== 'string') throw new Error('A Cloudflare function name is required.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Function ${functionName} must receive an object with named parameters.`);
  }
  const response = await fetch(`${appParams.serverUrl}/api/apps/${appParams.appId}/functions/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(data),
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

// A narrow client keeps authentication in Cloudflare's HttpOnly session cookie
// and avoids shipping any vendor SDK in the browser bundle.
export const cloudflareApi = Object.freeze({ functions: Object.freeze({ invoke }) });
