import type { Position } from './types.js'
import { lineCells, seededRandom, wordSearchSteps, type WordSearchStep } from './wordsearch.js'

/**
 * Mots mêlés « standard » (comme sur papier) : une grille carrée entièrement remplie, la liste
 * des mots à trouver affichée en clair, et un mot mystère formé par les lettres restantes, lues
 * dans l'ordre (de gauche à droite, de haut en bas) une fois tous les mots rayés.
 *
 * Contrairement à la grille pré-remplie (wordsearch.ts), rien n'est secret : la liste des mots
 * est l'énoncé. La grille est écrite une fois pour toutes (seed) et chaque mot n'y figure
 * qu'une seule fois, ce qui rend le mot mystère univoque.
 */

export interface WordListDirections {
  /** Autorise les diagonales. */
  readonly diagonals: boolean
  /** Autorise les mots écrits à l'envers (de droite à gauche, de bas en haut). */
  readonly reversed: boolean
}

export interface WordListGrid {
  /** Une chaîne de `size` lettres A–Z par ligne. */
  readonly rows: readonly string[]
  /** Mots à trouver, en lettres A–Z. */
  readonly words: readonly string[]
}

/** Emplacement d'un mot : `start` sur sa première lettre, `end` sur sa dernière. */
export interface WordListHit {
  readonly word: string
  readonly start: Position
  readonly end: Position
}

/** Les huit sens de lecture : toute occurrence compte, quel que soit le niveau. */
const ALL_STEPS = wordSearchSteps({ diagonals: true, reversed: true })

const letterAt = (rows: readonly string[], row: number, col: number): string | undefined =>
  rows[row]?.[col]

/** Toutes les occurrences de `word` dans la grille, dans les sens donnés. */
export function wordOccurrences(
  rows: readonly string[],
  word: string,
  steps: readonly WordSearchStep[] = ALL_STEPS,
): WordListHit[] {
  const hits: WordListHit[] = []
  const seen = new Set<string>()
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      for (const { dr, dc } of steps) {
        let matches = true
        for (let i = 0; i < word.length && matches; i++) {
          matches = letterAt(rows, row + dr * i, col + dc * i) === word[i]
        }
        if (!matches) continue
        const end = { row: row + dr * (word.length - 1), col: col + dc * (word.length - 1) }
        // Un palindrome se lit dans les deux sens au même endroit : une seule occurrence.
        const cells = [`${row}:${col}`, `${end.row}:${end.col}`].sort().join('-')
        if (seen.has(cells)) continue
        seen.add(cells)
        hits.push({ word, start: { row, col }, end })
      }
    }
  })
  return hits
}

/**
 * Mot désigné par un tracé de `from` à `to`, s'il fait partie de la liste et n'est pas déjà
 * trouvé. Le tracé peut aller dans un sens ou dans l'autre, mais le mot doit être écrit dans
 * un sens permis par le niveau. Le résultat est orienté dans le sens de lecture du mot.
 */
export function matchWordList(
  grid: WordListGrid,
  from: Position,
  to: Position,
  directions: WordListDirections,
  found: ReadonlySet<string> = new Set(),
): WordListHit | undefined {
  const cells = lineCells(from, to)
  if (!cells || cells.length < 2) return undefined
  const letters = cells.map(({ row, col }) => letterAt(grid.rows, row, col) ?? '?').join('')
  const step = { dr: Math.sign(to.row - from.row), dc: Math.sign(to.col - from.col) }
  const allowed = wordSearchSteps(directions)
  const reads = (dr: number, dc: number): boolean => allowed.some((s) => s.dr === dr && s.dc === dc)
  const candidates = grid.words.filter((word) => !found.has(word))
  if (candidates.includes(letters) && reads(step.dr, step.dc)) {
    return { word: letters, start: from, end: to }
  }
  // Tracé fait de la dernière lettre vers la première : c'est le même mot, lu dans son sens.
  const backwards = letters.split('').reverse().join('')
  if (candidates.includes(backwards) && reads(-step.dr, -step.dc)) {
    return { word: backwards, start: to, end: from }
  }
  return undefined
}

/** Cases couvertes par les mots donnés. */
function coveredCells(hits: readonly Pick<WordListHit, 'start' | 'end'>[]): Set<string> {
  const covered = new Set<string>()
  for (const hit of hits) {
    for (const { row, col } of lineCells(hit.start, hit.end) ?? []) covered.add(`${row}:${col}`)
  }
  return covered
}

/** Lettres non couvertes par `hits`, dans l'ordre de lecture : le mot mystère en fin de partie. */
export function leftoverLetters(
  rows: readonly string[],
  hits: readonly Pick<WordListHit, 'start' | 'end'>[],
): { letters: string; cells: Position[] } {
  const covered = coveredCells(hits)
  const cells: Position[] = []
  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (!covered.has(`${row}:${col}`)) cells.push({ row, col })
    }
  })
  return { letters: cells.map(({ row, col }) => letterAt(rows, row, col) ?? '').join(''), cells }
}

export interface WordListProblem {
  readonly message: string
}

/**
 * Vérifie une grille écrite à la main ou générée : grille carrée en A–Z, chaque mot présent
 * exactement une fois (dans les huit sens, pour qu'aucun tracé ne soit ambigu), lisible dans
 * les sens du niveau, et lettres restantes égales au mot mystère.
 */
export function validateWordList(
  grid: WordListGrid & { readonly mystery: string },
  directions: WordListDirections,
): WordListProblem[] {
  const problems: WordListProblem[] = []
  const size = grid.rows.length
  if (size === 0 || grid.rows.some((line) => line.length !== size || !/^[A-Z]+$/.test(line))) {
    problems.push({ message: 'La grille doit être carrée et ne contenir que des lettres A–Z.' })
    return problems
  }
  if (new Set(grid.words).size !== grid.words.length) {
    problems.push({ message: 'Un mot figure deux fois dans la liste.' })
  }
  const allowed = wordSearchSteps(directions)
  const hits: WordListHit[] = []
  for (const word of grid.words) {
    if (!/^[A-Z]{2,}$/.test(word)) problems.push({ message: `Mot invalide : « ${word} ».` })
    const everywhere = wordOccurrences(grid.rows, word)
    if (everywhere.length !== 1) {
      problems.push({ message: `« ${word} » apparaît ${String(everywhere.length)} fois.` })
      continue
    }
    if (wordOccurrences(grid.rows, word, allowed).length !== 1) {
      problems.push({ message: `« ${word} » n'est pas lisible dans les sens de ce niveau.` })
    }
    hits.push(...everywhere)
  }
  const leftover = leftoverLetters(grid.rows, hits).letters
  if (leftover !== grid.mystery) {
    problems.push({ message: `Lettres restantes « ${leftover} » au lieu de « ${grid.mystery} ».` })
  }
  return problems
}

/**
 * Outil d'écriture des grilles : place les mots de `words`, puis complète avec des mots de
 * `extras` (même thème) jusqu'à ce qu'il reste exactement la place du mot mystère, écrit dans
 * les cases libres. Vérifie le résultat avec `validateWordList`. Déterministe pour une graine
 * donnée ; renvoie `null` si aucune disposition n'est trouvée.
 */
export function buildWordList(input: {
  readonly words: readonly string[]
  readonly extras?: readonly string[]
  readonly mystery: string
  readonly size: number
  readonly directions: WordListDirections
  readonly seed: number
  readonly attempts?: number
}): { rows: string[]; words: string[] } | null {
  const { mystery, size, directions } = input
  const next = seededRandom(input.seed)
  const steps = wordSearchSteps(directions)
  const required = [...input.words].sort((a, b) => b.length - a.length)
  const target = size * size - mystery.length
  for (let attempt = 0; attempt < (input.attempts ?? 200); attempt++) {
    const board = new Board(size, steps)
    const greed = next()
    if (!required.every((word) => board.place(word, greed, next, Infinity))) continue
    const used = [...required]
    const extras = shuffle(input.extras ?? [], next)
    for (const word of extras) {
      if (board.occupied >= target) break
      if (board.place(word, greed, next, target - board.occupied)) used.push(word)
    }
    if (board.occupied !== target) continue
    // Cases libres remplies dans l'ordre de lecture par les lettres du mot mystère.
    let free = 0
    const rows = board.cells.map((line) =>
      line.map((cell) => cell ?? mystery.charAt(free++)).join(''),
    )
    const words = used.sort((a, b) => a.localeCompare(b))
    if (validateWordList({ rows, words, mystery }, directions).length === 0) return { rows, words }
  }
  return null
}

function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const a = copy[i]
    const b = copy[j]
    if (a === undefined || b === undefined) continue
    copy[i] = b
    copy[j] = a
  }
  return copy
}

/** Grille en cours de construction. */
class Board {
  readonly cells: (string | null)[][]
  occupied = 0

  constructor(
    private readonly size: number,
    private readonly steps: readonly WordSearchStep[],
  ) {
    this.cells = Array.from({ length: size }, () => Array<string | null>(size).fill(null))
  }

  /**
   * Pose `word` à un emplacement compatible (croisements sur lettre identique) qui occupe au
   * plus `maxNew` cases neuves. Avec la probabilité `greed`, choisit parmi les emplacements
   * qui croisent le plus : les grilles denses laissent peu de lettres pour le mot mystère.
   */
  place(word: string, greed: number, next: () => number, maxNew: number): boolean {
    const options: { row: number; col: number; step: WordSearchStep; overlap: number }[] = []
    const last = word.length - 1
    for (const step of this.steps) {
      for (let row = 0; row < this.size; row++) {
        for (let col = 0; col < this.size; col++) {
          const endRow = row + step.dr * last
          const endCol = col + step.dc * last
          if (endRow < 0 || endRow >= this.size || endCol < 0 || endCol >= this.size) continue
          let overlap = 0
          let fits = true
          for (let i = 0; i <= last && fits; i++) {
            const current = this.cells[row + step.dr * i]?.[col + step.dc * i]
            if (current === word[i]) overlap++
            else if (current !== null) fits = false
          }
          // Un mot entièrement posé sur un autre ne compte pas comme placé.
          const fresh = word.length - overlap
          if (fits && fresh > 0 && fresh <= maxNew) options.push({ row, col, step, overlap })
        }
      }
    }
    if (options.length === 0) return false
    const best = Math.max(...options.map((o) => o.overlap))
    const pool = next() < greed ? options.filter((o) => o.overlap === best) : options
    const chosen = pool[Math.floor(next() * pool.length)]
    if (!chosen) return false
    for (let i = 0; i <= last; i++) {
      const line = this.cells[chosen.row + chosen.step.dr * i]
      const col = chosen.col + chosen.step.dc * i
      if (line?.[col] === null) {
        line[col] = word[i] ?? null
        this.occupied++
      }
    }
    return true
  }
}
