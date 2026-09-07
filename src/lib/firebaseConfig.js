const FIELDS = ['apiKey', 'authDomain', 'projectId', 'appId'];
const PLACEHOLDER = /^(?:REPLACE_WITH_|YOUR_|<|\.{3}$|…$)/i;

export function validateFirebasePublicConfig(config = {}) {
  const missing = FIELDS.filter(key => typeof config?.[key] !== 'string'
    || !config[key].trim() || PLACEHOLDER.test(config[key].trim()));
  if (missing.length) return { valid: false, reason: 'missing', fields: missing };
  const whitespace = FIELDS.filter(key => config[key] !== config[key].trim());
  if (whitespace.length) return { valid: false, reason: 'whitespace', fields: whitespace };
  if (!/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId)) {
    return { valid: false, reason: 'project_id', fields: ['projectId'] };
  }
  const hostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  if (config.authDomain.length > 253 || !hostname.test(config.authDomain)) {
    return { valid: false, reason: 'auth_domain', fields: ['authDomain'] };
  }
  if (!/^1:\d+:web:[a-z0-9]+$/i.test(config.appId)) {
    return { valid: false, reason: 'app_id', fields: ['appId'] };
  }
  return { valid: true, reason: '', fields: [] };
}
