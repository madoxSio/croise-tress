import { z } from 'zod'
import { directionSchema, positionSchema } from './common.js'

/**
 * Mode « grille pré-remplie » (façon mots mêlés). La grille de lettres est publique ; seul le
 * serveur sait où se trouve chaque réponse et valide les sélections. Mode d'entraînement : il ne
 * rapporte ni score officiel ni points, et ne compte pas pour la progression.
 */

/** Graine de disposition : le couple (puzzle, graine) redonne toujours la même grille. */
export const wordSearchSeedSchema = z.coerce.number().int().min(0).max(2_147_483_647)

export const wordSearchQuerySchema = z.strictObject({ seed: wordSearchSeedSchema.optional() })

export const wordSearchClueSchema = z.strictObject({
  direction: directionSchema,
  number: z.int().positive(),
  text: z.string(),
  length: z.int().min(2),
})
export type WordSearchClue = z.infer<typeof wordSearchClueSchema>

export const wordSearchDirectionsSchema = z.strictObject({
  diagonals: z.boolean(),
  reversed: z.boolean(),
})

export const wordSearchSchema = z.strictObject({
  puzzleId: z.uuid(),
  seed: z.int(),
  size: z.int().positive(),
  /** Une chaîne de `size` lettres par ligne. */
  rows: z.array(z.string()),
  /** Sens dans lesquels les mots peuvent être écrits (dépend de la difficulté). */
  directions: wordSearchDirectionsSchema,
  clues: z.array(wordSearchClueSchema),
})
export type WordSearchDto = z.infer<typeof wordSearchSchema>

const clueRefSchema = z.strictObject({ direction: directionSchema, number: z.int().positive() })
export type WordSearchClueRef = z.infer<typeof clueRefSchema>

export const wordSearchCheckBodySchema = z.strictObject({
  seed: wordSearchSeedSchema,
  from: positionSchema,
  to: positionSchema,
  /** Définitions déjà trouvées : départage deux réponses identiques (aucune valeur officielle). */
  found: z.array(clueRefSchema).max(200).default([]),
})
export type WordSearchCheckBody = z.input<typeof wordSearchCheckBodySchema>

export const wordSearchRevealBodySchema = z.strictObject({
  seed: wordSearchSeedSchema,
  direction: directionSchema,
  number: z.int().positive(),
})
export type WordSearchRevealBody = z.infer<typeof wordSearchRevealBodySchema>

/** Mot trouvé (ou révélé) : sa définition, sa réponse et son tracé dans la grille. */
export const wordSearchHitSchema = z.strictObject({
  direction: directionSchema,
  number: z.int().positive(),
  answer: z.string(),
  start: positionSchema,
  end: positionSchema,
})
export type WordSearchHit = z.infer<typeof wordSearchHitSchema>

export const wordSearchCheckResultSchema = z.strictObject({ hit: wordSearchHitSchema.nullable() })
export type WordSearchCheckResult = z.infer<typeof wordSearchCheckResultSchema>
