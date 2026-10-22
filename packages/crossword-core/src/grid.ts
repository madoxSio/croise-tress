import { normalizeLetter } from './normalize.js'
import type { Direction, PlayerGrid, Position, Puzzle, Slot } from './types.js'

export type CellCheck = 'correct' | 'incorrect' | 'empty'

interface GridShape {
  readonly width: number
  readonly height: number
  readonly cells: readonly (readonly { readonly block: boolean }[])[]
}

export function createEmptyGrid(shape: Pick<GridShape, 'width' | 'height'>): PlayerGrid {
  return Array.from({ length: shape.height }, () => Array.from({ length: shape.width }, () => null))
}

export function isOpenCell(shape: GridShape, position: Position): boolean {
  return shape.cells[position.row]?.[position.col]?.block === false
}

/**
 * Valide une grille reçue (sauvegarde, reprise) : dimensions exactes, lettres A–Z
 * uniquement sur les cases ouvertes. Renvoie `null` si la grille est invalide.
 */
export function sanitizeGrid(shape: GridShape, input: unknown): PlayerGrid | null {
  if (!Array.isArray(input) || input.length !== shape.height) return null
  const grid: (string | null)[][] = []
  for (let row = 0; row < shape.height; row++) {
    const line: unknown = input[row]
    if (!Array.isArray(line) || line.length !== shape.width) return null
    const out: (string | null)[] = []
    for (let col = 0; col < shape.width; col++) {
      const value: unknown = line[col]
      if (value === null) {
        out.push(null)
        continue
      }
      if (typeof value !== 'string' || !isOpenCell(shape, { row, col })) return null
      const letter = normalizeLetter(value)
      if (letter === null) return null
      out.push(letter)
    }
    grid.push(out)
  }
  return grid
}

/** Renvoie une nouvelle grille avec la lettre saisie (ou effacée si `letter` vaut `null`). */
export function setLetter(
  shape: GridShape,
  grid: PlayerGrid,
  position: Position,
  letter: string | null,
): PlayerGrid {
  if (!isOpenCell(shape, position))
    throw new RangeError(`Case (${position.row}, ${position.col}) non jouable.`)
  const value = letter === null ? null : normalizeLetter(letter)
  if (letter !== null && value === null) throw new RangeError(`Lettre « ${letter} » invalide.`)
  return grid.map((line, row) =>
    row === position.row
      ? line.map((current, col) => (col === position.col ? value : current))
      : line,
  )
}

export function findSlot(puzzle: Puzzle, direction: Direction, number: number): Slot | undefined {
  return puzzle.clues.find((clue) => clue.direction === direction && clue.number === number)?.slot
}

export function solutionAt(puzzle: Puzzle, position: Position): string {
  const cell = puzzle.cells[position.row]?.[position.col]
  if (cell === undefined || cell.block)
    throw new RangeError(`Case (${position.row}, ${position.col}) non jouable.`)
  return cell.solution
}

export function checkCell(puzzle: Puzzle, grid: PlayerGrid, position: Position): CellCheck {
  const expected = solutionAt(puzzle, position)
  const value = grid[position.row]?.[position.col] ?? null
  if (value === null) return 'empty'
  return value === expected ? 'correct' : 'incorrect'
}

export interface CheckedCell extends Position {
  readonly result: CellCheck
}

export function checkSlot(puzzle: Puzzle, grid: PlayerGrid, slot: Slot): CheckedCell[] {
  return slot.cells.map((cell) => ({ ...cell, result: checkCell(puzzle, grid, cell) }))
}

export function checkGrid(puzzle: Puzzle, grid: PlayerGrid): CheckedCell[] {
  return openCells(puzzle).map((cell) => ({ ...cell, result: checkCell(puzzle, grid, cell) }))
}

export function isSolved(puzzle: Puzzle, grid: PlayerGrid): boolean {
  return openCells(puzzle).every((cell) => checkCell(puzzle, grid, cell) === 'correct')
}

/** Lettres à révéler pour un indice : uniquement la portion demandée de la solution. */
export function revealSlot(
  puzzle: Puzzle,
  slot: Slot,
): { readonly row: number; readonly col: number; readonly letter: string }[] {
  return slot.cells.map((cell) => ({ ...cell, letter: solutionAt(puzzle, cell) }))
}

export function openCells(shape: GridShape): Position[] {
  const cells: Position[] = []
  shape.cells.forEach((line, row) => {
    line.forEach((cell, col) => {
      if (!cell.block) cells.push({ row, col })
    })
  })
  return cells
}
