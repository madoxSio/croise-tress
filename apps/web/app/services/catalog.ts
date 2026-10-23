import type { Difficulty, PuzzleSummary } from '@crossverse/contracts'
import { z } from 'zod'
import { api, ApiRequestError, query, request } from '~/services/api'

/**
 * Catalogue de thèmes et partie rapide.
 *
 * Les routes `GET /catalog` et `GET /quick-play` arrivent avec le chantier « Catalogue »
 * (contrats dans packages/contracts). En attendant, les schémas sont décrits ici et, si
 * l'API ne connaît pas encore ces routes (404), le catalogue est déduit de la liste des
 * grilles. TODO(catalogue) : remplacer ces schémas locaux par ceux de @crossverse/contracts
 * et retirer le repli dès que les routes sont en production.
 */
const countsSchema = z.object({
  discovery: z.int(),
  easy: z.int(),
  intermediate: z.int(),
  hard: z.int(),
  expert: z.int(),
})

const subThemeSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  accent: z.string(),
  accentAlt: z.string(),
  skin: z.string(),
  puzzleCount: z.int(),
  counts: countsSchema,
})

const themeSchema = subThemeSchema.extend({ children: z.array(subThemeSchema) })
const catalogSchema = z.object({ themes: z.array(themeSchema) })
const quickPlaySchema = z.object({ puzzle: z.object({ id: z.string() }).loose() })

export type CatalogSubTheme = z.infer<typeof subThemeSchema>
export type CatalogTheme = z.infer<typeof themeSchema>
export type DifficultyCounts = z.infer<typeof countsSchema>

/** Les trois niveaux affichés, regroupant les cinq niveaux du moteur. */
export const LEVELS = [
  { id: 'simple', label: 'Simple', difficulties: ['discovery', 'easy'] },
  { id: 'medium', label: 'Intermédiaire', difficulties: ['intermediate'] },
  { id: 'hard', label: 'Compliqué', difficulties: ['hard', 'expert'] },
] as const satisfies readonly {
  id: string
  label: string
  difficulties: readonly Difficulty[]
}[]

export type LevelId = (typeof LEVELS)[number]['id']

export function levelCount(counts: DifficultyCounts, level: LevelId): number {
  const found = LEVELS.find((item) => item.id === level)
  return found ? found.difficulties.reduce((sum, d) => sum + counts[d], 0) : 0
}

export function levelOf(difficulty: Difficulty): (typeof LEVELS)[number] {
  return (
    LEVELS.find((level) => (level.difficulties as readonly Difficulty[]).includes(difficulty)) ??
    LEVELS[0]
  )
}

const isMissingRoute = (error: unknown): boolean =>
  error instanceof ApiRequestError && error.status === 404

/** Repli : un thème par valeur de `theme` des grilles publiées (première page seulement). */
async function catalogFromPuzzles(): Promise<CatalogTheme[]> {
  const page = await api.listPuzzles({ limit: 50 })
  const byTheme = new Map<string, CatalogTheme>()
  for (const puzzle of page.items) {
    const theme =
      byTheme.get(puzzle.theme) ??
      ({
        // Sans catalogue, le filtre de l'API porte sur le nom du thème : il sert de slug.
        slug: puzzle.theme,
        name: puzzle.theme.charAt(0).toUpperCase() + puzzle.theme.slice(1),
        description: '',
        icon: '🧩',
        accent: '#5634f0',
        accentAlt: '#ff5c39',
        skin: 'default',
        puzzleCount: 0,
        counts: { discovery: 0, easy: 0, intermediate: 0, hard: 0, expert: 0 },
        children: [],
      } satisfies CatalogTheme)
    theme.puzzleCount += 1
    theme.counts[puzzle.difficulty] += 1
    byTheme.set(puzzle.theme, theme)
  }
  return [...byTheme.values()]
}

export async function getCatalog(): Promise<CatalogTheme[]> {
  try {
    return (await request('GET', '/catalog', catalogSchema)).themes
  } catch (error) {
    if (isMissingRoute(error)) return catalogFromPuzzles()
    throw error
  }
}

/** Grille à jouer tout de suite (simple de préférence), éventuellement dans un thème. */
export async function quickPlayPuzzleId(theme?: string): Promise<string | null> {
  try {
    return (await request('GET', `/quick-play${query({ theme })}`, quickPlaySchema)).puzzle.id
  } catch (error) {
    if (!isMissingRoute(error)) throw error
  }
  const pick = (items: readonly PuzzleSummary[]): string | null =>
    items[Math.floor(Math.random() * items.length)]?.id ?? null
  const easy = await api.listPuzzles({ difficulty: 'easy', limit: 20 })
  if (easy.items.length > 0) return pick(easy.items)
  return pick((await api.listPuzzles({ limit: 20 })).items)
}
