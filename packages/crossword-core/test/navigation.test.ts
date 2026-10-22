import { describe, expect, it } from 'vitest'
import {
  clueAt,
  clueFromDrag,
  parsePuzzle,
  resolveDirection,
  stepInClue,
  toPublicPuzzle,
} from '../src/index.js'
import { TABLE_PUZZLE } from './fixtures.js'

const result = parsePuzzle(TABLE_PUZZLE)
if (!result.ok) throw new Error('fixture invalide')
const pub = toPublicPuzzle(result.value)

describe('navigation', () => {
  it('trouve la définition d’une case dans chaque direction', () => {
    expect(clueAt(pub, { row: 2, col: 2 }, 'across')?.number).toBe(4)
    expect(clueAt(pub, { row: 2, col: 2 }, 'down')?.number).toBe(2)
    expect(clueAt(pub, { row: 1, col: 0 }, 'across')).toBeUndefined()
  })

  it('bascule de direction quand la préférée n’existe pas', () => {
    expect(resolveDirection(pub, { row: 1, col: 0 }, 'across')).toBe('down')
    expect(resolveDirection(pub, { row: 0, col: 1 }, 'down')).toBe('across')
    expect(resolveDirection(pub, { row: 1, col: 1 }, 'across')).toBeNull()
  })

  it('avance et recule dans le mot sans en sortir', () => {
    expect(stepInClue(pub, { row: 0, col: 0 }, 'across', 1)).toEqual({ row: 0, col: 1 })
    expect(stepInClue(pub, { row: 0, col: 4 }, 'across', 1)).toEqual({ row: 0, col: 4 })
    expect(stepInClue(pub, { row: 0, col: 0 }, 'down', -1)).toEqual({ row: 0, col: 0 })
  })

  it('sélectionne un mot par tracé', () => {
    expect(clueFromDrag(pub, { row: 2, col: 0 }, { row: 2, col: 3 })?.number).toBe(4)
    // Un tracé à rebours sélectionne aussi le mot.
    expect(clueFromDrag(pub, { row: 4, col: 4 }, { row: 0, col: 4 })?.number).toBe(3)
    expect(clueFromDrag(pub, { row: 0, col: 4 }, { row: 4, col: 4 })?.number).toBe(3)
    expect(clueFromDrag(pub, { row: 0, col: 0 }, { row: 2, col: 2 })).toBeUndefined()
    expect(clueFromDrag(pub, { row: 0, col: 0 }, { row: 0, col: 0 })).toBeUndefined()
  })
})
