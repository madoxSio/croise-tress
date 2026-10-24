import { loadConfig } from '../src/config.ts'
import { createDb } from '../src/db.ts'
import { CATALOG_PUZZLES } from './seed/catalog-puzzles.ts'
import { SEED_PUZZLES } from './seed/puzzles.ts'
import { syncCatalog } from './seed/sync.ts'
import { SEED_THEMES } from './seed/themes.ts'

/**
 * Charge le catalogue éditorial (thèmes et grilles). Idempotent et sans écrasement : exécuté
 * par `make seed` en développement et à chaque démarrage de l'image de production.
 */
const rootEnv = new URL('../../../.env', import.meta.url)
try {
  process.loadEnvFile(rootEnv)
} catch {
  // Pas de .env (Docker, CI) : les variables viennent de l'environnement.
}

const config = loadConfig()
const db = createDb(config.databaseUrl)
try {
  const report = await syncCatalog(db, SEED_THEMES, [...SEED_PUZZLES, ...CATALOG_PUZZLES])
  process.stdout.write(
    `Catalogue : ${report.themesCreated} thème(s) et ${report.puzzlesCreated} grille(s) ajoutés, ` +
      `${report.puzzlesReclassified} grille(s) reclassée(s).\n`,
  )
} finally {
  await db.$disconnect()
}
