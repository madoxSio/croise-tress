import type { Difficulty, WordListDto, WordListSummary } from '@crossverse/contracts'
import { z } from 'zod'
import type { Db } from '../../db.ts'
import type { Prisma } from '../../generated/prisma/client.ts'
import { DEFAULT_SKIN } from '../puzzles/repository.ts'
import { directionsFor } from '../wordsearch/service.ts'

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  difficulty: true,
  estimatedMinutes: true,
  rows: true,
  words: true,
  theme: {
    select: { slug: true, name: true, skin: true, parent: { select: { slug: true, skin: true } } },
  },
} as const satisfies Prisma.WordListSelect

type SummaryRow = Prisma.WordListGetPayload<{ select: typeof summarySelect }>

/** Contenu JSON stocké en base, revalidé à la lecture (défense en profondeur). */
const storedSchema = z.object({
  rows: z.array(z.string().regex(/^[A-Z]+$/)).min(2),
  words: z.array(z.string().regex(/^[A-Z]{2,}$/)).min(1),
})

function parseStored(row: Pick<SummaryRow, 'id' | 'rows' | 'words'>) {
  const parsed = storedSchema.safeParse({ rows: row.rows, words: row.words })
  if (!parsed.success) throw new Error(`Mots mêlés ${row.id} incohérents en base.`)
  return parsed.data
}

function toSummary(row: SummaryRow): WordListSummary {
  const { theme } = row
  const { rows, words } = parseStored(row)
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    difficulty: row.difficulty,
    estimatedMinutes: row.estimatedMinutes,
    theme: theme.name,
    themeSlug: theme.slug,
    parentThemeSlug: theme.parent?.slug ?? null,
    skin: theme.skin ?? theme.parent?.skin ?? DEFAULT_SKIN,
    size: rows.length,
    wordCount: words.length,
  }
}

function publishedInTheme(slug: string | undefined): Prisma.WordListWhereInput {
  if (!slug) return { status: 'published' }
  return { status: 'published', theme: { OR: [{ slug }, { parent: { slug } }] } }
}

export class WordListRepository {
  constructor(private readonly db: Db) {}

  async listPublished(filter: {
    difficulty?: Difficulty | undefined
    theme?: string | undefined
    limit: number
    cursor?: string | undefined
  }): Promise<{ items: WordListSummary[]; nextCursor: string | null }> {
    const rows = await this.db.wordList.findMany({
      where: {
        ...publishedInTheme(filter.theme),
        ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
      },
      select: summarySelect,
      orderBy: { id: 'asc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > filter.limit
    const items = hasMore ? rows.slice(0, filter.limit) : rows
    return {
      items: items.map(toSummary),
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    }
  }

  /** Grille publiée, sans le mot mystère (il se découvre en rayant tous les mots). */
  async findPublished(id: string): Promise<WordListDto | null> {
    const row = await this.db.wordList.findFirst({
      where: { id, status: 'published' },
      select: { ...summarySelect, mystery: true, mysteryClue: true },
    })
    if (!row) return null
    const { mystery, mysteryClue, ...summaryRow } = row
    const { rows, words } = parseStored(row)
    return {
      ...toSummary(summaryRow),
      rows,
      words: [...words].sort((a, b) => a.localeCompare(b, 'fr')),
      directions: directionsFor(row.difficulty),
      mysteryLength: mystery.length,
      mysteryClue,
    }
  }
}
