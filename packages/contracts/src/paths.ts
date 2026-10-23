import { z } from 'zod'
import { difficultySchema, uuidSchema } from './common.js'

/**
 * État d'une étape pour le joueur courant. `locked` : l'étape précédente n'est pas réussie,
 * ou le joueur est invité (seule la première étape lui est ouverte).
 */
export const pathStepStateSchema = z.enum(['completed', 'available', 'locked'])
export type PathStepState = z.infer<typeof pathStepStateSchema>

export const pathSummarySchema = z.strictObject({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  /** Slug du thème ou sous-thème du catalogue. */
  theme: z.string(),
  stepCount: z.int().min(0),
  completedCount: z.int().min(0),
})
export type PathSummary = z.infer<typeof pathSummarySchema>

export const pathListSchema = z.strictObject({ items: z.array(pathSummarySchema) })
export type PathList = z.infer<typeof pathListSchema>

export const pathStepSchema = z.strictObject({
  position: z.int().positive(),
  title: z.string(),
  state: pathStepStateSchema,
  puzzle: z.strictObject({
    id: uuidSchema,
    title: z.string(),
    difficulty: difficultySchema,
    estimatedMinutes: z.int(),
  }),
})
export type PathStep = z.infer<typeof pathStepSchema>

export const pathDetailSchema = pathSummarySchema.extend({ steps: z.array(pathStepSchema) })
export type PathDetail = z.infer<typeof pathDetailSchema>

export const pathSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80)
