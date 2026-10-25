import type { PuzzleFormat } from '@crossverse/contracts'
import { errorMessage } from '~/services/api'
import { quickPlayPuzzleId } from '~/services/catalog'
import { puzzlePath } from '~/utils/playModes'

/**
 * « Partie rapide » : choisit une grille (simple de préférence) et l'ouvre aussitôt, dans le
 * mode de jeu choisi par le joueur.
 */
export function useQuickPlay() {
  const { preferences } = usePreferences()
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function start(theme?: string, format?: PuzzleFormat): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      const id = await quickPlayPuzzleId(theme, format)
      if (id) await navigateTo(puzzlePath(id, preferences.value.playMode))
      else error.value = 'Aucune grille disponible pour le moment.'
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      busy.value = false
    }
  }

  return { busy: readonly(busy), error: readonly(error), start }
}
