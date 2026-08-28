import { appParams } from '../lib/app-params.js';

function headers() {
  const value = /** @type {Record<string, string>} */ ({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-App-Id': String(appParams.appId),
  });
  if (appParams.token) value.Authorization = `Bearer ${appParams.token}`;
  if (appParams.functionsVersion) value['Base44-Functions-Version'] = appParams.functionsVersion;
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
  if (!functionName || typeof functionName !== 'string') throw new Error('A Base44 function name is required.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Function ${functionName} must receive an object with named parameters.`);
  }
  const response = await fetch(`${appParams.serverUrl}/api/apps/${appParams.appId}/functions/${encodeURIComponent(functionName)}`, {
    method: 'POST',
    headers: headers(),
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

// The game only needs custom function invocation in the browser. Keeping this
// adapter narrow avoids shipping the SDK's realtime/socket modules on the
// first screen while preserving the existing `base44.functions.invoke` API.
export const base44 = Object.freeze({ functions: Object.freeze({ invoke }) });
