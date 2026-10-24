import { describe, expect, it } from 'vitest'
import { EMPTY_STATE, addHit, cellColors, press, previewCells } from '../src/wordsearch/state'

const hit = {
  direction: 'across' as const,
  number: 1,
  answer: 'BAL',
  start: { row: 0, col: 0 },
  end: { row: 0, col: 2 },
}

describe('grille pré-remplie (app)', () => {
  it('sélectionne par deux taps et annule par un tap sur la première lettre', () => {
    const first = press(EMPTY_STATE, { row: 1, col: 1 })
    expect(first.selection).toBeNull()
    expect(press(first.state, { row: 1, col: 1 }).state.anchor).toBeNull()
    const second = press(first.state, { row: 2, col: 4 })
    expect(second.selection).toEqual({ from: { row: 1, col: 1 }, to: { row: 1, col: 4 } })
    expect(second.state.anchor).toBeNull()
  })

  it('aligne et borne l’aperçu d’un glisser', () => {
    expect(previewCells({ row: 0, col: 0 }, { row: 7, col: 7 }, 4).at(-1)).toEqual({
      row: 3,
      col: 3,
    })
    expect(previewCells({ row: 0, col: 0 }, { row: 1, col: 3 }, 5)).toHaveLength(4)
  })

  it('ignore un mot déjà trouvé et colore ses cases', () => {
    const once = addHit(EMPTY_STATE, hit)
    expect(addHit(once, hit)).toBe(once)
    const colors = cellColors(once.found)
    expect(colors.size).toBe(3)
    expect(colors.get('0:1')).toBeDefined()
    expect(colors.get('1:0')).toBeUndefined()
  })
})
