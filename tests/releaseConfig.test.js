import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReleaseConfig } from '../scripts/release-config.mjs';

const config = JSON.stringify({
  vars: {
    APP_ID: 'terminal-detective',
    FIREBASE_PROJECT_ID: 'terminal-detective-e1714',
    CORS_ALLOWED_ORIGINS: 'https://game.example,http://localhost:5173',
  },
  d1_databases: [{
    database_id: '4afe18c5-2a7b-49a9-9c8c-6fcdbfb86d23',
  }],
});
const environment = {
  VITE_FIREBASE_API_KEY: 'public-browser-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'terminal-detective-e1714.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'terminal-detective-e1714',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
};

test('release configuration accepts matching Firebase and D1 settings', () => {
  assert.deepEqual(validateReleaseConfig(config, environment), {
    appId: 'terminal-detective',
    databaseId: '4afe18c5-2a7b-49a9-9c8c-6fcdbfb86d23',
    firebaseProjectId: 'terminal-detective-e1714',
    allowedOrigins: ['https://game.example', 'http://localhost:5173'],
  });
});

test('release configuration rejects placeholders and Firebase project mismatches', () => {
  assert.throws(
    () => validateReleaseConfig(config.replace('terminal-detective-e1714', 'REPLACE_WITH_PROJECT'), environment),
    /real Firebase project ID/,
  );
  assert.throws(
    () => validateReleaseConfig(config, { ...environment, VITE_FIREBASE_PROJECT_ID: 'another-project' }),
    /project IDs must match/,
  );
});

test('release configuration requires every public Firebase Web App value', () => {
  assert.throws(
    () => validateReleaseConfig(config, { ...environment, VITE_FIREBASE_API_KEY: '' }),
    /VITE_FIREBASE_API_KEY is required/,
  );
});
