import { z } from 'zod'

export const API_PREFIX = '/api/v1'

export const directionSchema = z.enum(['across', 'down'])
export const difficultySchema = z.enum(['discovery', 'easy', 'intermediate', 'hard', 'expert'])
export type Difficulty = z.infer<typeof difficultySchema>

export const uuidSchema = z.uuid()
export const positionSchema = z.strictObject({
  row: z.int().min(0).max(24),
  col: z.int().min(0).max(24),
})

/** Format d'erreur unique de l'API. `code` est stable, `message` est destiné à l'affichage. */
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
})
export type ApiError = z.infer<typeof apiErrorSchema>

export const ERROR_CODES = {
  validation: 'validation_error',
  notFound: 'not_found',
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  csrf: 'csrf_rejected',
  conflict: 'conflict',
  rateLimited: 'rate_limited',
  internal: 'internal_error',
  mailUnavailable: 'mail_unavailable',
  accountSuspended: 'account_suspended',
  /** Indices gratuits épuisés : le client doit confirmer la dépense de Coumba points. */
  hintLimitReached: 'hint_limit_reached',
  insufficientPoints: 'insufficient_points',
  /** Étape de parcours non débloquée (étape précédente non réussie, ou invité). */
  stepLocked: 'step_locked',
} as const

/** En-tête porteur du jeton anti-CSRF pour toute requête mutante. */
export const CSRF_HEADER = 'x-csrf-token'
