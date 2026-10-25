import { z } from 'zod'
import { difficultySchema, directionSchema, puzzleFormatSchema, uuidSchema } from './common.js'

export const publicCellSchema = z.union([
  z.strictObject({ block: z.literal(true) }),
  z.strictObject({ block: z.literal(false), number: z.int().positive().optional() }),
])

export const publicClueSchema = z.strictObject({
  direction: directionSchema,
  number: z.int().positive(),
  text: z.string(),
  row: z.int().min(0),
  col: z.int().min(0),
  length: z.int().min(2),
})
export type PublicClueDto = z.infer<typeof publicClueSchema>

export const puzzleSummarySchema = z.strictObject({
  id: uuidSchema,
  slug: z.string(),
  title: z.string(),
  /** Nom affichable du (sous-)thème de la grille. */
  theme: z.string(),
  themeSlug: z.string(),
  /** Thème parent quand la grille est rangée dans un sous-thème. */
  parentThemeSlug: z.string().nullable(),
  /** Clé d'habillage résolue (voir `catalog.ts`). */
  skin: z.string(),
  difficulty: difficultySchema,
  format: puzzleFormatSchema,
  width: z.int(),
  height: z.int(),
  estimatedMinutes: z.int(),
})
export type PuzzleSummary = z.infer<typeof puzzleSummarySchema>

/** Puzzle jouable : structure et définitions, jamais la solution. */
export const publicPuzzleSchema = puzzleSummarySchema.extend({
  cells: z.array(z.array(publicCellSchema)),
  clues: z.array(publicClueSchema),
})
export type PublicPuzzleDto = z.infer<typeof publicPuzzleSchema>

export const listPuzzlesQuerySchema = z.strictObject({
  difficulty: difficultySchema.optional(),
  /** Slug d'un thème (sous-thèmes inclus) ou d'un sous-thème ; inconnu = liste vide. */
  theme: z.string().max(60).optional(),
  format: puzzleFormatSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Pagination par curseur : `id` du dernier élément de la page précédente. */
  cursor: uuidSchema.optional(),
})
export type ListPuzzlesQuery = z.input<typeof listPuzzlesQuerySchema>

export const puzzleListSchema = z.strictObject({
  items: z.array(puzzleSummarySchema),
  nextCursor: uuidSchema.nullable(),
})
export type PuzzleList = z.infer<typeof puzzleListSchema>

export const dailyChallengeSchema = z.strictObject({
  /** Date du défi au format AAAA-MM-JJ, en UTC. */
  date: z.iso.date(),
  puzzle: puzzleSummarySchema,
})
export type DailyChallenge = z.infer<typeof dailyChallengeSchema>
