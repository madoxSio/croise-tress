import type { Difficulty, PointRules } from '@crossverse/contracts'

/**
 * Barème des Coumba points (validé par le porteur du projet le 2026-10-24). Seul endroit où ces valeurs sont définies : les clients les reçoivent de l'API.
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
  /**
   * Duel rapide terminé (les duels privés ne rapportent rien : trop faciles à arranger entre
   * deux comptes). Il faut avoir trouvé au moins un mot, et seuls les `dailyCap` premiers duels
   * du jour (UTC) rapportent : un abandon immédiat en boucle ne rapporte rien.
   */
  match: { win: 15, draw: 5, loss: 2, dailyCap: 10 },
} as const

/** Indices : gratuits jusqu'à `freeHintsPerGame` par partie (lettre ou mot), payants ensuite. */
export const POINT_RULES: PointRules = {
  freeHintsPerGame: 3,
  hintCost: { letter: 5, word: 15 },
  duelHintCost: 10,
}
