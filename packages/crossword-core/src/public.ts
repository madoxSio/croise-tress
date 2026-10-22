import type { PublicCell, PublicPuzzle, Puzzle } from './types.js'

/** Projette un puzzle vers sa forme publique : aucune lettre de solution ni explication ne subsiste. */
export function toPublicPuzzle(puzzle: Puzzle): PublicPuzzle {
  return {
    id: puzzle.id,
    title: puzzle.title,
    width: puzzle.width,
    height: puzzle.height,
    cells: puzzle.cells.map((line) =>
      line.map((cell): PublicCell => {
        if (cell.block) return { block: true }
        return cell.number === undefined ? { block: false } : { block: false, number: cell.number }
      }),
    ),
    clues: puzzle.clues.map((clue) => ({
      direction: clue.direction,
      number: clue.number,
      text: clue.text,
      row: clue.slot.start.row,
      col: clue.slot.start.col,
      length: clue.slot.length,
    })),
  }
}
