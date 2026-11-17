import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    base: '/',
    server: {
      port: 5176,
      strictPort: true,
      /* Dev only: API calls go to the backend through this server, so the browser stays same-origin. */
      proxy: { '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:5001', changeOrigin: true } },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
    },
  };
});
