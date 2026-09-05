import { pathToFileURL } from 'node:url';

export const SMOKE_LIMITS = Object.freeze({
  maxRounds: 5,
  requestTimeoutMs: 10_000,
  totalTimeoutMs: 120_000,
  retryDelayMs: 2_000,
});
const SHA = /^[0-9a-f]{40}$/;

class SmokeFailure extends Error {
  constructor(stage, code, retryable = false, details = {}) {
    super(`${stage}: ${code}`);
    this.report = { stage, code, ...details };
    this.retryable = retryable;
  }
}

function fail(stage, code, retryable = false, details) {
  throw new SmokeFailure(stage, code, retryable, details);
}

function htmlTags(html) {
  // Ignore inert text and raw script bodies, not just lookalike tags inside them.
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(
    /<(script|style|textarea|title|template)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>[\s\S]*?<\/\1\s*>/gi,
    (_, name, attrs) => name.toLowerCase() === 'script' ? `<script${attrs}>` : '',
  );
  return [...source.matchAll(/<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi)].map(match => {
    const attrs = {};
    for (const attr of match[2].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const name = attr[1].toLowerCase();
      if (!Object.hasOwn(attrs, name)) attrs[name] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    return { name: match[1].toLowerCase(), attrs };
  });
}

export function validateBuildMarker(html, expectedSha) {
  if (!SHA.test(expectedSha)) fail('configuration', 'invalid_expected_sha');
  const markers = htmlTags(html).filter(tag => tag.name === 'meta' && tag.attrs.name === 'td-build');
  if (!markers.length) fail('build-marker', 'missing_marker', true, { expectedSha });
  if (markers.length !== 1) fail('build-marker', 'ambiguous_marker');
  const actualSha = markers[0].attrs.content;
  if (!SHA.test(actualSha)) fail('build-marker', 'invalid_marker', false, { expectedSha, actualSha: 'invalid' });
  if (actualSha !== expectedSha) fail('build-marker', 'stale_build', true, { expectedSha, actualSha });
  return actualSha;
}

function urlSetting(value, directory = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    if (directory && !url.pathname.endsWith('/')) url.pathname += '/';
    return url;
  } catch {
    fail('configuration', 'invalid_url');
  }
}

function embeddedValue(source, key, expected) {
  // app-params reads import.meta.env as an object; Vite emits these runtime values in the entry JS.
  const literal = '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)';
  const pattern = new RegExp(`(?:\\b${key}|["']${key}["'])\\s*:\\s*${literal}`, 'g');
  const values = [...source.matchAll(pattern)].map(match => {
    try {
      if (match[1][0] === '`' && match[1].includes('${')) return null;
      return match[1][0] === '"' ? JSON.parse(match[1]) : match[1].slice(1, -1);
    } catch {
      return null;
    }
  });
  return values.length > 0 && values.every(value => value === expected);
}

export function smokeOptionsFromEnv(env = process.env) {
  return {
    target: env.SMOKE_TARGET,
    siteUrl: env.SMOKE_SITE_URL,
    apiUrl: env.SMOKE_API_URL,
    expectedSha: env.VITE_BUILD_SHA,
    expectedProjectId: env.VITE_FIREBASE_PROJECT_ID,
    expectedAppId: env.VITE_APP_ID,
  };
}

export async function runProductionSmoke(options = {}) {
  const { fetchImpl = globalThis.fetch, log = event => console.log(JSON.stringify(event)) } = options;
  let round = 0;
  let stage = 'configuration';
  const emit = (status, details = {}) => log({ round, stage, status, ...details });
  try {
    const { target, expectedSha, expectedProjectId, expectedAppId } = options;
    if (!['worker', 'pages'].includes(target)) fail(stage, 'invalid_target');
    if (!SHA.test(expectedSha)) fail(stage, 'invalid_expected_sha');
    if (!/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(expectedProjectId || '')
      || !/^[a-zA-Z0-9_-]+$/.test(expectedAppId || '')) fail(stage, 'invalid_expected_config');
    const site = urlSetting(options.siteUrl, true);
    const api = urlSetting(options.apiUrl);
    if (api.pathname !== '/' || (target === 'worker' && (site.pathname !== '/' || api.origin !== site.origin))
      || (target === 'pages' && api.origin === site.origin)) fail(stage, 'invalid_api_origin');
    const limits = { ...SMOKE_LIMITS };
    for (const key of Object.keys(limits)) {
      const value = options[key] ?? limits[key];
      if (!Number.isInteger(value) || value < (key === 'retryDelayMs' ? 0 : 1) || value > limits[key]) {
        fail(stage, 'invalid_deadline_or_round_limit');
      }
      limits[key] = value;
    }
    const deadline = performance.now() + limits.totalTimeoutMs;
    const remaining = () => deadline - performance.now();
    const request = async (url, requestStage) => {
      stage = requestStage;
      if (remaining() <= 0) fail(stage, 'total_deadline');
      emit('request');
      const controller = new AbortController();
      const totalLimited = remaining() <= limits.requestTimeoutMs;
      const budget = Math.max(1, Math.min(limits.requestTimeoutMs, remaining()));
      let timer;
      try {
        // Race the complete operation: AbortSignal alone cannot bound a stalled body or an injected fetch.
        return await Promise.race([
          (async () => {
            const response = await fetchImpl(url.href, {
              method: 'GET', redirect: 'manual', cache: 'no-store', signal: controller.signal,
              headers: { Accept: requestStage === 'status' || requestStage === 'auth-config' ? 'application/json' : '*/*' },
            });
            if (response.status === 403) fail(requestStage, 'forbidden', false, { httpStatus: 403 });
            if (response.status >= 300 && response.status < 400) fail(requestStage, 'unexpected_redirect', false, { httpStatus: response.status });
            if (response.status >= 400 && response.status < 500 && response.status !== 429
              && !(response.status === 404 && ['entry-script', 'stylesheet', 'module-preload'].includes(requestStage))) {
              fail(requestStage, 'http_error', false, { httpStatus: response.status });
            }
            const body = await response.text();
            return { status: response.status, body, mime: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(new SmokeFailure(requestStage, totalLimited ? 'total_deadline' : 'request_deadline', !totalLimited));
              controller.abort();
            }, budget);
          }),
        ]);
      } catch (error) {
        if (error instanceof SmokeFailure) throw error;
        fail(requestStage, 'network_error', true);
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    };
    const httpCheck = (response, asset = false) => {
      if (response.status !== 200) {
        fail(stage, 'http_error', response.status === 429 || (response.status >= 500 && response.status <= 599) || (asset && response.status === 404), { httpStatus: response.status });
      }
    };
    const readiness = async (path, requestStage) => {
      const response = await request(new URL(path, api), requestStage);
      let value;
      try { value = JSON.parse(response.body); } catch { /* HTTP errors may have non-JSON platform bodies. */ }
      const object = value && typeof value === 'object' && !Array.isArray(value);
      // A known mismatch is permanent even when the endpoint returns a retryable 503.
      if (object && requestStage === 'status') {
        if ((value.mode !== undefined && value.mode !== 'firebase_cloudflare')
          || (value.service !== undefined && value.service !== 'terminal-detective-cloudflare')
          || value.checks?.firebase === false) fail(stage, 'status_config_mismatch');
      }
      if (object && requestStage === 'auth-config') {
        if ((value.primary !== undefined && value.primary !== 'firebase') || value.firebase === false) fail(stage, 'auth_config_mismatch');
        if (value.firebase_project_id !== undefined && value.firebase_project_id !== expectedProjectId) fail(stage, 'firebase_project_mismatch');
      }
      httpCheck(response);
      if (response.mime !== 'application/json' || !object) fail(stage, 'invalid_json');
      const valid = requestStage === 'status'
        ? value.ok === true && value.mode === 'firebase_cloudflare' && value.service === 'terminal-detective-cloudflare' && value.checks?.firebase === true
        : value.ready === true && value.primary === 'firebase' && value.firebase === true && value.firebase_project_id === expectedProjectId;
      if (!valid || value.checks?.database !== true || value.checks?.schema !== true) fail(stage, 'readiness_failed');
      emit('passed', { httpStatus: response.status });
    };
    const checkRound = async () => {
      await readiness('/api/cloudflare/status', 'status');
      await readiness('/api/auth/config', 'auth-config');
      const home = await request(site, 'homepage');
      httpCheck(home);
      if (home.mime !== 'text/html' || !home.body.trim()) fail(stage, 'invalid_homepage');
      emit('passed', { httpStatus: home.status });
      stage = 'build-marker';
      validateBuildMarker(home.body, expectedSha);
      emit('passed', { expectedSha, actualSha: expectedSha });
      stage = 'entry-assets';
      const tags = htmlTags(home.body);
      if (tags.some(tag => tag.name === 'base')) fail(stage, 'unexpected_base_tag');
      const scripts = tags.filter(tag => tag.name === 'script' && tag.attrs.type?.toLowerCase() === 'module' && tag.attrs.src);
      const styles = tags.filter(tag => tag.name === 'link' && tag.attrs.rel?.toLowerCase().split(/\s+/).includes('stylesheet'));
      const preloads = tags.filter(tag => tag.name === 'link' && tag.attrs.rel?.toLowerCase().split(/\s+/).includes('modulepreload'));
      if (!scripts.length || !styles.length) fail(stage, 'missing_entry_assets', true);
      const resources = [
        ...scripts.map(tag => ({ path: tag.attrs.src, kind: 'entry-script' })),
        ...styles.map(tag => ({ path: tag.attrs.href, kind: 'stylesheet' })),
        ...preloads.map(tag => ({ path: tag.attrs.href, kind: 'module-preload' })),
      ];
      let entrySource = '';
      for (const resource of resources) {
        stage = resource.kind;
        let url;
        try { url = new URL(resource.path, site); } catch { fail(stage, 'invalid_asset_url'); }
        if (!resource.path || url.origin !== site.origin || !url.pathname.startsWith(site.pathname)
          || url.username || url.password || url.hash) fail(stage, 'asset_outside_site');
        const asset = await request(url, resource.kind);
        httpCheck(asset, true);
        if (!asset.body.trim()) fail(stage, 'empty_asset', true);
        if (asset.mime === 'text/html' || /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(asset.body)) fail(stage, 'html_instead_of_asset', true);
        const types = resource.kind === 'stylesheet' ? ['text/css'] : ['text/javascript', 'application/javascript'];
        if (!types.includes(asset.mime)) fail(stage, 'invalid_asset_mime');
        if (resource.kind === 'entry-script') entrySource += `\n${asset.body}`;
        emit('passed', { httpStatus: asset.status });
      }
      stage = 'runtime-config';
      if (!embeddedValue(entrySource, 'VITE_APP_ID', expectedAppId)) fail(stage, 'app_id_mismatch');
      if (!embeddedValue(entrySource, 'VITE_FIREBASE_PROJECT_ID', expectedProjectId)) fail(stage, 'frontend_project_mismatch');
      if (!embeddedValue(entrySource, 'VITE_API_SERVER_URL', target === 'worker' ? 'same-origin' : api.origin)) fail(stage, 'api_origin_mismatch');
      emit('passed');
    };
    for (round = 1; round <= limits.maxRounds; round += 1) {
      try {
        await checkRound();
        if (remaining() <= 0) fail(stage, 'total_deadline');
        stage = 'complete';
        emit('passed', { expectedSha });
        return { rounds: round, expectedSha };
      } catch (error) {
        if (!(error instanceof SmokeFailure)) throw error;
        if (!error.retryable) throw error;
        if (remaining() <= 0) fail(stage, 'total_deadline');
        if (round === limits.maxRounds) throw error;
        emit('retry', error.report);
        const budget = Math.max(0, remaining());
        const totalLimited = budget <= limits.retryDelayMs;
        const delay = Math.min(limits.retryDelayMs, budget);
        await new Promise(resolve => setTimeout(resolve, Math.ceil(delay)));
        // A deadline-limited timer is terminal even if the monotonic clock is slightly behind its wakeup.
        if (totalLimited || remaining() <= 0) fail(stage, 'total_deadline');
      }
    }
  } catch (error) {
    const safe = error instanceof SmokeFailure ? error : new SmokeFailure(stage, 'unexpected_error');
    emit('failed', safe.report);
    throw safe;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProductionSmoke(smokeOptionsFromEnv()).catch(() => { process.exitCode = 1; });
}
