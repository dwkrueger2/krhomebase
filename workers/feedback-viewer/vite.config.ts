// file: workers/feedback-viewer/vite.config.ts
// Builds the tool page into dist/ (index.html, one script and one stylesheet under assets/, and public/_headers).
// No module-preload helper is added inline, so the Content-Security-Policy can refuse every inline script.
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0])
