/**
 * Préférences d'interface (aucune valeur officielle) : thème, taille du texte, animations.
 * Pour ajouter un thème : une entrée dans `THEMES` + un bloc `[data-theme='…']` dans main.css.
 */
export const THEMES = [
  { id: 'auto', label: 'Automatique', description: 'Suit le réglage clair/sombre de l’appareil.' },
  { id: 'minimal', label: 'Minimal', description: 'Clair, sobre et lumineux.' },
  { id: 'dark', label: 'Sombre', description: 'Fond sombre pour jouer le soir.' },
  {
    id: 'contrast',
    label: 'Contraste élevé',
    description: 'Noir et blanc, bordures épaisses, couleurs franches.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const TEXT_SCALES = [
  { id: 'small', label: 'Petit', factor: 0.9 },
  { id: 'normal', label: 'Normal', factor: 1 },
  { id: 'large', label: 'Grand', factor: 1.15 },
  { id: 'xlarge', label: 'Très grand', factor: 1.3 },
] as const

export type TextScaleId = (typeof TEXT_SCALES)[number]['id']

export interface Preferences {
  readonly theme: ThemeId
  readonly textScale: TextScaleId
  readonly reducedMotion: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'auto',
  textScale: 'normal',
  reducedMotion: false,
}

export const PREFERENCES_STORAGE_KEY = 'crossverse:preferences'

const isTheme = (value: unknown): value is ThemeId => THEMES.some((theme) => theme.id === value)
const isTextScale = (value: unknown): value is TextScaleId =>
  TEXT_SCALES.some((scale) => scale.id === value)

/** Lit des préférences stockées en ignorant toute valeur inconnue ou corrompue. */
export function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return DEFAULT_PREFERENCES
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_PREFERENCES
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_PREFERENCES
  const record = data as Record<string, unknown>
  return {
    theme: isTheme(record['theme']) ? record['theme'] : DEFAULT_PREFERENCES.theme,
    textScale: isTextScale(record['textScale'])
      ? record['textScale']
      : DEFAULT_PREFERENCES.textScale,
    reducedMotion:
      typeof record['reducedMotion'] === 'boolean'
        ? record['reducedMotion']
        : DEFAULT_PREFERENCES.reducedMotion,
  }
}

export function textScaleFactor(id: TextScaleId): number {
  return TEXT_SCALES.find((scale) => scale.id === id)?.factor ?? 1
}
