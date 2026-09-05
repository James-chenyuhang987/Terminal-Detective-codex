import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('release configuration accepts Wrangler JSONC comments and trailing commas', () => {
  const jsonc = `{
    // Worker configuration
    "vars": {
      "APP_ID": "terminal-detective",
      "FIREBASE_PROJECT_ID": "terminal-detective-e1714",
      "CORS_ALLOWED_ORIGINS": "https://game.example",
    },
    "d1_databases": [{
      "database_id": "4afe18c5-2a7b-49a9-9c8c-6fcdbfb86d23",
    }],
  }`;
  assert.equal(validateReleaseConfig(jsonc, environment).appId, 'terminal-detective');
});

test('release configuration rejects unterminated JSONC comments', () => {
  assert.throws(
    () => validateReleaseConfig(`${config}\n/* unfinished`, environment),
    /wrangler\.jsonc is invalid/,
  );
});

const workflow = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const [workerJob, pagesJob] = workflow.split('\n  deploy-pages:');
const workerOrigin = 'https://terminal-detective-codex.terminal-detective.workers.dev';

test('Worker release uses the strict Node smoke gate after the unchanged full deploy command', () => {
  assert.match(workerJob, /run: npm run cloudflare:deploy/);
  assert.ok(workerJob.indexOf('name: Smoke test Worker') > workerJob.indexOf('run: npm run cloudflare:deploy'));
  assert.match(workerJob, /SMOKE_TARGET: worker/);
  assert.ok(workerJob.includes(`SMOKE_SITE_URL: ${workerOrigin}`));
  assert.ok(workerJob.includes(`SMOKE_API_URL: ${workerOrigin}`));
  assert.match(workerJob, /run: node scripts\/smoke-production\.mjs/);
});

test('Pages waits for Worker and checks the deployed page URL and configured Worker origin', () => {
  assert.match(pagesJob, /needs: deploy-worker/);
  assert.ok(pagesJob.indexOf('name: Smoke test Pages') > pagesJob.indexOf('uses: actions/deploy-pages@'));
  assert.match(pagesJob, /id: deployment/);
  assert.match(pagesJob, /SMOKE_TARGET: pages/);
  assert.ok(pagesJob.includes('SMOKE_SITE_URL: ${{ steps.deployment.outputs.page_url }}'));
  assert.ok(pagesJob.includes('SMOKE_API_URL: ${{ env.VITE_API_SERVER_URL }}'));
  assert.ok(pagesJob.includes(`VITE_API_SERVER_URL: ${workerOrigin}`));
  assert.match(pagesJob, /run: node scripts\/smoke-production\.mjs/);
});

test('both release gates inherit exact build/config values and cannot mask failures or migrate data', () => {
  for (const job of [workerJob, pagesJob]) {
    assert.ok(job.includes('VITE_BUILD_SHA: ${{ github.sha }}'));
    assert.ok(job.includes('VITE_FIREBASE_PROJECT_ID: ${{ vars.VITE_FIREBASE_PROJECT_ID }}'));
    assert.match(job, /VITE_APP_ID: terminal-detective/);
  }
  assert.equal((workflow.match(/run: node scripts\/smoke-production\.mjs/g) || []).length, 2);
  assert.doesNotMatch(workflow, /continue-on-error|always\(\)|\|\|\s*true|grep -E|curl --fail-with-body|d1 migrations|cloudflare:d1:remote/);
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(scripts['cloudflare:deploy'], 'npm test && npm run typecheck && npm run lint && npm run security:check && npm run cloudflare:check && wrangler deploy');
  assert.doesNotMatch(scripts['cloudflare:deploy'], /migration|d1:remote/);
});
