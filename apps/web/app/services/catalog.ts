import {
  catalogSchema,
  type CatalogTheme,
  quickPlaySchema,
  type Difficulty,
  type DifficultyCounts,
  type PuzzleFormat,
} from '@crossverse/contracts'
import { ApiRequestError, query, request } from '~/services/api'

export type { CatalogSubTheme, CatalogTheme, DifficultyCounts } from '@crossverse/contracts'

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

/** Types de grille proposés au catalogue (voir `PuzzleFormat` dans les contrats). */
export const FORMATS = [
  {
    id: 'classic',
    label: 'Mots croisés',
    hint: 'Grille pleine à cases noires, définitions par ligne (I, II…) et par colonne (1, 2…).',
  },
  {
    id: 'freeform',
    label: 'Grilles en croix',
    hint: 'Mots qui se croisent librement, chaque mot numéroté dans sa première case.',
  },
] as const satisfies readonly { id: PuzzleFormat; label: string; hint: string }[]

export function formatLabel(format: PuzzleFormat): string {
  return FORMATS.find((item) => item.id === format)?.label ?? format
}

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

export async function getCatalog(): Promise<CatalogTheme[]> {
  return (await request('GET', '/catalog', catalogSchema)).themes
}

/**
 * Grille simple à jouer tout de suite, éventuellement dans un thème et un format ; `null`
 * s'il n'y en a pas.
 */
export async function quickPlayPuzzleId(
  theme?: string,
  format?: PuzzleFormat,
): Promise<string | null> {
  try {
    return (await request('GET', `/quick-play${query({ theme, format })}`, quickPlaySchema)).puzzle
      .id
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null
    throw error
  }
}
