import { defineConfig } from 'vitest/config'

// Tests unitaires du code pur (composables sans Nuxt, utilitaires) : pas besoin de DOM.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
