import { useEffect, useSyncExternalStore } from 'react'
import type { DuelSnapshot } from './controller'
import { duel } from './index'

/** Abonne l'écran à l'état du duel et ouvre la connexion temps réel. */
export function useDuel(): DuelSnapshot {
  const snapshot = useSyncExternalStore(duel.subscribe, duel.getSnapshot)
  useEffect(() => {
    duel.connect()
  }, [])
  return snapshot
}
