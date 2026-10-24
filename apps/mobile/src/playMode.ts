import { useSyncExternalStore } from 'react'

/**
 * Mode de jeu proposé par la liste des grilles et la partie rapide (mêmes modes que le web,
 * apps/web/app/utils/playModes.ts). Gardé en mémoire le temps de la session de l'app.
 */
export type PlayModeId = 'classic' | 'prefilled'

export const PLAY_MODES: readonly { id: PlayModeId; label: string; description: string }[] = [
  {
    id: 'classic',
    label: 'À trous',
    description:
      'Les cases sont vides : lis la définition et écris le mot. Score et points comptent.',
  },
  {
    id: 'prefilled',
    label: 'Pré-remplie',
    description:
      'Toutes les lettres sont là : retrouve chaque mot et surligne-le. Pour apprendre, sans points.',
  },
]

let current: PlayModeId = 'classic'
const listeners = new Set<() => void>()

export function setPlayMode(mode: PlayModeId): void {
  current = mode
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePlayMode(): PlayModeId {
  return useSyncExternalStore(subscribe, () => current)
}

/** Écran d'une grille dans le mode choisi. */
export function puzzleRoute(
  puzzleId: string,
  mode: PlayModeId,
): `/play/${string}` | `/pre-remplie/${string}` {
  return mode === 'prefilled' ? `/pre-remplie/${puzzleId}` : `/play/${puzzleId}`
}
