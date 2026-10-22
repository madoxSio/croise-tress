import { errorMessage } from '~/services/api'

/**
 * État d'une action de formulaire : envoi en cours (double soumission ignorée) et message
 * d'erreur affichable. Chaque formulaire a le sien, pour que les erreurs ne se mélangent pas.
 */
export function useFormAction() {
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (pending.value) return false
    pending.value = true
    error.value = null
    try {
      await action()
      return true
    } catch (cause) {
      error.value = errorMessage(cause)
      return false
    } finally {
      pending.value = false
    }
  }

  return { pending: readonly(pending), error, run }
}
