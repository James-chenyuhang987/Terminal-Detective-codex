import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

function normalizeBasePath(value) {
  if (!value || !value.trim()) return null
  if (value.trim() === '/') return '/'
  return `/${value.trim().replace(/^\/+|\/+$/g, '')}/`
}

function resolveBasePath() {
  const configured = normalizeBasePath(process.env.VITE_BASE_PATH)
  if (configured) return configured

  if (process.env.GITHUB_ACTIONS === 'true') {
    const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').pop()
    if (repositoryName && !repositoryName.endsWith('.github.io')) {
      return `/${repositoryName}/`
    }
  }
  return '/'
}

function resolveBuildSha() {
  const configured = String(process.env.VITE_BUILD_SHA || '').trim()
  if (configured) return configured
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
    return `${sha}${dirty ? '-dirty' : ''}`
  } catch {
    return 'development'
  }
}

process.env.VITE_BUILD_SHA = resolveBuildSha()

// https://vite.dev/config/
export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
