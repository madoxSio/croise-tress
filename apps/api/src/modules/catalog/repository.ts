import type {
  Catalog,
  CatalogSubTheme,
  CatalogTheme,
  Difficulty,
  DifficultyCounts,
  PuzzleFormat,
  PuzzleSummary,
} from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import {
  DEFAULT_SKIN,
  publishedInTheme,
  puzzleSummarySelect,
  toPuzzleSummary,
} from '../puzzles/repository.ts'

/** Plafond de sécurité : le catalogue est éditorial (quelques dizaines de thèmes). */
const MAX_THEMES = 500
const DEFAULT_STYLE = { icon: '🧩', accent: '#6366F1', accentAlt: '#A855F7' } as const
/** Niveaux proposés par la partie rapide : une première grille doit rester accessible. */
const QUICK_PLAY_LEVELS: Difficulty[] = ['discovery', 'easy']

interface ThemeRow {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly parentId: string | null
  readonly skin: string | null
  readonly icon: string | null
  readonly accent: string | null
  readonly accentAlt: string | null
}

const emptyCounts = (): DifficultyCounts => ({
  discovery: 0,
  easy: 0,
  intermediate: 0,
  hard: 0,
  expert: 0,
})

function addCounts(target: DifficultyCounts, source: DifficultyCounts): void {
  for (const level of Object.keys(target) as Difficulty[]) target[level] += source[level]
}

const total = (counts: DifficultyCounts): number =>
  Object.values(counts).reduce((sum, value) => sum + value, 0)

export class CatalogRepository {
  constructor(private readonly db: Db) {}

  /**
   * Arbre des thèmes avec le nombre de grilles publiées par niveau. Deux requêtes, quel que
   * soit le nombre de thèmes ; les thèmes sans grille publiée sont omis.
   */
  async catalog(): Promise<Catalog> {
    const [themes, groups] = await Promise.all([
      this.db.theme.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: MAX_THEMES,
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          parentId: true,
          skin: true,
          icon: true,
          accent: true,
          accentAlt: true,
        },
      }),
      this.db.puzzle.groupBy({
        by: ['themeId', 'difficulty'],
        where: { status: 'published' },
        _count: { _all: true },
      }),
    ])

    const own = new Map<string, DifficultyCounts>()
    for (const group of groups) {
      const counts = own.get(group.themeId) ?? emptyCounts()
      counts[group.difficulty] += group._count._all
      own.set(group.themeId, counts)
    }

    const roots = themes.filter((theme) => theme.parentId === null)
    return {
      themes: roots.flatMap((root) => {
        const children = themes
          .filter((child) => child.parentId === root.id)
          .map((child) => toNode(child, own.get(child.id) ?? emptyCounts(), root))
          .filter((child) => child.puzzleCount > 0)
        const counts = emptyCounts()
        addCounts(counts, own.get(root.id) ?? emptyCounts())
        for (const child of children) addCounts(counts, child.counts)
        const node: CatalogTheme = { ...toNode(root, counts, null), children }
        return node.puzzleCount > 0 ? [node] : []
      }),
    }
  }

  /**
   * Grille de partie rapide : tirée au hasard parmi les grilles simples publiées (du thème
   * demandé s'il y en a un, et du format demandé), sinon parmi toutes celles du thème.
   * `null` si rien ne convient.
   */
  async quickPlay(
    themeSlug: string | undefined,
    format?: PuzzleFormat,
    random = Math.random,
  ): Promise<PuzzleSummary | null> {
    const scope = { ...publishedInTheme(themeSlug), ...(format ? { format } : {}) }
    const easy = { ...scope, difficulty: { in: QUICK_PLAY_LEVELS } }
    return (await this.pick(easy, random)) ?? (await this.pick(scope, random))
  }

  private async pick(
    where: ReturnType<typeof publishedInTheme>,
    random: () => number,
  ): Promise<PuzzleSummary | null> {
    const count = await this.db.puzzle.count({ where })
    if (count === 0) return null
    const [row] = await this.db.puzzle.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: Math.floor(random() * count),
      take: 1,
      select: puzzleSummarySelect,
    })
    return row ? toPuzzleSummary(row) : null
  }
}

function toNode(
  theme: ThemeRow,
  counts: DifficultyCounts,
  parent: ThemeRow | null,
): CatalogSubTheme {
  return {
    slug: theme.slug,
    name: theme.name,
    description: theme.description,
    skin: theme.skin ?? parent?.skin ?? DEFAULT_SKIN,
    icon: theme.icon ?? parent?.icon ?? DEFAULT_STYLE.icon,
    accent: theme.accent ?? parent?.accent ?? DEFAULT_STYLE.accent,
    accentAlt: theme.accentAlt ?? parent?.accentAlt ?? DEFAULT_STYLE.accentAlt,
    puzzleCount: total(counts),
    counts,
  }
}
