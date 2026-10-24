/**
 * Les deux façons de jouer une grille. Le mode « à trous » est la partie officielle (score,
 * points, progression, parcours) ; la grille pré-remplie est un mode d'entraînement au
 * vocabulaire, sans récompense.
 */
export const PLAY_MODES = [
  {
    id: 'classic',
    label: 'Grille à trous',
    short: 'À trous',
    description: 'Les cases sont vides : lis la définition et écris le mot.',
  },
  {
    id: 'prefilled',
    label: 'Grille pré-remplie',
    short: 'Pré-remplie',
    description: 'Toutes les lettres sont là : retrouve chaque mot et surligne-le.',
  },
] as const

export type PlayModeId = (typeof PLAY_MODES)[number]['id']

export const isPlayMode = (value: unknown): value is PlayModeId =>
  PLAY_MODES.some((mode) => mode.id === value)

/** Adresse d'une grille dans le mode choisi. */
export function puzzlePath(puzzleId: string, mode: PlayModeId = 'classic'): string {
  const id = encodeURIComponent(puzzleId)
  return mode === 'prefilled' ? `/pre-remplie/${id}` : `/play/${id}`
}
