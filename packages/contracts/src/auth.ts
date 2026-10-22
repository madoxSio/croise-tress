import { z } from 'zod'
import { uuidSchema } from './common.js'

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export const emailSchema = z.email().max(254)
export const usernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9_-]+$/, 'Lettres non accentuées, chiffres, _ ou - uniquement.')
export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX)
/** Jeton reçu par e-mail : 32 octets en base64url. */
export const emailTokenSchema = z.string().regex(/^[\w-]{43}$/)

/** Inscription : le compte invité courant devient un compte complet à la confirmation de l'e-mail. */
export const registerBodySchema = z.strictObject({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
})

export const verifyEmailBodySchema = z.strictObject({ token: emailTokenSchema })

export const loginBodySchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
})

export const forgotPasswordBodySchema = z.strictObject({ email: emailSchema })

export const resetPasswordBodySchema = z.strictObject({
  token: emailTokenSchema,
  password: passwordSchema,
})

export const changePasswordBodySchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: passwordSchema,
})

export const changeEmailBodySchema = z.strictObject({
  password: z.string().min(1).max(PASSWORD_MAX),
  newEmail: emailSchema,
})

export const deleteAccountBodySchema = z.strictObject({
  password: z.string().min(1).max(PASSWORD_MAX),
})

/** Réponse volontairement identique, que l'e-mail soit connu ou non (anti-énumération). */
export const acceptedResponseSchema = z.strictObject({ status: z.literal('accepted') })

export const sessionInfoSchema = z.strictObject({
  id: uuidSchema,
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
})
export const sessionListSchema = z.strictObject({ items: z.array(sessionInfoSchema) })
export type SessionInfo = z.infer<typeof sessionInfoSchema>
