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
  /**
   * Jeton de session brut, renvoyé uniquement à un client natif quand une session s'ouvre
   * (invité, connexion, confirmation d'e-mail). Un navigateur ne le reçoit jamais : il a le cookie.
   */
  sessionToken: z.string().optional(),
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>

/**
 * Les clients natifs (app mobile) n'ont ni cookie de navigateur ni en-tête `Origin` : ils
 * s'annoncent par cet en-tête et s'authentifient par `Authorization: Bearer <jeton>`.
 */
export const NATIVE_CLIENT_HEADER = 'x-crossverse-client'
export const NATIVE_CLIENT_VALUE = 'native'
