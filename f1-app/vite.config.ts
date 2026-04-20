import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [{
    name: 'spa-fallback',
    enforce: 'pre',
    configureServer(server) {
      // SPA fallback for dev — rewrite client-side route paths to "/" so Vite
      // serves index.html. The browser URL stays unchanged, and react-router
      // reads the actual path from window.location to render the right route.
      // In production, wrangler.jsonc not_found_handling: "single-page-application" handles this.
      server.middlewares.use((req, _res, next) => {
        const url = req.url || '';
        const isApi = url.startsWith('/api/');
        const isViteInternal = url.startsWith('/@') || url.startsWith('/__') || url.startsWith('/node_modules');
        const isFile = url.includes('.');
        if (!isApi && !isViteInternal && !isFile && url !== '/') {
          req.url = '/';
        }
        next();
      });
    },
  }, react(), cloudflare()],
})
