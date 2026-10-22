import { parsePuzzle, type Puzzle } from '@crossverse/crossword-core'
import type { Difficulty, PuzzleSummary } from '@crossverse/contracts'
import { z } from 'zod'
import type { Db } from '../../db.ts'

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  theme: true,
  difficulty: true,
  width: true,
  height: true,
  estimatedMinutes: true,
} as const

/** Contenu JSON stocké en base, revalidé à la lecture (défense en profondeur). */
const storedContentSchema = z.object({
  grid: z.array(z.string()),
  clues: z.array(
    z.object({
      direction: z.enum(['across', 'down']),
      number: z.int().positive(),
      text: z.string(),
      explanation: z.string().optional(),
    }),
  ),
})

export interface LoadedPuzzle {
  readonly summary: PuzzleSummary
  readonly puzzle: Puzzle
}

export class PuzzleRepository {
  constructor(private readonly db: Db) {}

  async listPublished(filter: {
    difficulty?: Difficulty | undefined
    theme?: string | undefined
    limit: number
    cursor?: string | undefined
  }): Promise<{ items: PuzzleSummary[]; nextCursor: string | null }> {
    const rows = await this.db.puzzle.findMany({
      where: {
        status: 'published',
        ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
        ...(filter.theme ? { theme: filter.theme } : {}),
      },
      select: summarySelect,
      orderBy: { id: 'asc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > filter.limit
    const items = hasMore ? rows.slice(0, filter.limit) : rows
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null }
  }

  /** Charge un puzzle publié avec sa solution (usage serveur uniquement). */
  async findPublished(id: string): Promise<LoadedPuzzle | null> {
    const row = await this.db.puzzle.findFirst({
      where: { id, status: 'published' },
      select: { ...summarySelect, grid: true, clues: true },
    })
    if (!row) return null
    const { grid, clues, ...summary } = row
    const content = storedContentSchema.parse({ grid, clues })
    const parsed = parsePuzzle({
      id: row.id,
      title: row.title,
      grid: content.grid,
      clues: content.clues,
    })
    if (!parsed.ok)
      throw new Error(`Puzzle ${row.id} incohérent en base : ${parsed.errors[0]?.message ?? ''}`)
    return { summary, puzzle: parsed.value }
  }

  /**
   * Défi du jour : l'association date → puzzle est créée au premier appel de la journée,
   * de façon déterministe (jour depuis l'époque modulo le nombre de puzzles publiés, triés par slug),
   * puis figée par la clé primaire sur la date (une requête concurrente ne peut pas en créer un second).
   */
  async findOrAssignDaily(date: Date): Promise<PuzzleSummary | null> {
    const existing = await this.db.dailyChallenge.findUnique({
      where: { date },
      select: { puzzle: { select: summarySelect } },
    })
    if (existing) return existing.puzzle

    const candidates = await this.db.puzzle.findMany({
      where: { status: 'published' },
      orderBy: { slug: 'asc' },
      select: { id: true },
    })
    if (candidates.length === 0) return null
    const day = Math.floor(date.getTime() / 86_400_000)
    const chosen = candidates[day % candidates.length]
    if (!chosen) return null
    await this.db.dailyChallenge.createMany({
      data: [{ date, puzzleId: chosen.id }],
      skipDuplicates: true,
    })

    const assigned = await this.db.dailyChallenge.findUnique({
      where: { date },
      select: { puzzle: { select: summarySelect } },
    })
    return assigned?.puzzle ?? null
  }
}
