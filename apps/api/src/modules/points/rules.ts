import type { Difficulty, PointRules } from '@crossverse/contracts'

/**
 * Barème des Coumba points (proposé le 2026-10-23, en attente de validation par le porteur
 * du projet). Seul endroit où ces valeurs sont définies : les clients les reçoivent de l'API.
 */
export const POINTS = {
  welcome: 20,
  /** Première réussite d'une grille, sans révéler la solution. */
  completion: {
    discovery: 5,
    easy: 10,
    intermediate: 15,
    hard: 20,
    expert: 30,
  } satisfies Record<Difficulty, number>,
  /** Ajouté à la première réussite si aucune lettre ni aucun mot n'a été révélé. */
  noHintBonus: 5,
  pathStep: 10,
  pathCompleted: 50,
  /** Défi du jour terminé le jour même (UTC). */
  daily: 10,
} as const

/** Indices : gratuits jusqu'à `freeHintsPerGame` par partie (lettre ou mot), payants ensuite. */
export const POINT_RULES: PointRules = {
  freeHintsPerGame: 3,
  hintCost: { letter: 5, word: 15 },
}
