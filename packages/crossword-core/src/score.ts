/**
 * Règle de score solo (version 1, documentée dans docs/ARCHITECTURE.md) :
 * 1000 points de base, −10 par vérification de case, −25 par vérification de mot,
 * −50 par lettre révélée, −150 par mot révélé ; grille entièrement révélée = 0.
 * Bonus de rapidité : jusqu'à +500, décroissant linéairement jusqu'à la durée cible × 3.
 * Le score est toujours calculé par le serveur à partir de ses propres horodatages.
 */
export interface ScoreInput {
  readonly durationMs: number
  readonly targetMs: number
  readonly cellChecks: number
  readonly wordChecks: number
  readonly lettersRevealed: number
  readonly wordsRevealed: number
  readonly solutionRevealed: boolean
}

export const SCORE_RULES = {
  base: 1000,
  cellCheck: 10,
  wordCheck: 25,
  letterReveal: 50,
  wordReveal: 150,
  maxSpeedBonus: 500,
} as const

export function computeScore(input: ScoreInput): number {
  for (const [name, value] of Object.entries(input)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new RangeError(`${name} doit être un nombre positif ou nul.`)
    }
  }
  if (input.targetMs === 0) throw new RangeError('targetMs doit être strictement positif.')
  if (input.solutionRevealed) return 0

  const penalties =
    input.cellChecks * SCORE_RULES.cellCheck +
    input.wordChecks * SCORE_RULES.wordCheck +
    input.lettersRevealed * SCORE_RULES.letterReveal +
    input.wordsRevealed * SCORE_RULES.wordReveal
  const speedRatio = Math.max(0, 1 - input.durationMs / (input.targetMs * 3))
  const speedBonus = Math.round(SCORE_RULES.maxSpeedBonus * speedRatio)

  return Math.max(0, SCORE_RULES.base - penalties + speedBonus)
}
