/**
 * Solutions des grilles de démonstration, lues dans le seed de l'API (jamais dans le client :
 * le navigateur ne connaît pas les solutions). Les tests s'en servent pour jouer « juste »
 * et pour vérifier qu'aucune réponse n'apparaît dans le JavaScript servi (SOL-02).
 */
import { expect, type Page } from '@playwright/test'
import { SEED_PUZZLES, type SeedPuzzle } from '../../api/prisma/seed/puzzles.ts'

export interface Slot {
  readonly direction: 'across' | 'down'
  readonly number: number
  readonly cells: readonly { readonly row: number; readonly col: number }[]
  readonly answer: string
}

/** Titre de la grille affiché dans le h1 de la page (sans la difficulté, dans un <span>). */
export async function displayedPuzzleTitle(page: Page): Promise<string> {
  await expect(page.locator('main h1')).toBeVisible()
  return page.locator('main h1').evaluate((h1) => {
    const copy = h1.cloneNode(true) as HTMLElement
    copy.querySelectorAll('span').forEach((span) => {
      span.remove()
    })
    return copy.textContent.trim()
  })
}

export function seedPuzzleByTitle(title: string): SeedPuzzle {
  const puzzle = SEED_PUZZLES.find((p) => p.title === title.trim())
  if (!puzzle) throw new Error(`Grille de démonstration inconnue : « ${title} »`)
  return puzzle
}

/** Numérotation classique (ligne par ligne) des mots de 2 lettres ou plus. */
export function slotsOf(puzzle: SeedPuzzle): Slot[] {
  const grid = puzzle.grid
  const open = (row: number, col: number): boolean => {
    const char = grid[row]?.[col]
    return char !== undefined && char !== '#'
  }
  const slots: Slot[] = []
  let number = 0
  grid.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (!open(row, col)) continue
      const across = !open(row, col - 1) && open(row, col + 1)
      const down = !open(row - 1, col) && open(row + 1, col)
      if (!across && !down) continue
      number++
      for (const direction of ['across', 'down'] as const) {
        if (direction === 'across' ? !across : !down) continue
        const cells: { row: number; col: number }[] = []
        let r = row
        let c = col
        while (open(r, c)) {
          cells.push({ row: r, col: c })
          if (direction === 'across') c++
          else r++
        }
        const answer = cells.map((cell) => grid[cell.row]?.[cell.col] ?? '').join('')
        slots.push({ direction, number, cells, answer })
      }
    }
  })
  return slots
}

/** Toutes les réponses de toutes les grilles de démonstration. */
export function allSeedAnswers(): string[] {
  return [...new Set(SEED_PUZZLES.flatMap((p) => slotsOf(p).map((slot) => slot.answer)))]
}

export { SEED_PUZZLES }
