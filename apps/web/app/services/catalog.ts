import {
  catalogSchema,
  type CatalogTheme,
  quickPlaySchema,
  type Difficulty,
  type DifficultyCounts,
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

/** Grille simple à jouer tout de suite, éventuellement dans un thème ; `null` s'il n'y en a pas. */
export async function quickPlayPuzzleId(theme?: string): Promise<string | null> {
  try {
    return (await request('GET', `/quick-play${query({ theme })}`, quickPlaySchema)).puzzle.id
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null
    throw error
  }
}
