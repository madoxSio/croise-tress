import { describe, expect, it } from 'vitest'
import {
  checkCell,
  checkGrid,
  checkSlot,
  createEmptyGrid,
  findSlot,
  isSolved,
  parsePuzzle,
  revealSlot,
  sanitizeGrid,
  setLetter,
  toPublicPuzzle,
  type PlayerGrid,
  type Puzzle,
} from '../src/index.js'
import { TABLE_PUZZLE } from './fixtures.js'

const result = parsePuzzle(TABLE_PUZZLE)
if (!result.ok) throw new Error('fixture invalide')
const puzzle: Puzzle = result.value

function fill(words: readonly string[]): PlayerGrid {
  return words.map((line) => Array.from(line, (ch) => (ch === '#' ? null : ch)))
}

describe('toPublicPuzzle', () => {
  it('ne contient aucune lettre de la solution ni explication', () => {
    const json = JSON.stringify(toPublicPuzzle(puzzle))
    expect(json).not.toMatch(/solution|explanation/)
    // Aucune chaîne d'une seule lettre majuscule (valeur de case) n'apparaît.
    expect(json).not.toMatch(/"[A-Z]"/)
    expect(json).not.toContain('battage')
  })

  it('conserve la structure jouable', () => {
    const pub = toPublicPuzzle(puzzle)
    expect(pub.cells[0]?.[0]).toEqual({ block: false, number: 1 })
    expect(pub.clues).toContainEqual({
      direction: 'down',
      number: 2,
      text: 'Enveloppe du grain',
      row: 0,
      col: 2,
      length: 5,
    })
  })
})

describe('saisie', () => {
  it('normalise la lettre saisie et ne modifie pas la grille d’origine', () => {
    const empty = createEmptyGrid(puzzle)
    const next = setLetter(puzzle, empty, { row: 4, col: 2 }, 'é')
    expect(next[4]?.[2]).toBe('E')
    expect(empty[4]?.[2]).toBeNull()
  })

  it('refuse une case noire, hors grille ou une saisie invalide', () => {
    const empty = createEmptyGrid(puzzle)
    expect(() => setLetter(puzzle, empty, { row: 1, col: 1 }, 'A')).toThrow(RangeError)
    expect(() => setLetter(puzzle, empty, { row: 9, col: 0 }, 'A')).toThrow(RangeError)
    expect(() => setLetter(puzzle, empty, { row: 0, col: 0 }, '7')).toThrow(RangeError)
  })
})

describe('sanitizeGrid', () => {
  it('accepte une grille valide en normalisant les lettres', () => {
    const input = createEmptyGrid(puzzle).map((line, row) =>
      line.map((cell, col) => (row + col === 0 ? 't' : cell)),
    )
    expect(sanitizeGrid(puzzle, input)?.[0]?.[0]).toBe('T')
  })

  it.each([
    ['pas un tableau', 'abc'],
    ['mauvaise hauteur', [[null]]],
    ['lettre sur case noire', fill(['TABLE', 'AXA#L', 'BALLE', 'L#L#V', 'ELEVE'])],
    ['valeur non textuelle', [[1, null, null, null, null], ...createEmptyGrid(puzzle).slice(1)]],
    ['plusieurs lettres', [['AB', null, null, null, null], ...createEmptyGrid(puzzle).slice(1)]],
  ])('refuse : %s', (_label, input) => {
    expect(sanitizeGrid(puzzle, input)).toBeNull()
  })
})

describe('vérification', () => {
  const partial = fill(['TABLE', 'A#A#L', 'BOLLE', 'L#L#V', 'E#E#E'])

  it('vérifie une case', () => {
    expect(checkCell(puzzle, partial, { row: 0, col: 0 })).toBe('correct')
    expect(checkCell(puzzle, partial, { row: 2, col: 1 })).toBe('incorrect')
    expect(checkCell(puzzle, createEmptyGrid(puzzle), { row: 0, col: 0 })).toBe('empty')
  })

  it('vérifie un mot', () => {
    const slot = findSlot(puzzle, 'across', 4)
    expect(slot).toBeDefined()
    if (!slot) return
    expect(checkSlot(puzzle, partial, slot).map((c) => c.result)).toEqual([
      'correct',
      'incorrect',
      'correct',
      'correct',
      'correct',
    ])
  })

  it('vérifie la grille et détecte la résolution', () => {
    expect(checkGrid(puzzle, partial)).toHaveLength(21)
    expect(isSolved(puzzle, partial)).toBe(false)
    expect(isSolved(puzzle, fill(TABLE_PUZZLE.grid))).toBe(true)
  })
})

describe('indices', () => {
  it('révèle uniquement le mot demandé', () => {
    const slot = findSlot(puzzle, 'down', 3)
    if (!slot) throw new Error('slot manquant')
    expect(
      revealSlot(puzzle, slot)
        .map((c) => c.letter)
        .join(''),
    ).toBe('ELEVE')
  })
})
