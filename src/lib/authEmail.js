export const AUTH_EMAIL_LANGUAGE_KEY = 'td_lang_v1';

export function getAuthEmailLanguageCode(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(AUTH_EMAIL_LANGUAGE_KEY) === 'en' ? 'en' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export function prepareAuthEmail(auth, storage = globalThis.localStorage) {
  if (!auth) return;
  auth.languageCode = getAuthEmailLanguageCode(storage);
}

export function resolveAuthEmailSender(configuredSender, projectId) {
  const configured = String(configuredSender || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured)) return configured;

  const project = String(projectId || '').trim();
  return project ? `noreply@${project}.firebaseapp.com` : '';
}
