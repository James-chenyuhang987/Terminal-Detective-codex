import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@/lib/ProfileContext.jsx', replacement: fileURLToPath(new URL('./presentation-profile-mock.jsx', import.meta.url)) },
      { find: '@/lib/AuthContext.jsx', replacement: fileURLToPath(new URL('./presentation-auth-mock.jsx', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
});
