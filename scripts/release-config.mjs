import { parse, printParseErrorCode } from 'jsonc-parser';

const PLACEHOLDER = /^(?:REPLACE_WITH_|YOUR_|<)/i;
const FIREBASE_PROJECT_ID = /^[a-z0-9](?:[a-z0-9-]{4,28}[a-z0-9])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseJsonc(source) {
  const errors = [];
  const config = parse(String(source || ''), errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length) {
    const first = errors[0];
    throw new Error(
      `wrangler.jsonc is invalid at offset ${first.offset}: ${printParseErrorCode(first.error)}`,
    );
  }
  return config;
}

function exactOrigin(value) {
  try {
    const parsed = new URL(value);
    const local = parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    return (parsed.protocol === 'https:' || local)
      && parsed.origin === value
      && parsed.username === ''
      && parsed.password === '';
  } catch {
    return false;
  }
}

export function validateReleaseConfig(configSource, environment = {}) {
  const errors = [];
  const config = parseJsonc(configSource);
  const vars = config?.vars || {};
  const database = Array.isArray(config?.d1_databases) ? config.d1_databases[0] : null;
  const workerProjectId = String(vars.FIREBASE_PROJECT_ID || '').trim();
  const frontendProjectId = String(environment.VITE_FIREBASE_PROJECT_ID || '').trim();
  const databaseId = String(database?.database_id || '').trim();
  const appId = String(vars.APP_ID || '').trim();
  const allowedOrigins = String(vars.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (!workerProjectId || PLACEHOLDER.test(workerProjectId)
    || !FIREBASE_PROJECT_ID.test(workerProjectId)) {
    errors.push('wrangler.jsonc must contain a real Firebase project ID.');
  }
  if (!frontendProjectId) {
    errors.push('VITE_FIREBASE_PROJECT_ID is required.');
  } else if (frontendProjectId !== workerProjectId) {
    errors.push('Frontend and Worker Firebase project IDs must match.');
  }
  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_APP_ID',
  ]) {
    if (!String(environment[key] || '').trim()) errors.push(`${key} is required.`);
  }
  if (!UUID.test(databaseId)) errors.push('wrangler.jsonc must contain a valid D1 database ID.');
  if (!appId || PLACEHOLDER.test(appId)) errors.push('wrangler.jsonc must contain a real APP_ID.');
  if (!allowedOrigins.length || allowedOrigins.some(origin => !exactOrigin(origin))) {
    errors.push('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins without paths.');
  }

  if (errors.length) {
    throw new Error(`Cloudflare release configuration is invalid:\n- ${errors.join('\n- ')}`);
  }
  return { appId, databaseId, firebaseProjectId: workerProjectId, allowedOrigins };
}
