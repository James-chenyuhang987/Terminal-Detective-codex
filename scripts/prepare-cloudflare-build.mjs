import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// `_redirects` belongs to the legacy static host. Cloudflare's SPA asset
// handling already performs the fallback and rejects this rule as a loop.
await rm(resolve('dist', '_redirects'), { force: true });
