import type { CatalogSubTheme, CatalogTheme } from '~/services/catalog'
import { getCatalog } from '~/services/catalog'
import { errorMessage } from '~/services/api'

/** Habillage visuel d'un thème : motif (`skin`), couleurs et icône. */
export interface ThemeLook {
  readonly skin: string
  readonly accent: string
  readonly accentAlt: string
  readonly icon: string
}

const DEFAULT_LOOK: ThemeLook = {
  skin: 'default',
  accent: '#5634f0',
  accentAlt: '#ff5c39',
  icon: '🧩',
}

/** Catalogue des thèmes, chargé une fois puis partagé entre les écrans. */
export function useCatalog() {
  const themes = useState<CatalogTheme[] | null>('catalog-themes', () => null)
  const error = useState<string | null>('catalog-error', () => null)
  const loading = useState('catalog-loading', () => false)

  async function load(force = false): Promise<void> {
    if ((themes.value && !force) || loading.value) return
    loading.value = true
    error.value = null
    try {
      themes.value = await getCatalog()
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  /** Thème ou sous-thème par slug (champ `themeSlug` des grilles). */
  function find(key: string): CatalogSubTheme | null {
    for (const theme of themes.value ?? []) {
      if (theme.slug === key) return theme
      const child = theme.children.find((c) => c.slug === key)
      if (child) return child
    }
    return null
  }

  function lookOf(key: string): ThemeLook {
    const found = find(key)
    return found
      ? { skin: found.skin, accent: found.accent, accentAlt: found.accentAlt, icon: found.icon }
      : DEFAULT_LOOK
  }

  return {
    // `computed` plutôt que `readonly` : les composants reçoivent des types simples.
    themes: computed(() => themes.value),
    error: readonly(error),
    loading: readonly(loading),
    load,
    find,
    lookOf,
  }
}
