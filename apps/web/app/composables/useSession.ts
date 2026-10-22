import type { CurrentUser, SessionResponse } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'

type SessionStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Session du joueur (invitée par défaut). Le cookie HttpOnly et le jeton CSRF sont gérés
 * par `services/api.ts` ; ce composable n'expose que l'état utile à l'interface.
 */
export function useSession() {
  const user = useState<CurrentUser | null>('session-user', () => null)
  const status = useState<SessionStatus>('session-status', () => 'idle')
  const error = useState<string | null>('session-error', () => null)

  async function ensure(): Promise<boolean> {
    if (status.value === 'ready') return true
    status.value = 'loading'
    error.value = null
    try {
      const session = await api.ensureSession()
      user.value = session.user
      status.value = 'ready'
      return true
    } catch (cause) {
      error.value = errorMessage(cause)
      status.value = 'error'
      return false
    }
  }

  /**
   * Applique la session renvoyée par une action de compte (connexion, confirmation,
   * déconnexion…) : `services/api.ts` a déjà mis à jour le jeton CSRF.
   */
  function apply(session: SessionResponse): void {
    user.value = session.user
    status.value = 'ready'
    error.value = null
  }

  /** Invité (ou session pas encore ouverte) : pas de compte confirmé. */
  const isGuest = computed(() => user.value === null || user.value.isGuest)

  return {
    user: readonly(user),
    status: readonly(status),
    error: readonly(error),
    isGuest,
    ensure,
    apply,
  }
}
