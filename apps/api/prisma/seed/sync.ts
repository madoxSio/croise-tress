import { parsePuzzle } from '@crossverse/crossword-core'
import type { Db } from '../../src/db.ts'
import type { SeedPuzzle } from './puzzles.ts'
import type { SeedTheme } from './themes.ts'

/** Préfixe des sous-thèmes créés par la migration pour les anciens libellés libres. */
const LEGACY_PREFIX = 'divers-'

export interface SyncReport {
  readonly themesCreated: number
  readonly puzzlesCreated: number
  readonly puzzlesReclassified: number
}

/**
 * Charge le catalogue éditorial **sans jamais écraser** : un thème ou une grille déjà présents
 * (même slug) restent tels quels, car l'administration a pu les modifier et une grille jouée
 * ne doit plus changer. Seule exception : une grille encore rangée dans un sous-thème
 * « Divers » issu de la migration rejoint le thème prévu ici. Idempotent, exécuté à chaque
 * démarrage de l'API en production.
 */
export async function syncCatalog(
  db: Db,
  themes: readonly SeedTheme[],
  puzzles: readonly SeedPuzzle[],
): Promise<SyncReport> {
  const checked = puzzles.map((seed) => {
    const result = parsePuzzle({
      id: seed.slug,
      title: seed.title,
      grid: seed.grid,
      clues: seed.clues,
    })
    if (!result.ok) {
      const details = result.errors.map((error) => error.message).join(' ')
      throw new Error(`Grille « ${seed.slug} » invalide : ${details}`)
    }
    return { seed, width: result.value.width, height: result.value.height }
  })

  let themesCreated = 0
  // Parents d'abord : un sous-thème référence l'identifiant de son parent.
  for (const theme of [...themes].sort(
    (a, b) => Number(a.parent !== undefined) - Number(b.parent !== undefined),
  )) {
    const parentId = theme.parent === undefined ? null : await themeId(db, theme.parent)
    const created = await db.theme.createMany({
      data: [
        {
          slug: theme.slug,
          name: theme.name,
          description: theme.description,
          parentId,
          skin: theme.skin ?? null,
          icon: theme.icon ?? null,
          accent: theme.accent ?? null,
          accentAlt: theme.accentAlt ?? null,
          sortOrder: theme.sortOrder,
        },
      ],
      skipDuplicates: true,
    })
    themesCreated += created.count
  }

  const themeIds = new Map(
    (await db.theme.findMany({ select: { id: true, slug: true } })).map((t) => [t.slug, t.id]),
  )
  const existing = new Map(
    (
      await db.puzzle.findMany({
        where: { slug: { in: puzzles.map((p) => p.slug) } },
        select: { id: true, slug: true, theme: { select: { slug: true } } },
      })
    ).map((p) => [p.slug, p]),
  )

  let puzzlesCreated = 0
  let puzzlesReclassified = 0
  for (const { seed, width, height } of checked) {
    const target = themeIds.get(seed.theme)
    if (!target) throw new Error(`Grille « ${seed.slug} » : thème « ${seed.theme} » inconnu.`)
    const current = existing.get(seed.slug)
    if (current) {
      if (current.theme.slug.startsWith(LEGACY_PREFIX)) {
        await db.puzzle.update({ where: { id: current.id }, data: { themeId: target } })
        puzzlesReclassified++
      }
      continue
    }
    const created = await db.puzzle.createMany({
      data: [
        {
          slug: seed.slug,
          title: seed.title,
          themeId: target,
          difficulty: seed.difficulty,
          status: 'published',
          width,
          height,
          grid: [...seed.grid],
          clues: seed.clues.map((clue) => ({ ...clue })),
          estimatedMinutes: seed.estimatedMinutes,
        },
      ],
      skipDuplicates: true,
    })
    puzzlesCreated += created.count
  }
  return { themesCreated, puzzlesCreated, puzzlesReclassified }
}

async function themeId(db: Db, slug: string): Promise<string> {
  const theme = await db.theme.findUnique({ where: { slug }, select: { id: true } })
  if (!theme) throw new Error(`Thème parent « ${slug} » introuvable.`)
  return theme.id
}
