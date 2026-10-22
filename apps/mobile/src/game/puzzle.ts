import type { PublicPuzzleDto } from '@crossverse/contracts'
import type { PublicCell, PublicPuzzle } from '@crossverse/crossword-core'

/**
 * Convertit la réponse de l'API vers le type du moteur. Zod infère `number?: number | undefined`
 * alors que le moteur, compilé avec `exactOptionalPropertyTypes`, attend une clé absente :
 * on reconstruit donc les cases sans clé `number` quand elle n'est pas définie.
 */
export function toEnginePuzzle(dto: PublicPuzzleDto): PublicPuzzle {
  return {
    id: dto.id,
    title: dto.title,
    width: dto.width,
    height: dto.height,
    cells: dto.cells.map((line) =>
      line.map((cell): PublicCell => {
        if (cell.block) return { block: true }
        return cell.number === undefined ? { block: false } : { block: false, number: cell.number }
      }),
    ),
    clues: dto.clues,
  }
}

/** Vérifie que la grille d'une session a bien les dimensions du puzzle. */
export function gridMatches(puzzle: PublicPuzzle, grid: readonly (readonly unknown[])[]): boolean {
  return grid.length === puzzle.height && grid.every((line) => line.length === puzzle.width)
}
