import { adminApi } from '~/services/admin'
import { errorMessage } from '~/services/api'

type AdminAccess = 'unknown' | 'checking' | 'granted' | 'denied' | 'error'

/** Vérification en cours, partagée par les appels concurrents (cadre et page montés ensemble). */
let inFlight: Promise<boolean> | null = null

/**
 * Accès à l'espace d'administration, demandé au serveur (`GET /admin/me`) et mémorisé pour la
 * navigation. Ce n'est qu'un confort d'affichage : chaque route `/admin` est protégée côté API.
 */
export function useAdmin() {
  const access = useState<AdminAccess>('admin-access', () => 'unknown')
  const error = useState<string | null>('admin-error', () => null)
  const { ensure, isGuest } = useSession()

  function check(force = false): Promise<boolean> {
    if (inFlight) return inFlight
    if (!force && (access.value === 'granted' || access.value === 'denied'))
      return Promise.resolve(access.value === 'granted')
    inFlight = verify().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function verify(): Promise<boolean> {
    access.value = 'checking'
    error.value = null
    try {
      if (!(await ensure()) || isGuest.value) {
        access.value = 'denied'
        return false
      }
      access.value = (await adminApi.isAdmin()) ? 'granted' : 'denied'
    } catch (cause) {
      error.value = errorMessage(cause)
      access.value = 'error'
    }
    return access.value === 'granted'
  }

  /** À appeler quand la session change (connexion, déconnexion). */
  function reset(): void {
    access.value = 'unknown'
  }

  return { access: readonly(access), error: readonly(error), check, reset }
}
