import { describe, expect, it } from 'vitest'
import { computeScore, type ScoreInput } from '../src/index.js'

const base: ScoreInput = {
  durationMs: 0,
  targetMs: 300_000,
  cellChecks: 0,
  wordChecks: 0,
  lettersRevealed: 0,
  wordsRevealed: 0,
  solutionRevealed: false,
}

describe('computeScore', () => {
  it('donne le maximum pour une résolution instantanée sans aide', () => {
    expect(computeScore(base)).toBe(1500)
  })

  it('réduit le bonus de rapidité linéairement jusqu’à 3× la durée cible', () => {
    expect(computeScore({ ...base, durationMs: 450_000 })).toBe(1250)
    expect(computeScore({ ...base, durationMs: 900_000 })).toBe(1000)
    expect(computeScore({ ...base, durationMs: 5_000_000 })).toBe(1000)
  })

  it('applique les pénalités d’aide sans descendre sous zéro', () => {
    expect(
      computeScore({
        ...base,
        durationMs: 900_000,
        cellChecks: 2,
        wordChecks: 1,
        lettersRevealed: 1,
        wordsRevealed: 1,
      }),
    ).toBe(755)
    expect(computeScore({ ...base, durationMs: 900_000, wordsRevealed: 50 })).toBe(0)
  })

  it('vaut zéro si la solution complète a été révélée', () => {
    expect(computeScore({ ...base, solutionRevealed: true })).toBe(0)
  })

  it.each([
    { durationMs: -1 },
    { cellChecks: Number.NaN },
    { targetMs: 0 },
    { wordsRevealed: Number.POSITIVE_INFINITY },
  ])('refuse une entrée invalide %o', (override) => {
    expect(() => computeScore({ ...base, ...override })).toThrow(RangeError)
  })
})
