const SAFE_CODES = Object.freeze({
  PROFILE_COMMAND_PENDING: ['本次操作尚未确认；联网后将使用原编号重试。请勿重复操作。', 'This action is not confirmed yet. Its original receipt will retry when online; do not repeat the action.'],
  PROFILE_COMMAND_INVALID: ['操作格式无效，请刷新页面后重试。', 'The action format is invalid. Reload the page and retry.'],
  PROFILE_SYNC_BLOCKED: ['档案同步暂时不可用，请先恢复云端连接。', 'Profile sync is unavailable. Restore the cloud connection before continuing.'],
  PROFILE_AUTHORITY_REQUIRED: ['服务端版本尚未支持安全档案操作，请联系管理员更新。', 'The server does not support authoritative profiles yet. Contact the administrator to update it.'],
  UNAUTHENTICATED: ['登录状态已失效，请重新登录。', 'Your session has expired. Sign in again.'],
  TOKEN_EXPIRED: ['登录状态已过期，系统正在尝试恢复。', 'Your session expired. The app is attempting recovery.'],
  SESSION_TAKEN: ['账号已在另一台设备接管，当前页面已转为只读。', 'Another device took over this account. This page is now read-only.'],
  STALE_PROFILE: ['云端档案已更新，本地改动已暂停以避免覆盖进度。', 'The cloud profile changed. Local changes are paused to prevent overwriting progress.'],
  PROFILE_TIMEOUT: ['云端档案响应超时，进度会在网络恢复后继续同步。', 'The cloud profile timed out. Progress will sync when the connection recovers.'],
  PROFILE_NETWORK: ['无法连接云端档案，请检查网络或代理后重试。', 'The cloud profile could not be reached. Check your network or proxy and retry.'],
  DATABASE_UNAVAILABLE: ['云端档案暂时不可用，操作尚未确认。请恢复连接后重试。', 'Cloud storage is temporarily unavailable. The action is not confirmed; reconnect and retry.'],
  FIREBASE_KEYS_UNAVAILABLE: ['身份校验服务暂时不可用，请稍后重试。', 'Identity verification is temporarily unavailable. Try again shortly.'],
  RATE_LIMITED: ['请求过于频繁，请稍后重试。', 'Too many requests. Try again shortly.'],
  ROUTE_NOT_FOUND: ['请求的服务版本不存在，请刷新页面。', 'The requested service version is unavailable. Refresh the page.'],
});

export function publicErrorMessage(error, lang = 'zh') {
  const english = lang === 'en';
  const code = String(error?.code || error?.feedbackCode || '').toUpperCase();
  if (SAFE_CODES[code]) return SAFE_CODES[code][english ? 1 : 0];
  const status = Number(error?.status ?? error?.httpStatus) || 0;
  if (status === 401 || status === 403) return SAFE_CODES.UNAUTHENTICATED[english ? 1 : 0];
  if (status === 429) return SAFE_CODES.RATE_LIMITED[english ? 1 : 0];
  if (status >= 500 || error?.name === 'AbortError' || error instanceof TypeError) {
    return english
      ? 'The service is temporarily unavailable. Your action was preserved where possible; retry shortly.'
      : '服务暂时不可用；系统已尽可能保留本次操作，请稍后重试。';
  }
  return english
    ? 'The operation could not be completed. Retry or reload the latest version.'
    : '操作未能完成，请重试或重新加载最新版本。';
}
