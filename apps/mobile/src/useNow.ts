import { useEffect, useState } from 'react'

/** Heure locale rafraîchie chaque seconde tant que `active` (chronomètres d'affichage). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [active])
  return now
}
