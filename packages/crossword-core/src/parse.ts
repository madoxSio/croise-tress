import { normalizeLetter } from './normalize.js'
import type {
  Clue,
  ClueSource,
  Direction,
  Position,
  Puzzle,
  PuzzleCell,
  PuzzleSource,
  Result,
  Slot,
} from './types.js'

export const MIN_SIZE = 3
export const MAX_SIZE = 25
const BLOCK = '#'

export type PuzzleErrorCode =
  | 'invalid_size'
  | 'ragged_grid'
  | 'invalid_character'
  | 'orphan_cell'
  | 'disconnected_grid'
  | 'missing_clue'
  | 'unknown_clue'
  | 'duplicate_clue'
  | 'empty_clue'

export interface PuzzleError {
  readonly code: PuzzleErrorCode
  readonly message: string
}

/**
 * Valide un puzzle éditorial et construit sa représentation interne.
 * Toutes les erreurs sont collectées pour faciliter la correction du contenu.
 */
export function parsePuzzle(source: PuzzleSource): Result<Puzzle, PuzzleError> {
  const errors: PuzzleError[] = []
  const height = source.grid.length
  const width = source.grid[0]?.length ?? 0

  if (height < MIN_SIZE || height > MAX_SIZE || width < MIN_SIZE || width > MAX_SIZE) {
    return fail({
      code: 'invalid_size',
      message: `Taille ${width}×${height} hors limites (${MIN_SIZE}–${MAX_SIZE}).`,
    })
  }
  if (source.grid.some((line) => line.length !== width)) {
    return fail({
      code: 'ragged_grid',
      message: 'Toutes les lignes doivent avoir la même longueur.',
    })
  }

  const letters: (string | null)[][] = source.grid.map((line, row) =>
    Array.from(line, (ch, col) => {
      if (ch === BLOCK) return null
      const letter = normalizeLetter(ch)
      if (letter === null || letter !== ch) {
        errors.push({
          code: 'invalid_character',
          message: `Caractère « ${ch} » invalide en (${row}, ${col}) : attendu A–Z ou #.`,
        })
        return 'A'
      }
      return letter
    }),
  )

  const slots = findSlots(letters)
  checkEveryCellIsInASlot(letters, slots, errors)
  checkConnectivity(letters, errors)
  const clues = matchClues(slots, source.clues, errors)

  if (errors.length > 0) return { ok: false, errors }

  const numbers = new Map(slots.map((slot) => [key(slot.start), slot.number]))
  const cells: PuzzleCell[][] = letters.map((line, row) =>
    line.map((letter, col): PuzzleCell => {
      if (letter === null) return { block: true }
      const number = numbers.get(key({ row, col }))
      return number === undefined
        ? { block: false, solution: letter }
        : { block: false, number, solution: letter }
    }),
  )

  return { ok: true, value: { id: source.id, title: source.title, width, height, cells, clues } }
}

/**
 * Mots d'une grille éditoriale (`#` = case noire), dans l'ordre de numérotation, sans valider
 * les définitions. Sert à l'éditeur d'administration à proposer un champ par mot ; toute
 * autre lettre que `#` compte comme une case ouverte (la validation complète reste `parsePuzzle`).
 */
export function gridSlots(grid: readonly string[]): {
  direction: Direction
  number: number
  row: number
  col: number
  length: number
  answer: string
}[] {
  const letters = grid.map((line) => Array.from(line, (ch) => (ch === BLOCK ? null : ch)))
  return findSlots(letters).map((slot) => ({
    direction: slot.direction,
    number: slot.number,
    row: slot.start.row,
    col: slot.start.col,
    length: slot.length,
    answer: slot.cells.map((cell) => letters[cell.row]?.[cell.col] ?? '').join(''),
  }))
}

/** Numérotation classique : une case reçoit un numéro si elle commence un mot dans au moins une direction. */
function findSlots(letters: readonly (readonly (string | null)[])[]): Slot[] {
  const height = letters.length
  const width = letters[0]?.length ?? 0
  const open = (row: number, col: number): boolean =>
    row >= 0 && row < height && col >= 0 && col < width && letters[row]?.[col] != null
  const slots: Slot[] = []
  let next = 1

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!open(row, col)) continue
      const starts: Direction[] = []
      if (!open(row, col - 1) && open(row, col + 1)) starts.push('across')
      if (!open(row - 1, col) && open(row + 1, col)) starts.push('down')
      if (starts.length === 0) continue
      const number = next++
      for (const direction of starts) {
        const cells: Position[] = []
        const [dr, dc] = direction === 'across' ? [0, 1] : [1, 0]
        for (let r = row, c = col; open(r, c); r += dr, c += dc) cells.push({ row: r, col: c })
        slots.push({ direction, number, start: { row, col }, length: cells.length, cells })
      }
    }
  }
  return slots
}

function checkEveryCellIsInASlot(
  letters: readonly (readonly (string | null)[])[],
  slots: readonly Slot[],
  errors: PuzzleError[],
): void {
  const covered = new Set(slots.flatMap((slot) => slot.cells.map(key)))
  letters.forEach((line, row) => {
    line.forEach((letter, col) => {
      if (letter !== null && !covered.has(key({ row, col }))) {
        errors.push({
          code: 'orphan_cell',
          message: `La case (${row}, ${col}) n'appartient à aucun mot.`,
        })
      }
    })
  })
}

function checkConnectivity(
  letters: readonly (readonly (string | null)[])[],
  errors: PuzzleError[],
): void {
  const open: Position[] = []
  letters.forEach((line, row) => {
    line.forEach((letter, col) => {
      if (letter !== null) open.push({ row, col })
    })
  })
  const first = open[0]
  if (first === undefined) return

  const seen = new Set([key(first)])
  const queue = [first]
  for (let current = queue.pop(); current !== undefined; current = queue.pop()) {
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const neighbour = { row: current.row + dr, col: current.col + dc }
      if (letters[neighbour.row]?.[neighbour.col] != null && !seen.has(key(neighbour))) {
        seen.add(key(neighbour))
        queue.push(neighbour)
      }
    }
  }
  if (seen.size !== open.length) {
    errors.push({
      code: 'disconnected_grid',
      message: 'Les cases ouvertes doivent former un seul bloc connexe.',
    })
  }
}

function matchClues(
  slots: readonly Slot[],
  sources: readonly ClueSource[],
  errors: PuzzleError[],
): Clue[] {
  const byId = new Map<string, ClueSource>()
  for (const clue of sources) {
    const id = `${clue.number}-${clue.direction}`
    if (byId.has(id))
      errors.push({ code: 'duplicate_clue', message: `Définition ${id} en double.` })
    if (clue.text.trim() === '')
      errors.push({ code: 'empty_clue', message: `Définition ${id} vide.` })
    byId.set(id, clue)
  }

  const clues: Clue[] = []
  for (const slot of slots) {
    const id = `${slot.number}-${slot.direction}`
    const source = byId.get(id)
    byId.delete(id)
    if (source === undefined) {
      errors.push({ code: 'missing_clue', message: `Aucune définition pour ${id}.` })
      continue
    }
    const base = { direction: slot.direction, number: slot.number, text: source.text.trim(), slot }
    clues.push(
      source.explanation === undefined ? base : { ...base, explanation: source.explanation },
    )
  }
  for (const id of byId.keys()) {
    errors.push({
      code: 'unknown_clue',
      message: `La définition ${id} ne correspond à aucun mot de la grille.`,
    })
  }
  return clues
}

export function key(position: Position): string {
  return `${position.row}:${position.col}`
}

function fail(error: PuzzleError): Result<never, PuzzleError> {
  return { ok: false, errors: [error] }
}
