import { z } from 'zod'
import { directionSchema, positionSchema, uuidSchema } from './common.js'

/** Saisie du joueur : une lettre A–Z ou null par case (null pour les cases noires). */
export const playerGridSchema = z.array(z.array(z.string().max(4).nullable()).max(25)).max(25)

export const hintUsageSchema = z.strictObject({
  cellChecks: z.int().min(0),
  wordChecks: z.int().min(0),
  lettersRevealed: z.int().min(0),
  wordsRevealed: z.int().min(0),
  solutionRevealed: z.boolean(),
})
export type HintUsage = z.infer<typeof hintUsageSchema>

export const playStatusSchema = z.enum(['in_progress', 'completed'])

export const playSessionSchema = z.strictObject({
  id: uuidSchema,
  puzzleId: uuidSchema,
  status: playStatusSchema,
  grid: z.array(z.array(z.string().nullable())),
  /** Incrémentée à chaque écriture : une sauvegarde avec une révision périmée est refusée (409). */
  revision: z.int().min(0),
  hints: hintUsageSchema,
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  durationMs: z.int().nullable(),
  score: z.int().nullable(),
})
export type PlaySessionDto = z.infer<typeof playSessionSchema>

export const startPlayBodySchema = z.strictObject({ puzzleId: uuidSchema })

export const saveGridBodySchema = z.strictObject({
  grid: playerGridSchema,
  revision: z.int().min(0),
})

export const wordRefSchema = z.strictObject({
  direction: directionSchema,
  number: z.int().positive(),
})

export const checkBodySchema = z.discriminatedUnion('scope', [
  z.strictObject({
    scope: z.literal('cell'),
    grid: playerGridSchema,
    revision: z.int().min(0),
    cell: positionSchema,
  }),
  z.strictObject({
    scope: z.literal('word'),
    grid: playerGridSchema,
    revision: z.int().min(0),
    word: wordRefSchema,
  }),
  z.strictObject({ scope: z.literal('grid'), grid: playerGridSchema, revision: z.int().min(0) }),
])
export type CheckBody = z.infer<typeof checkBodySchema>

export const checkedCellSchema = z.strictObject({
  row: z.int(),
  col: z.int(),
  result: z.enum(['correct', 'incorrect', 'empty']),
})

export const checkResponseSchema = z.strictObject({
  cells: z.array(checkedCellSchema),
  session: playSessionSchema,
})

export const hintBodySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('letter'), cell: positionSchema }),
  z.strictObject({ type: z.literal('word'), word: wordRefSchema }),
  z.strictObject({ type: z.literal('explain'), word: wordRefSchema }),
  /** Révélation complète : `confirm` doit valoir true (confirmation explicite côté UI). */
  z.strictObject({ type: z.literal('solution'), confirm: z.literal(true) }),
])
export type HintBody = z.infer<typeof hintBodySchema>

export const hintResponseSchema = z.strictObject({
  revealed: z.array(z.strictObject({ row: z.int(), col: z.int(), letter: z.string() })),
  explanation: z.string().nullable(),
  session: playSessionSchema,
})
export type HintResponse = z.infer<typeof hintResponseSchema>

export const historyItemSchema = z.strictObject({
  sessionId: uuidSchema,
  puzzleId: uuidSchema,
  puzzleTitle: z.string(),
  completedAt: z.iso.datetime(),
  durationMs: z.int(),
  score: z.int(),
})
export const historyResponseSchema = z.strictObject({
  items: z.array(historyItemSchema),
  nextCursor: uuidSchema.nullable(),
})
export type HistoryResponse = z.infer<typeof historyResponseSchema>

/** `GET /me/resume` : dernière partie en cours, pour le bouton « Reprendre ». */
export const resumeResponseSchema = z.strictObject({
  session: playSessionSchema.nullable(),
  puzzle: z
    .strictObject({ id: uuidSchema, title: z.string(), difficulty: z.string(), theme: z.string() })
    .nullable(),
})
export type ResumeResponse = z.infer<typeof resumeResponseSchema>
