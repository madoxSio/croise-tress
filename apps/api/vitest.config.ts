import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Une seule base de test partagée : les fichiers s'exécutent l'un après l'autre.
    fileParallelism: false,
    testTimeout: 15_000,
  },
})
