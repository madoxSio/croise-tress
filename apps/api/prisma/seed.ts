import { parsePuzzle } from '@crossverse/crossword-core'
import { loadConfig } from '../src/config.ts'
import { createDb } from '../src/db.ts'
import { SEED_PUZZLES } from './seed/puzzles.ts'

/** Seed idempotent : insère ou met à jour les puzzles de démonstration par `slug`. */
const rootEnv = new URL('../../../.env', import.meta.url)
try {
  process.loadEnvFile(rootEnv)
} catch {
  // Pas de .env (Docker, CI) : les variables viennent de l'environnement.
}

const config = loadConfig()
const db = createDb(config.databaseUrl)

for (const seed of SEED_PUZZLES) {
  const checked = parsePuzzle({
    id: seed.slug,
    title: seed.title,
    grid: seed.grid,
    clues: seed.clues,
  })
  if (!checked.ok)
    throw new Error(
      `Puzzle « ${seed.slug} » invalide : ${checked.errors.map((e) => e.message).join(' ')}`,
    )
  const data = {
    title: seed.title,
    theme: seed.theme,
    difficulty: seed.difficulty,
    status: 'published' as const,
    width: checked.value.width,
    height: checked.value.height,
    grid: [...seed.grid],
    clues: seed.clues.map((clue) => ({ ...clue })),
    estimatedMinutes: seed.estimatedMinutes,
  }
  await db.puzzle.upsert({
    where: { slug: seed.slug },
    create: { slug: seed.slug, ...data },
    update: data,
  })
}

process.stdout.write(`${SEED_PUZZLES.length} puzzles de démonstration chargés.\n`)
await db.$disconnect()
