import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests unitaires du code pur (état de jeu, client HTTP) : ni React Native ni DOM.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
