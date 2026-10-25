/**
 * Parcours E2E Crossverse. La suite ne démarre aucun serveur : elle attend l'API et le web déjà
 * lancés (`make start`, ou `pnpm --filter @crossverse/api start` + `pnpm --filter @crossverse/web dev`)
 * et une API Mailpit pour lire les e-mails (voir README.md).
 *
 * Dépendance : @playwright/test (Apache-2.0, maintenu par Microsoft) épinglé en 1.56.1, dont
 * le Chromium (révision 1194) est celui déjà installé dans l'environnement de travail.
 */
import { defineConfig, devices } from '@playwright/test'
import { BASE_URL } from './support/env.ts'

// Facultatif : E2E_START_SERVERS=1 lance l'API et le web locaux (sans Docker) s'ils ne
// tournent pas déjà. Par défaut, la suite suppose la stack démarrée (make start).
const webServer =
  process.env['E2E_START_SERVERS'] === '1'
    ? [
        {
          command: 'pnpm --filter @crossverse/api start',
          url: 'http://127.0.0.1:3001/api/v1/health',
          // Toute la suite passe par une seule IP et dépasse la limite globale de 300 requêtes
          // par minute : relevée ici seulement (les limites par route restent celles de la prod).
          env: { RATE_LIMIT_MAX: process.env['RATE_LIMIT_MAX'] ?? '1000' },
          cwd: '../..',
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: 'pnpm --filter @crossverse/web dev',
          url: BASE_URL,
          cwd: '../..',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ]
    : []

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  // Les parcours partagent une API dont les limites de débit sont par IP : peu de parallélisme.
  workers: 2,
  fullyParallel: false,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer,
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // Le duel joue déjà un joueur mobile et un joueur bureau : une seule exécution suffit
      // (et ménage la limite de 5 inscriptions par heure et par IP).
      testIgnore: /duel\.spec\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
})
