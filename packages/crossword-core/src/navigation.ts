import type { Direction, Position, PublicClue, PublicPuzzle } from './types.js'

/** Fonctions de navigation fondées sur la seule structure publique : utilisables côté client. */

export function slotCells(
  clue: Pick<PublicClue, 'direction' | 'row' | 'col' | 'length'>,
): Position[] {
  return Array.from({ length: clue.length }, (_, i) =>
    clue.direction === 'across'
      ? { row: clue.row, col: clue.col + i }
      : { row: clue.row + i, col: clue.col },
  )
}

/** Définition qui contient la case dans la direction donnée, s'il y en a une. */
export function clueAt(
  puzzle: PublicPuzzle,
  position: Position,
  direction: Direction,
): PublicClue | undefined {
  return puzzle.clues.find(
    (clue) =>
      clue.direction === direction &&
      slotCells(clue).some((cell) => cell.row === position.row && cell.col === position.col),
  )
}

/** Direction à utiliser quand on sélectionne une case : la préférée si elle existe, sinon l'autre. */
export function resolveDirection(
  puzzle: PublicPuzzle,
  position: Position,
  preferred: Direction,
): Direction | null {
  if (clueAt(puzzle, position, preferred)) return preferred
  const other = preferred === 'across' ? 'down' : 'across'
  return clueAt(puzzle, position, other) ? other : null
}

/** Case suivante (ou précédente) dans le mot courant ; reste sur place en bout de mot. */
export function stepInClue(
  puzzle: PublicPuzzle,
  position: Position,
  direction: Direction,
  delta: 1 | -1,
): Position {
  const clue = clueAt(puzzle, position, direction)
  if (!clue) return position
  const cells = slotCells(clue)
  const index = cells.findIndex((cell) => cell.row === position.row && cell.col === position.col)
  return cells[index + delta] ?? position
}

/**
 * Sélection par tracé : renvoie la définition couvrant les deux cases de début et de fin
 * d'un glissement, si elles sont alignées dans un même mot. Sinon `undefined`.
 */
export function clueFromDrag(
  puzzle: PublicPuzzle,
  from: Position,
  to: Position,
): PublicClue | undefined {
  let direction: Direction
  if (from.row === to.row && from.col !== to.col) direction = 'across'
  else if (from.col === to.col && from.row !== to.row) direction = 'down'
  else return undefined
  const clue = clueAt(puzzle, from, direction)
  if (!clue) return undefined
  const covers = slotCells(clue).some((cell) => cell.row === to.row && cell.col === to.col)
  return covers ? clue : undefined
}
