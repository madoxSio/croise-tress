import type { Direction } from './types.js'

/**
 * Présentation d'une grille : `freeform` = grille « en croix » (mots libres, numéros dans les
 * cases), `classic` = mots croisés à la française (grille dense, définitions regroupées par
 * ligne en chiffres romains et par colonne en chiffres arabes). Le moteur, la validation et
 * le score sont identiques : seule la présentation change.
 */
export type PuzzleFormat = 'freeform' | 'classic'

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

/** Chiffres romains (1 → I). Hors de 1–3999, renvoie le nombre en chiffres arabes. */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value)
  let rest = value
  let out = ''
  for (const [amount, symbol] of ROMAN) {
    while (rest >= amount) {
      out += symbol
      rest -= amount
    }
  }
  return out
}

interface LocatedClue {
  readonly direction: Direction
  readonly row: number
  readonly col: number
}

/** Repère d'une ligne (I, II…) ou d'une colonne (1, 2…), à partir d'un indice 0. */
export function classicLineLabel(direction: Direction, index: number): string {
  return direction === 'across' ? toRoman(index + 1) : String(index + 1)
}

/** Repère de la ligne (horizontal) ou de la colonne (vertical) d'une définition. */
export function classicLabel(clue: LocatedClue): string {
  return classicLineLabel(clue.direction, clue.direction === 'across' ? clue.row : clue.col)
}

export interface ClassicLine<T extends LocatedClue> {
  readonly direction: Direction
  /** Ligne ou colonne, à partir de 0. */
  readonly index: number
  readonly label: string
  /** Définitions de la ligne dans l'ordre de lecture (gauche → droite, haut → bas). */
  readonly clues: readonly T[]
}

/** Regroupe les définitions d'une direction par ligne (horizontal) ou par colonne (vertical). */
export function classicLines<T extends LocatedClue>(
  clues: readonly T[],
  direction: Direction,
): ClassicLine<T>[] {
  const across = direction === 'across'
  const groups = new Map<number, T[]>()
  for (const clue of clues) {
    if (clue.direction !== direction) continue
    const index = across ? clue.row : clue.col
    const group = groups.get(index) ?? []
    group.push(clue)
    groups.set(index, group)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, group]) => ({
      direction,
      index,
      label: classicLineLabel(direction, index),
      clues: group.sort((a, b) => (across ? a.col - b.col : a.row - b.row)),
    }))
}
