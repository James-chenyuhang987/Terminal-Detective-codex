const AUTH_REDIRECT_ERROR_KEY = 'td_auth_redirect_error';

function safeSessionSet(key, value) {
  try { window.sessionStorage.setItem(key, value); } catch { /* storage can be blocked */ }
}

export function captureAuthRedirectResult() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const hashParams = url.hash.startsWith('#error=') ? new URLSearchParams(url.hash.slice(1)) : null;
  const errorCode = url.searchParams.get('auth_error')
    || url.searchParams.get('error_code')
    || hashParams?.get('error_code')
    || hashParams?.get('error');
  if (errorCode) safeSessionSet(AUTH_REDIRECT_ERROR_KEY, errorCode);

  let changed = false;
  ['auth', 'auth_error', 'error', 'error_code', 'error_description'].forEach(key => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (hashParams) {
    url.hash = '';
    changed = true;
  }
  if (changed) window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  return errorCode;
}

export function consumeAuthRedirectError() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(AUTH_REDIRECT_ERROR_KEY);
    window.sessionStorage.removeItem(AUTH_REDIRECT_ERROR_KEY);
    return value;
  } catch {
    return null;
  }
}
