export const ELO_K = 32
export const ELO_INITIAL = 1200

/** Nouveau classement Elo après une partie (score : 1 victoire, 0,5 nul, 0 défaite). */
export function eloUpdate(rating: number, opponent: number, score: 0 | 0.5 | 1): number {
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400))
  return Math.round(rating + ELO_K * (score - expected))
}
