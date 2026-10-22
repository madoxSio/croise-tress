import { z } from 'zod'
import { puzzleSummarySchema } from './puzzles.js'

export const THEMES = [
  'minimal',
  'dark',
  'high-contrast',
  'paper',
  'manga',
  'cyberpunk',
  'zen',
  'retro',
] as const
export const themeSchema = z.enum(THEMES)
export type Theme = z.infer<typeof themeSchema>

/** Préférences d'interface : confort uniquement, sans effet sur les règles du jeu. */
export const preferencesSchema = z.strictObject({
  theme: themeSchema.default('minimal'),
  textScale: z.number().min(0.8).max(1.6).default(1),
  reducedMotion: z.boolean().default(false),
})
export type Preferences = z.infer<typeof preferencesSchema>

export const achievementSchema = z.strictObject({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  unlockedAt: z.iso.datetime().nullable(),
})
export const achievementListSchema = z.strictObject({ items: z.array(achievementSchema) })
export type Achievement = z.infer<typeof achievementSchema>

export const statsSchema = z.strictObject({
  completed: z.int(),
  withoutHelp: z.int(),
  dailyCompleted: z.int(),
  bestScore: z.int().nullable(),
  averageDurationMs: z.int().nullable(),
  byDifficulty: z.record(z.string(), z.int()),
})
export type Stats = z.infer<typeof statsSchema>

export const favoriteListSchema = z.strictObject({ items: z.array(puzzleSummarySchema) })
