import { z } from 'zod'
import { uuidSchema } from './common.js'

export const currentUserSchema = z.strictObject({
  id: uuidSchema,
  username: z.string().nullable(),
  isGuest: z.boolean(),
  emailVerified: z.boolean(),
  /** Adresse du compte, visible uniquement par son titulaire ; null pour un invité. */
  email: z.string().nullable(),
})
export type CurrentUser = z.infer<typeof currentUserSchema>

/**
 * `GET /session` : utilisateur courant (null sans session) et jeton CSRF à renvoyer
 * dans l'en-tête `x-csrf-token` de toute requête mutante.
 */
export const sessionResponseSchema = z.strictObject({
  user: currentUserSchema.nullable(),
  csrfToken: z.string().nullable(),
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>
