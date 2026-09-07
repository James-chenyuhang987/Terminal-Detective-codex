import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { validateReleaseConfig } from './release-config.mjs';

export async function checkCloudflareRelease(root = fileURLToPath(new URL('../', import.meta.url))) {
  const config = await readFile(resolve(root, 'wrangler.jsonc'), 'utf8');
  return validateReleaseConfig(config, loadEnv('production', root, 'VITE_'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const release = await checkCloudflareRelease();
  console.log(`Cloudflare release configuration is valid for ${release.firebaseProjectId}.`);
}
