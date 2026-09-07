import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCloudflareRelease } from '../scripts/check-cloudflare-release.mjs';
import { validateFirebasePublicConfig } from '../src/lib/firebaseConfig.js';
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

test('release and browser reject the same missing, placeholder and malformed public Firebase values', () => {
  const fieldNames = {
    apiKey: 'VITE_FIREBASE_API_KEY', authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID', appId: 'VITE_FIREBASE_APP_ID',
  };
  const publicConfig = env => Object.fromEntries(Object.entries(fieldNames).map(([field, key]) => [field, env[key]]));
  assert.equal(validateFirebasePublicConfig(publicConfig(environment)).valid, true);
  assert.equal(validateFirebasePublicConfig({}).valid, false);
  assert.equal(validateFirebasePublicConfig(null).valid, false);
  for (const field of Object.values(fieldNames)) {
    for (const value of [undefined, '', '   ', 'YOUR_VALUE', 'REPLACE_WITH_VALUE', '<value>', '...', '…', ` ${environment[field]} `]) {
      const invalid = { ...environment, [field]: value };
      assert.equal(validateFirebasePublicConfig(publicConfig(invalid)).valid, false, field);
      assert.throws(() => validateReleaseConfig(config, invalid), new RegExp(field));
    }
  }
  for (const [field, value] of [
    ['authDomain', 'https://auth.example.com'], ['authDomain', 'auth.example.com/path'],
    ['authDomain', 'auth.example.com?x=1'], ['authDomain', 'auth.example.com#auth'],
    ['authDomain', 'auth.example.com:443'], ['authDomain', 'bad host.example.com'],
    ['authDomain', '-auth.example.com'], ['authDomain', 'auth..example.com'],
    ['appId', 'project:web:app'], ['appId', '1:123:android:abc'], ['appId', '1:123:web:'],
    ['projectId', 'UPPERCASE-PROJECT'], ['projectId', 'abc'],
  ]) {
    const invalid = { ...environment, [fieldNames[field]]: value };
    assert.equal(validateFirebasePublicConfig(publicConfig(invalid)).valid, false);
    assert.throws(() => validateReleaseConfig(config, invalid));
  }
  const customDomain = { ...environment, VITE_FIREBASE_AUTH_DOMAIN: 'auth.game.example' };
  assert.equal(validateFirebasePublicConfig(publicConfig(customDomain)).valid, true);
  assert.equal(validateReleaseConfig(config, customDomain).firebaseProjectId, environment.VITE_FIREBASE_PROJECT_ID);
});

test('release check reads production Vite files with expansion and shell overrides, without leaking values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'td-release-config-'));
  const original = Object.fromEntries(Object.keys(process.env).filter(key => key.startsWith('VITE_'))
    .map(key => [key, process.env[key]]));
  const envFile = values => Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
  try {
    for (const key of Object.keys(original)) delete process.env[key];
    await writeFile(join(root, 'wrangler.jsonc'), config);
    await assert.rejects(checkCloudflareRelease(root), /VITE_FIREBASE_PROJECT_ID is required/);
    await writeFile(join(root, '.env'), envFile(environment));
    assert.equal((await checkCloudflareRelease(root)).firebaseProjectId, environment.VITE_FIREBASE_PROJECT_ID);
    await writeFile(join(root, '.env.local'), 'VITE_FIREBASE_PROJECT_ID=wrong-local-project');
    await assert.rejects(checkCloudflareRelease(root), /project IDs must match/);
    await writeFile(join(root, '.env.production'), envFile({
      VITE_FIREBASE_PROJECT_ID: environment.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_AUTH_DOMAIN: '${VITE_FIREBASE_PROJECT_ID}.firebaseapp.com',
    }));
    assert.equal((await checkCloudflareRelease(root)).firebaseProjectId, environment.VITE_FIREBASE_PROJECT_ID);
    await writeFile(join(root, '.env.production.local'), 'VITE_FIREBASE_AUTH_DOMAIN=https://private-fixture.invalid');
    await assert.rejects(checkCloudflareRelease(root), error => {
      assert.match(error.message, /VITE_FIREBASE_AUTH_DOMAIN/);
      assert.doesNotMatch(error.message, /private-fixture/);
      return true;
    });
    process.env.VITE_FIREBASE_AUTH_DOMAIN = environment.VITE_FIREBASE_AUTH_DOMAIN;
    assert.equal((await checkCloudflareRelease(root)).firebaseProjectId, environment.VITE_FIREBASE_PROJECT_ID);
    process.env.VITE_FIREBASE_API_KEY = '';
    await assert.rejects(checkCloudflareRelease(root), /VITE_FIREBASE_API_KEY is required/);
    process.env.VITE_FIREBASE_API_KEY = environment.VITE_FIREBASE_API_KEY;
    await rm(join(root, '.env'));
    await rm(join(root, '.env.local'));
    await rm(join(root, '.env.production'));
    await writeFile(join(root, '.env.production.local'), envFile(environment));
    await checkCloudflareRelease(root);
  } finally {
    for (const key of Object.keys(process.env).filter(key => key.startsWith('VITE_'))) delete process.env[key];
    Object.assign(process.env, original);
    await rm(root, { recursive: true, force: true });
  }
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
