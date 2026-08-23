import react from '@vitejs/plugin-react'
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
