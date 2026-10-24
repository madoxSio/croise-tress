/**
 * État d'une grille pré-remplie côté app (fonctions pures, testées sans React Native) :
 * première lettre choisie, mots trouvés et couleurs de surlignage. Savoir si une sélection est
 * un mot appartient au serveur.
 */
import { lineCells, snapToLine, type Position } from '@crossverse/crossword-core'
import type { WordSearchClueRef, WordSearchHit } from '@crossverse/contracts'

export interface FoundWord extends WordSearchHit {
  readonly revealed: boolean
}

export interface WordSearchState {
  readonly anchor: Position | null
  readonly found: readonly FoundWord[]
}

export interface Selection {
  readonly from: Position
  readonly to: Position
}

export const EMPTY_STATE: WordSearchState = { anchor: null, found: [] }

export const clueKey = (clue: WordSearchClueRef): string =>
  `${clue.direction}:${String(clue.number)}`

export const cellKey = (position: Position): string =>
  `${String(position.row)}:${String(position.col)}`

const same = (a: Position, b: Position): boolean => a.row === b.row && a.col === b.col

/**
 * Tap sur une case : le premier choisit la première lettre, le second la dernière (ramenée sur
 * la direction alignée la plus proche). Un second tap sur la même case annule.
 */
export function press(
  state: WordSearchState,
  position: Position,
): { state: WordSearchState; selection: Selection | null } {
  if (!state.anchor) return { state: { ...state, anchor: position }, selection: null }
  if (same(state.anchor, position)) return { state: { ...state, anchor: null }, selection: null }
  return {
    state: { ...state, anchor: null },
    selection: { from: state.anchor, to: snapToLine(state.anchor, position) },
  }
}

/** Cases d'un tracé en cours (glisser), bornées à la grille. */
export function previewCells(from: Position, to: Position, size: number): Position[] {
  const end = snapToLine(from, to)
  const clamp = (value: number): number => Math.min(size - 1, Math.max(0, value))
  return lineCells(from, { row: clamp(end.row), col: clamp(end.col) }) ?? [from]
}

export function addHit(
  state: WordSearchState,
  hit: WordSearchHit,
  revealed = false,
): WordSearchState {
  if (state.found.some((word) => clueKey(word) === clueKey(hit))) return state
  return { ...state, found: [...state.found, { ...hit, revealed }] }
}

const HIGHLIGHTERS = [
  'rgba(255,216,77,0.6)',
  'rgba(120,200,255,0.55)',
  'rgba(255,143,163,0.55)',
  'rgba(160,235,80,0.55)',
  'rgba(176,150,255,0.55)',
  'rgba(255,170,90,0.55)',
  'rgba(90,220,180,0.55)',
  'rgba(245,150,235,0.55)',
] as const
const REVEALED = 'rgba(140,135,165,0.4)'

export function hitColor(index: number, revealed: boolean): string {
  if (revealed) return REVEALED
  return HIGHLIGHTERS[index % HIGHLIGHTERS.length] ?? HIGHLIGHTERS[0]
}

/** Couleur de fond de chaque case couverte par un mot trouvé (le dernier trouvé l'emporte). */
export function cellColors(found: readonly FoundWord[]): Map<string, string> {
  const colors = new Map<string, string>()
  found.forEach((word, index) => {
    for (const cell of lineCells(word.start, word.end) ?? []) {
      colors.set(cellKey(cell), hitColor(index, word.revealed))
    }
  })
  return colors
}
