import type { Db } from '../../src/db.ts'

export interface SeedPath {
  readonly slug: string
  readonly title: string
  readonly description: string
  /** Slug du thème du catalogue. */
  readonly theme: string
  readonly sortOrder: number
  /** Étapes dans l'ordre : titre affiché et slug de la grille. */
  readonly steps: readonly { readonly title: string; readonly puzzle: string }[]
}

/** Parcours éditoriaux, par difficulté croissante (grilles du catalogue, cf. docs/CATALOGUE.md). */
export const SEED_PATHS: readonly SeedPath[] = [
  {
    slug: 'histoire-rois-empires-guerres',
    title: 'Rois, empires et guerres',
    description: 'Cinq grilles pour traverser mille ans d’histoire de France.',
    theme: 'histoire',
    sortOrder: 10,
    steps: [
      { title: 'Les rois célèbres', puzzle: 'rois-celebres' },
      { title: 'Les dates qui ont tout changé', puzzle: 'dates-qui-ont-tout-change' },
      { title: 'Les grandes batailles', puzzle: 'batailles-de-france' },
      { title: 'Dynasties et surnoms', puzzle: 'dynasties-et-surnoms' },
      { title: 'Mille ans d’histoire', puzzle: 'mille-ans-d-histoire' },
    ],
  },
]

/**
 * Crée les parcours absents, **sans jamais modifier** un parcours existant (même slug) : ses
 * étapes ont pu être jouées, les réordonner changerait les déblocages. Un parcours dont un
 * thème ou une grille manque est ignoré (et signalé) plutôt que créé incomplet.
 */
export async function syncPaths(db: Db, paths: readonly SeedPath[]): Promise<string[]> {
  const created: string[] = []
  for (const seed of paths) {
    if (await db.path.findUnique({ where: { slug: seed.slug }, select: { id: true } })) continue
    const theme = await db.theme.findUnique({ where: { slug: seed.theme }, select: { id: true } })
    const puzzles = await db.puzzle.findMany({
      where: { slug: { in: seed.steps.map((step) => step.puzzle) } },
      select: { id: true, slug: true },
    })
    const ids = new Map(puzzles.map((puzzle) => [puzzle.slug, puzzle.id]))
    const missing = seed.steps.filter((step) => !ids.has(step.puzzle)).map((step) => step.puzzle)
    if (!theme || missing.length > 0) {
      process.stderr.write(
        `Parcours « ${seed.slug} » ignoré : ${theme ? `grilles absentes (${missing.join(', ')})` : `thème « ${seed.theme} » absent`}.\n`,
      )
      continue
    }
    await db.path.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        description: seed.description,
        themeId: theme.id,
        sortOrder: seed.sortOrder,
        status: 'published',
        steps: {
          create: seed.steps.map((step, index) => ({
            position: index + 1,
            title: step.title,
            puzzleId: ids.get(step.puzzle) ?? '',
          })),
        },
      },
    })
    created.push(seed.slug)
  }
  return created
}
