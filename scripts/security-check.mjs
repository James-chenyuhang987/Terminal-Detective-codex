import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const blockedProjectConfigs = ['.mcp.json', 'mcp.json', '.claude', '.cursor', '.codex'];
const allowedRegistry = 'registry.npmjs.org';
const secretPatterns = [
  { label: 'private key', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: 'OpenAI-style API key', expression: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'GitHub token', expression: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { label: 'Slack token', expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { label: 'AWS access key', expression: /\bAKIA[0-9A-Z]{16}\b/ },
];

function fail(message) {
  failures.push(message);
}

for (const relative of blockedProjectConfigs) {
  if (existsSync(path.join(root, relative))) {
    fail(`blocked project execution config exists: ${relative}`);
  }
}

const historyNames = execFileSync('git', [
  'log', '--all', '--name-only', '--pretty=format:', '--',
], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
for (const relative of blockedProjectConfigs) {
  if (historyNames.split(/\r?\n/).some(name => name === relative || name.startsWith(`${relative}/`))) {
    fail(`blocked project execution config exists in Git history: ${relative}`);
  }
}

const listed = execFileSync('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', '-z',
], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

for (const relative of listed) {
  if (/^\.env(?:\.|$)/.test(relative) && relative !== '.env.example') {
    fail(`environment file would enter source control: ${relative}`);
  }
  const absolute = path.join(root, relative);
  if (!existsSync(absolute) || !statSync(absolute).isFile() || statSync(absolute).size > 1024 * 1024) continue;
  const content = readFileSync(absolute);
  if (content.includes(0)) continue;
  const text = content.toString('utf8');
  for (const pattern of secretPatterns) {
    if (pattern.expression.test(text)) fail(`${pattern.label} pattern found in ${relative}`);
  }
}

const historyPatch = execFileSync('git', [
  'log', '--all', '-p', '--', '.', ':(exclude)package-lock.json',
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
for (const pattern of secretPatterns) {
  if (pattern.expression.test(historyPatch)) fail(`${pattern.label} pattern found in Git history`);
}

const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
for (const [name, entry] of Object.entries(lock.packages || {})) {
  if (!entry?.resolved) continue;
  let host;
  try { host = new URL(entry.resolved).host; } catch { fail(`invalid lockfile URL for ${name}`); continue; }
  if (host !== allowedRegistry) fail(`unapproved package registry ${host} for ${name || 'root package'}`);
}

if (failures.length) {
  console.error('Security check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Security check passed: ${listed.length} source files and Git history; official npm registry only.`);
}
