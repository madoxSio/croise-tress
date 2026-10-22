import type { PublicPuzzle } from '@crossverse/crossword-core'

/**
 * Structure publique (sans solution) d'une grille 5×5 :
 *
 *   1 . 2 . 3
 *   . # . # .
 *   4 . . . .
 *   . # . # .
 *   5 . . . .
 */
const BLOCKS = new Set(['1:1', '1:3', '3:1', '3:3'])
const NUMBERS: Record<string, number> = { '0:0': 1, '0:2': 2, '0:4': 3, '2:0': 4, '4:0': 5 }

export const PUZZLE: PublicPuzzle = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Table',
  width: 5,
  height: 5,
  cells: Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => {
      const key = `${row}:${col}`
      if (BLOCKS.has(key)) return { block: true as const }
      const number = NUMBERS[key]
      return number === undefined ? { block: false as const } : { block: false as const, number }
    }),
  ),
  clues: [
    { direction: 'down', number: 1, text: 'D1', row: 0, col: 0, length: 5 },
    { direction: 'across', number: 1, text: 'A1', row: 0, col: 0, length: 5 },
    { direction: 'across', number: 4, text: 'A4', row: 2, col: 0, length: 5 },
    { direction: 'across', number: 5, text: 'A5', row: 4, col: 0, length: 5 },
    { direction: 'down', number: 2, text: 'D2', row: 0, col: 2, length: 5 },
    { direction: 'down', number: 3, text: 'D3', row: 0, col: 4, length: 5 },
  ],
}

export const emptyGrid = (): (string | null)[][] =>
  Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null))
