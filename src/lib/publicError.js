const SAFE_CODES = Object.freeze({
  UNAUTHENTICATED: ['登录状态已失效，请重新登录。', 'Your session has expired. Sign in again.'],
  TOKEN_EXPIRED: ['登录状态已过期，系统正在尝试恢复。', 'Your session expired. The app is attempting recovery.'],
  SESSION_TAKEN: ['账号已在另一台设备接管，当前页面已转为只读。', 'Another device took over this account. This page is now read-only.'],
  STALE_PROFILE: ['云端档案已更新，正在合并最新进度。', 'The cloud profile changed. Merging the latest progress.'],
  PROFILE_TIMEOUT: ['云端档案响应超时，进度会在网络恢复后继续同步。', 'The cloud profile timed out. Progress will sync when the connection recovers.'],
  DATABASE_UNAVAILABLE: ['云端档案暂时不可用，本地进度已进入待同步队列。', 'Cloud storage is temporarily unavailable. Progress is queued locally.'],
  FIREBASE_KEYS_UNAVAILABLE: ['身份校验服务暂时不可用，请稍后重试。', 'Identity verification is temporarily unavailable. Try again shortly.'],
  RATE_LIMITED: ['请求过于频繁，请稍后重试。', 'Too many requests. Try again shortly.'],
  ROUTE_NOT_FOUND: ['请求的服务版本不存在，请刷新页面。', 'The requested service version is unavailable. Refresh the page.'],
});

export function publicErrorMessage(error, lang = 'zh') {
  const english = lang === 'en';
  const code = String(error?.code || error?.feedbackCode || '').toUpperCase();
  if (SAFE_CODES[code]) return SAFE_CODES[code][english ? 1 : 0];
  const status = Number(error?.status) || 0;
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

export function errorReference(error) {
  const source = `${error?.code || error?.name || 'ERR'}:${error?.status || 0}:${Date.now()}`;
  let hash = 2166136261;
  for (const char of source) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `TD-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
