import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Hors Docker, charge le .env racine. Les variables déjà définies (Docker, CI) restent prioritaires.
const rootEnv = new URL('../../.env', import.meta.url)
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
})
