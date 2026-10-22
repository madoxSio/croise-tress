import { describe, expect, it } from 'vitest'
import { parsePuzzle, type Puzzle, type PuzzleSource } from '../src/index.js'
import { TABLE_PUZZLE } from './fixtures.js'

function parsed(source: PuzzleSource): Puzzle {
  const result = parsePuzzle(source)
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'))
  return result.value
}

function errorCodes(source: PuzzleSource): string[] {
  const result = parsePuzzle(source)
  return result.ok ? [] : result.errors.map((e) => e.code)
}

describe('parsePuzzle', () => {
  it('valide une grille cohérente et la numérote', () => {
    const puzzle = parsed(TABLE_PUZZLE)
    expect(puzzle.width).toBe(5)
    expect(puzzle.height).toBe(5)
    expect(puzzle.clues.map((c) => `${c.number}${c.direction[0] ?? ''}:${c.slot.length}`)).toEqual([
      '1a:5',
      '1d:5',
      '2d:5',
      '3d:5',
      '4a:5',
      '5a:5',
    ])
    expect(puzzle.cells[0]?.[0]).toEqual({ block: false, number: 1, solution: 'T' })
    expect(puzzle.cells[1]?.[1]).toEqual({ block: true })
  })

  it('assure la cohérence des croisements', () => {
    const puzzle = parsed(TABLE_PUZZLE)
    const word = (number: number, direction: 'across' | 'down'): string => {
      const clue = puzzle.clues.find((c) => c.number === number && c.direction === direction)
      return (clue?.slot.cells ?? [])
        .map(({ row, col }) => {
          const cell = puzzle.cells[row]?.[col]
          return cell && !cell.block ? cell.solution : '?'
        })
        .join('')
    }
    expect([word(1, 'across'), word(4, 'across'), word(5, 'across')]).toEqual([
      'TABLE',
      'BALLE',
      'ELEVE',
    ])
    expect([word(1, 'down'), word(2, 'down'), word(3, 'down')]).toEqual(['TABLE', 'BALLE', 'ELEVE'])
  })

  it('refuse une taille hors limites', () => {
    expect(errorCodes({ ...TABLE_PUZZLE, grid: ['AB', 'CD'] })).toEqual(['invalid_size'])
    expect(
      errorCodes({ ...TABLE_PUZZLE, grid: Array.from({ length: 26 }, () => 'A'.repeat(26)) }),
    ).toEqual(['invalid_size'])
  })

  it('refuse une grille irrégulière', () => {
    expect(
      errorCodes({ ...TABLE_PUZZLE, grid: ['TABLE', 'A#A#', 'BALLE', 'L#L#V', 'ELEVE'] }),
    ).toEqual(['ragged_grid'])
  })

  it('refuse les caractères non canoniques (minuscules, accents, ponctuation)', () => {
    const codes = errorCodes({
      ...TABLE_PUZZLE,
      grid: ['TAbLE', 'A#A#L', 'BALLÉ', 'L#L#V', 'ELEV!'],
    })
    expect(codes.filter((c) => c === 'invalid_character')).toHaveLength(3)
  })

  it('refuse une case isolée qui n’appartient à aucun mot', () => {
    const codes = errorCodes({
      ...TABLE_PUZZLE,
      grid: ['ABC##', 'D#E##', 'FGH##', '#####', '####Z'],
      clues: [],
    })
    expect(codes).toContain('orphan_cell')
    expect(codes).toContain('disconnected_grid')
  })

  it('signale les définitions manquantes, inconnues, en double ou vides', () => {
    const [first, ...rest] = TABLE_PUZZLE.clues
    expect(errorCodes({ ...TABLE_PUZZLE, clues: rest })).toEqual(['missing_clue'])
    expect(first).toBeDefined()
    if (!first) return
    const codes = errorCodes({
      ...TABLE_PUZZLE,
      clues: [...TABLE_PUZZLE.clues, first, { direction: 'across', number: 9, text: ' ' }],
    })
    expect(codes.sort()).toEqual(['duplicate_clue', 'empty_clue', 'unknown_clue'])
  })
})
