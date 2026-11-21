import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// Одно приложение, три входа: /, /finance/, /day/. У каждого свой манифест
// (иконка и название на экране «Домой»), код и данные общие.
export default defineConfig({
  base: '/life-tracker/',
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        life: resolve(import.meta.dirname, 'index.html'),
        finance: resolve(import.meta.dirname, 'finance/index.html'),
        day: resolve(import.meta.dirname, 'day/index.html'),
      },
    },
  },
  test: {
    environment: 'node',
  },
});
