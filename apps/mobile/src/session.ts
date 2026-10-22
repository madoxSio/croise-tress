import type { SessionResponse } from '@crossverse/contracts'
import { useSyncExternalStore } from 'react'
import { sessionStore } from './api/session-store'

/** Session courante (null tant que le premier `GET /session` n'a pas répondu). */
export function useSession(): SessionResponse | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get)
}
