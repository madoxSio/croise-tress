import { describe, expect, it } from 'vitest'
import {
  buildWordSearch,
  findPlacement,
  lineCells,
  parsePuzzle,
  snapToLine,
  wordSearchSteps,
  type Puzzle,
  type WordSearch,
} from '../src/index.js'
import { TABLE_PUZZLE } from './fixtures.js'

const result = parsePuzzle(TABLE_PUZZLE)
if (!result.ok) throw new Error('fixture invalide')
const puzzle: Puzzle = result.value
const easy = { diagonals: false, reversed: false }
const hard = { diagonals: true, reversed: true }

function lettersOf(
  search: WordSearch,
  from: { row: number; col: number },
  to: { row: number; col: number },
): string {
  return (lineCells(from, to) ?? []).map(({ row, col }) => search.rows[row]?.[col] ?? '').join('')
}

describe('buildWordSearch', () => {
  it('cache chaque réponse à l’emplacement annoncé, dans une grille carrée remplie', () => {
    const search = buildWordSearch(puzzle, { seed: 42, ...hard })
    expect(search.rows).toHaveLength(search.size)
    for (const row of search.rows)
      expect(row).toMatch(new RegExp(`^[A-Z]{${String(search.size)}}$`))
    expect(search.placements).toHaveLength(puzzle.clues.length)
    for (const placement of search.placements) {
      expect(lettersOf(search, placement.start, placement.end)).toBe(placement.answer)
    }
    expect(search.placements.map((p) => p.answer)).toContain('BALLE')
  })

  it('est déterministe pour une graine et varie avec elle', () => {
    const a = buildWordSearch(puzzle, { seed: 7, ...easy })
    expect(buildWordSearch(puzzle, { seed: 7, ...easy })).toEqual(a)
    expect(buildWordSearch(puzzle, { seed: 8, ...easy }).rows).not.toEqual(a.rows)
  })

  it('respecte les directions autorisées par le niveau', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const p of buildWordSearch(puzzle, { seed, ...easy }).placements) {
        const horizontal = p.start.row === p.end.row && p.end.col > p.start.col
        const vertical = p.start.col === p.end.col && p.end.row > p.start.row
        expect(horizontal || vertical).toBe(true)
      }
    }
    expect(wordSearchSteps(easy)).toHaveLength(2)
    expect(wordSearchSteps({ diagonals: true, reversed: false })).toHaveLength(4)
    expect(wordSearchSteps(hard)).toHaveLength(8)
  })
})

describe('findPlacement', () => {
  const search = buildWordSearch(puzzle, { seed: 3, ...hard })
  const balle = search.placements.find((p) => p.answer === 'BALLE')
  if (!balle) throw new Error('BALLE absent')

  it('reconnaît un mot sélectionné dans les deux sens', () => {
    expect(findPlacement(search, balle.start, balle.end)?.answer).toBe('BALLE')
    expect(findPlacement(search, balle.end, balle.start)?.answer).toBe('BALLE')
  })

  it('refuse une sélection qui ne forme aucune réponse', () => {
    expect(findPlacement(search, { row: 0, col: 0 }, { row: 0, col: 0 })).toBeUndefined()
    expect(findPlacement(search, { row: 0, col: 0 }, { row: 1, col: 2 })).toBeUndefined()
  })

  it('préfère la définition non trouvée quand deux réponses sont identiques', () => {
    // Dans la grille « Table », 1 horizontal et 1 vertical valent tous deux TABLE.
    const table = search.placements.filter((p) => p.answer === 'TABLE')
    expect(table).toHaveLength(2)
    const [first] = table
    if (!first) throw new Error('TABLE absent')
    const found = findPlacement(search, first.start, first.end, (p) => p.direction === 'across')
    expect(found?.direction).toBe('down')
  })
})

describe('tracés', () => {
  it('liste les cases d’un tracé aligné et refuse un tracé tordu', () => {
    expect(lineCells({ row: 0, col: 0 }, { row: 2, col: 2 })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
    ])
    expect(lineCells({ row: 0, col: 0 }, { row: 1, col: 3 })).toBeNull()
  })

  it('ramène un glisser imprécis sur la direction la plus proche', () => {
    expect(snapToLine({ row: 0, col: 0 }, { row: 1, col: 5 })).toEqual({ row: 0, col: 5 })
    expect(snapToLine({ row: 5, col: 5 }, { row: 1, col: 2 })).toEqual({ row: 2, col: 2 })
    expect(snapToLine({ row: 0, col: 0 }, { row: 4, col: 4 })).toEqual({ row: 4, col: 4 })
  })
})
