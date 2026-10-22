import {
  NATIVE_CLIENT_HEADER,
  NATIVE_CLIENT_VALUE,
  type SessionResponse,
} from '@crossverse/contracts'

/**
 * Réponse d'ouverture de session. Un client natif y reçoit en plus le jeton brut
 * (`sessionToken`), qu'un navigateur ne voit jamais puisqu'il a le cookie HttpOnly.
 */
export type OpenedSession = SessionResponse

/**
 * Manière dont le client prouve sa session à l'API. Deux implémentations :
 * - `cookieTransport` (version web) : le navigateur gère le cookie HttpOnly ;
 * - `bearerTransport` (iOS, Android) : jeton rangé dans le stockage sécurisé du système.
 */
export interface AuthTransport {
  readonly credentials: 'same-origin' | 'include' | 'omit'
  headers(): Promise<Record<string, string>>
  /** Le serveur a ouvert une session (invité, connexion, confirmation d'e-mail). */
  sessionOpened(session: OpenedSession): Promise<void>
  /** La session est terminée côté serveur (déconnexion, suppression, réinitialisation). */
  sessionClosed(): Promise<void>
}

export const cookieTransport: AuthTransport = {
  credentials: 'same-origin',
  headers: () => Promise.resolve({}),
  sessionOpened: () => Promise.resolve(),
  sessionClosed: () => Promise.resolve(),
}

/** Stockage du jeton : coffre du système en production, mémoire en test. */
export interface TokenStore {
  get(): Promise<string | null>
  set(token: string): Promise<void>
  clear(): Promise<void>
}

export function bearerTransport(store: TokenStore): AuthTransport {
  return {
    credentials: 'omit',
    async headers() {
      const token = await store.get()
      const headers: Record<string, string> = { [NATIVE_CLIENT_HEADER]: NATIVE_CLIENT_VALUE }
      if (token !== null) headers['authorization'] = `Bearer ${token}`
      return headers
    },
    async sessionOpened(session) {
      if (session.sessionToken !== undefined) await store.set(session.sessionToken)
    },
    sessionClosed: () => store.clear(),
  }
}

export function memoryTokenStore(initial: string | null = null): TokenStore {
  let token = initial
  return {
    get: () => Promise.resolve(token),
    set: (value) => {
      token = value
      return Promise.resolve()
    },
    clear: () => {
      token = null
      return Promise.resolve()
    },
  }
}
