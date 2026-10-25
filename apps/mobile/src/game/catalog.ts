import type { CatalogSubTheme, CatalogTheme, Difficulty, PuzzleFormat } from '@crossverse/contracts'

/** Les trois niveaux affichés, regroupant les cinq niveaux du moteur (comme sur le web). */
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

/** Types de grille proposés au catalogue (comme sur le web). */
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

export function levelOf(difficulty: Difficulty): (typeof LEVELS)[number] {
  return (
    LEVELS.find((level) => (level.difficulties as readonly Difficulty[]).includes(difficulty)) ??
    LEVELS[0]
  )
}

/** Habillage d'un thème : couleurs et icône (le motif `skin` n'est dessiné que sur le web). */
export interface ThemeLook {
  readonly accent: string
  readonly accentAlt: string
  readonly icon: string
}

export const DEFAULT_LOOK: ThemeLook = { accent: '#5634f0', accentAlt: '#ff5c39', icon: '🧩' }

/** Thème ou sous-thème par slug. */
export function findTheme(themes: readonly CatalogTheme[], slug: string): CatalogSubTheme | null {
  for (const theme of themes) {
    if (theme.slug === slug) return theme
    const child = theme.children.find((c) => c.slug === slug)
    if (child) return child
  }
  return null
}

/** Thème principal contenant `slug` (lui-même s'il est principal). */
export function parentTheme(themes: readonly CatalogTheme[], slug: string): CatalogTheme | null {
  return themes.find((t) => t.slug === slug || t.children.some((c) => c.slug === slug)) ?? null
}

export function lookOf(themes: readonly CatalogTheme[], slug: string): ThemeLook {
  const found = findTheme(themes, slug)
  return found
    ? { accent: found.accent, accentAlt: found.accentAlt, icon: found.icon }
    : DEFAULT_LOOK
}
