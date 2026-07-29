import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const mpaRoot = path.resolve(__dirname, '..');

/** Serve sibling MPA files (HTML/JS/CSS) during SPA local dev for legacy bridges. */
function serveMpaSibling(): Plugin {
  return {
    name: 'serve-mpa-sibling',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || '';
        const urlPath = raw.split('?')[0] || '';
        if (
          urlPath.startsWith('/spa') ||
          urlPath.startsWith('/@') ||
          urlPath.startsWith('/src') ||
          urlPath.startsWith('/node_modules') ||
          urlPath.startsWith('/api') ||
          urlPath.startsWith('/auth')
        ) {
          return next();
        }
        const filePath = path.join(mpaRoot, decodeURIComponent(urlPath));
        if (!filePath.startsWith(mpaRoot)) return next();
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
        const ext = path.extname(filePath).toLowerCase();
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
        };
        if (!types[ext]) return next();
        res.setHeader('Content-Type', types[ext]);
        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

/**
 * SPA shell for AP Services.
 * Dev: proxies /api and /auth to production API; serves MPA siblings for embeds.
 * Build output: dist/ — serve under /spa/ (see vercel rewrite / SPA_MIGRATION.md).
 */
export default defineConfig({
  plugins: [react(), serveMpaSibling()],
  base: '/spa/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [mpaRoot, path.resolve(__dirname)] },
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
