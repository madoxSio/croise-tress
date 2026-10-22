import type { SessionResponse } from '@crossverse/contracts'

type Listener = (session: SessionResponse | null) => void

/**
 * Dernière session connue, observable par l'interface (`useSession`). Alimentée uniquement
 * par le client HTTP : l'interface ne fabrique jamais d'état d'authentification elle-même.
 */
function createSessionStore() {
  let current: SessionResponse | null = null
  const listeners = new Set<Listener>()
  return {
    get: (): SessionResponse | null => current,
    set: (session: SessionResponse): void => {
      current = session
      for (const listener of listeners) listener(current)
    },
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const sessionStore = createSessionStore()
