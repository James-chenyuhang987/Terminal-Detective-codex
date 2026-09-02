import { readFile } from 'node:fs/promises';

import { validateReleaseConfig } from './release-config.mjs';

const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const release = validateReleaseConfig(config, process.env);

console.log(`Cloudflare release configuration is valid for ${release.firebaseProjectId}.`);
