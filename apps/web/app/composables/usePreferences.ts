import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  parsePreferences,
  textScaleFactor,
} from '~/utils/preferences'
import type { Preferences } from '~/utils/preferences'

function readStored(): Preferences {
  try {
    return parsePreferences(window.localStorage.getItem(PREFERENCES_STORAGE_KEY))
  } catch {
    // Stockage indisponible (navigation privée, données bloquées) : valeurs par défaut.
    return DEFAULT_PREFERENCES
  }
}

function store(preferences: Preferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Préférence conservée pour la session en cours seulement.
  }
}

/** Applique les préférences au document : thème, échelle du texte, animations. */
export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement
  root.dataset['theme'] = preferences.theme
  root.dataset['motion'] = preferences.reducedMotion ? 'reduced' : 'auto'
  root.style.setProperty('--text-scale', String(textScaleFactor(preferences.textScale)))
}

export function usePreferences() {
  const preferences = useState<Preferences>('preferences', () =>
    import.meta.client ? readStored() : DEFAULT_PREFERENCES,
  )

  function update(patch: Partial<Preferences>): void {
    preferences.value = { ...preferences.value, ...patch }
    store(preferences.value)
    applyPreferences(preferences.value)
  }

  return { preferences: readonly(preferences), update }
}
