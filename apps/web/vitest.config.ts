import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Test settings for apps/web. This file is separate from vite.config.ts on purpose: the app's Vite
 * config loads vinext and the Cloudflare plugin, which tests do not need.
 */
export default defineConfig({
  // Same `@/` alias as tsconfig.json, so tests import files the way the app does.
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  // tsconfig keeps JSX as written ("preserve") for the app build; tests need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    // CSS modules are processed so components receive real class names in tests.
    css: { include: [/\.module\.css$/] },
    include: ['lib/**/*.test.ts', 'components/**/*.test.{ts,tsx}', 'features/**/*.test.{ts,tsx}'],
  },
})
