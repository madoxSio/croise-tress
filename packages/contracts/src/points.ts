import { z } from 'zod'
import { uuidSchema } from './common.js'

/**
 * Règles publiques des Coumba points, renvoyées par l'API (qui seule les applique) :
 * les clients s'en servent pour afficher les coûts, jamais pour décider.
 */
export const pointRulesSchema = z.strictObject({
  freeHintsPerGame: z.int().min(0),
  hintCost: z.strictObject({ letter: z.int().positive(), word: z.int().positive() }),
})
export type PointRules = z.infer<typeof pointRulesSchema>

/** `GET /me/wallet`. `eligible` est faux pour un invité : il ne gagne ni ne dépense de points. */
export const walletSchema = z.strictObject({
  eligible: z.boolean(),
  balance: z.int().min(0),
  earned: z.int().min(0),
  spent: z.int().min(0),
  rules: pointRulesSchema,
})
export type WalletDto = z.infer<typeof walletSchema>

export const pointReasonSchema = z.enum([
  'welcome',
  'puzzle_completed',
  'no_hint_bonus',
  'path_step',
  'path_completed',
  'daily_challenge',
  'match_result',
  'hint_purchase',
])
export type PointReason = z.infer<typeof pointReasonSchema>

export const pointTransactionSchema = z.strictObject({
  id: uuidSchema,
  amount: z.int(),
  balanceAfter: z.int().min(0),
  reason: pointReasonSchema,
  createdAt: z.iso.datetime(),
})

/** `GET /me/wallet/transactions` : journal paginé, du plus récent au plus ancien. */
export const pointTransactionPageSchema = z.strictObject({
  items: z.array(pointTransactionSchema),
  nextCursor: uuidSchema.nullable(),
})
export type PointTransactionPage = z.infer<typeof pointTransactionPageSchema>
