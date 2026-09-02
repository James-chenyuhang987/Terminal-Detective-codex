export const AUTH_FEEDBACK_CODES = Object.freeze({
  CONFIG_MISSING: 'config_missing',
  INVALID_CREDENTIAL: 'invalid_credential',
  EMAIL_UNVERIFIED: 'email_unverified',
  EMAIL_IN_USE: 'email_in_use',
  WEAK_PASSWORD: 'weak_password',
  RATE_LIMITED: 'rate_limited',
  GITHUB_CANCELLED: 'github_cancelled',
  ACCOUNT_EXISTS: 'account_exists',
  POPUP_BLOCKED: 'popup_blocked',
  NETWORK: 'network',
  DOMAIN_UNAUTHORIZED: 'domain_unauthorized',
  PROVIDER_DISABLED: 'provider_disabled',
  USER_DISABLED: 'user_disabled',
  BROWSER_UNSUPPORTED: 'browser_unsupported',
  BACKEND_MISMATCH: 'backend_mismatch',
  RECENT_LOGIN_REQUIRED: 'recent_login_required',
  LAST_PROVIDER: 'last_provider',
  INVALID_EMAIL: 'invalid_email',
  ACTION_EXPIRED: 'action_expired',
  PROFILE_CONFLICT: 'profile_conflict',
  ACCOUNT_DISABLED: 'account_disabled',
  BACKEND_NOT_READY: 'backend_not_ready',
  UNKNOWN: 'unknown',
});

export const AUTH_NOTICE_CODES = Object.freeze({
  PASSWORD_RESET_COMPLETE: 'password_reset_complete',
  VERIFICATION_INCOMPLETE: 'verification_incomplete',
  GITHUB_LINKED: 'github_linked',
  REAUTHENTICATED: 'reauthenticated',
});

export function validatePassword(password) {
  const value = String(password || '');
  return {
    valid: value.length >= 8 && value.length <= 64 && /[A-Za-z]/.test(value) && /\d/.test(value),
    length: value.length >= 8 && value.length <= 64,
    letter: /[A-Za-z]/.test(value),
    number: /\d/.test(value),
  };
}

export function mapFirebaseAuthError(error) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('configuration-not-found') || code.includes('invalid-api-key') || code.includes('operation-not-allowed') || code.includes('unauthorized-domain')) return AUTH_FEEDBACK_CODES.CONFIG_MISSING;
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('user-mismatch') || code.includes('user-token-expired')) return AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL;
  if (code.includes('user-disabled')) return AUTH_FEEDBACK_CODES.ACCOUNT_DISABLED;
  if (code.includes('email-already-in-use')) return AUTH_FEEDBACK_CODES.EMAIL_IN_USE;
  if (code.includes('weak-password') || code.includes('password-does-not-meet-requirements')) return AUTH_FEEDBACK_CODES.WEAK_PASSWORD;
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) return AUTH_FEEDBACK_CODES.RATE_LIMITED;
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return AUTH_FEEDBACK_CODES.GITHUB_CANCELLED;
  if (code.includes('account-exists-with-different-credential') || code.includes('credential-already-in-use')) return AUTH_FEEDBACK_CODES.ACCOUNT_EXISTS;
  if (code.includes('popup-blocked') || code.includes('operation-not-supported-in-this-environment')) return AUTH_FEEDBACK_CODES.POPUP_BLOCKED;
  if (code.includes('network-request-failed') || code.includes('internal-error') || code.includes('timeout') || error?.name === 'AbortError') return AUTH_FEEDBACK_CODES.NETWORK;
  if (code.includes('unauthorized-domain') || code.includes('app-not-authorized') || code.includes('invalid-continue-uri') || code.includes('missing-continue-uri')) return AUTH_FEEDBACK_CODES.DOMAIN_UNAUTHORIZED;
  if (code.includes('operation-not-allowed') || code.includes('invalid-oauth-client-id')) return AUTH_FEEDBACK_CODES.PROVIDER_DISABLED;
  if (code.includes('user-disabled')) return AUTH_FEEDBACK_CODES.USER_DISABLED;
  if (code.includes('web-storage-unsupported')) return AUTH_FEEDBACK_CODES.BROWSER_UNSUPPORTED;
  if (code.includes('requires-recent-login')) return AUTH_FEEDBACK_CODES.RECENT_LOGIN_REQUIRED;
  if (code.includes('invalid-email') || code.includes('missing-email')) return AUTH_FEEDBACK_CODES.INVALID_EMAIL;
  if (code.includes('expired-action-code') || code.includes('invalid-action-code')) return AUTH_FEEDBACK_CODES.ACTION_EXPIRED;
  return AUTH_FEEDBACK_CODES.UNKNOWN;
}

export function authRedirectFeedback(params = {}) {
  const code = String(params.error_code || params.code || '').toLowerCase();
  const error = String(params.error || '').toLowerCase();
  const description = String(params.error_description || '').toLowerCase();
  const combined = `${code} ${error} ${description}`;
  if (!combined.trim()) return '';
  if (combined.includes('too_many') || combined.includes('rate') || combined.includes('quota')) return AUTH_FEEDBACK_CODES.RATE_LIMITED;
  if (combined.includes('unauthorized') || combined.includes('redirect') || combined.includes('configuration')) return AUTH_FEEDBACK_CODES.DOMAIN_UNAUTHORIZED;
  if (combined.includes('access_denied') || combined.includes('cancel')) return AUTH_FEEDBACK_CODES.GITHUB_CANCELLED;
  if (combined.includes('expired') || combined.includes('invalid_action_code')) return AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL;
  return AUTH_FEEDBACK_CODES.UNKNOWN;
}

export function providerIds(user) {
  return [...new Set((user?.providerData || []).map(item => item?.providerId).filter(Boolean))];
}

export function hasPasswordProvider(user) {
  return providerIds(user).includes('password');
}

export function hasGitHubProvider(user) {
  return providerIds(user).includes('github.com');
}
