import { parse, printParseErrorCode } from 'jsonc-parser';
import { validateFirebasePublicConfig } from '../src/lib/firebaseConfig.js';

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
  const databases = Array.isArray(config?.d1_databases) ? config.d1_databases.filter(database => database?.binding === 'DB') : [];
  const database = databases.length === 1 ? databases[0] : null;
  const workerProjectId = String(vars.FIREBASE_PROJECT_ID || '').trim();
  const frontendProjectId = String(environment.VITE_FIREBASE_PROJECT_ID || '').trim();
  const databaseId = String(database?.database_id || '').trim();
  const appId = String(vars.APP_ID || '');
  const frontendAppId = String(environment.VITE_APP_ID || 'terminal-detective');
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
  const firebaseFields = {
    apiKey: 'VITE_FIREBASE_API_KEY', authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID', appId: 'VITE_FIREBASE_APP_ID',
  };
  const frontend = validateFirebasePublicConfig(Object.fromEntries(Object.entries(firebaseFields)
    .map(([field, key]) => [field, environment[key]])));
  for (const field of frontend.fields) {
    if (field === 'projectId' && !frontendProjectId) continue;
    errors.push(`${firebaseFields[field]} ${frontend.reason === 'missing'
      ? 'is required and must not be a placeholder' : 'is invalid for Firebase Web configuration'}.`);
  }
  if (!UUID.test(databaseId)) errors.push('wrangler.jsonc must contain one D1 binding named DB with a valid database ID.');
  if (!appId || PLACEHOLDER.test(appId) || appId.trim() !== appId) errors.push('wrangler.jsonc must contain a real APP_ID without surrounding whitespace.');
  if (frontendAppId !== appId) errors.push('VITE_APP_ID and Worker APP_ID must match (the browser defaults to terminal-detective).');
  if (!allowedOrigins.length || allowedOrigins.some(origin => !exactOrigin(origin))) {
    errors.push('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins without paths.');
  }

  if (errors.length) {
    throw new Error(`Cloudflare release configuration is invalid:\n- ${errors.join('\n- ')}`);
  }
  return { appId, databaseId, firebaseProjectId: workerProjectId, allowedOrigins };
}
