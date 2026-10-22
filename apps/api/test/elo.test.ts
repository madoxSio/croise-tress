import { describe, expect, it } from 'vitest'
import { eloUpdate } from '../src/modules/match/elo.ts'

describe('eloUpdate', () => {
  it('à niveau égal, une victoire rapporte K/2 et une défaite en retire autant', () => {
    expect(eloUpdate(1200, 1200, 1)).toBe(1216)
    expect(eloUpdate(1200, 1200, 0)).toBe(1184)
    expect(eloUpdate(1200, 1200, 0.5)).toBe(1200)
  })

  it('battre un joueur plus fort rapporte davantage', () => {
    expect(eloUpdate(1200, 1600, 1)).toBeGreaterThan(1225)
    expect(eloUpdate(1600, 1200, 1) - 1600).toBeLessThan(5)
  })
})
