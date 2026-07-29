import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * SPA shell for AP Services.
 * Dev: proxies /api and /auth to production API so local work matches live backend.
 * Build output: dist/ — serve under /spa/ (see vercel rewrite / SPA_MIGRATION.md).
 */
export default defineConfig({
  plugins: [react()],
  base: '/spa/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://api.apservices.in',
        changeOrigin: true,
        secure: true,
      },
      '/auth': {
        target: 'https://api.apservices.in',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
