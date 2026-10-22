export type Direction = 'across' | 'down'

export interface Position {
  readonly row: number
  readonly col: number
}

/** Format éditorial d'un puzzle, solution incluse. Ne doit jamais être envoyé au client. */
export interface PuzzleSource {
  readonly id: string
  readonly title: string
  /** Une chaîne par ligne : `#` pour une case noire, une lettre pour une case ouverte. */
  readonly grid: readonly string[]
  readonly clues: readonly ClueSource[]
}

export interface ClueSource {
  readonly direction: Direction
  readonly number: number
  readonly text: string
  readonly explanation?: string | undefined
}

/** Emplacement d'un mot (au moins deux cases consécutives) dans une direction. */
export interface Slot {
  readonly direction: Direction
  readonly number: number
  readonly start: Position
  readonly length: number
  readonly cells: readonly Position[]
}

export type PuzzleCell =
  | { readonly block: true }
  | { readonly block: false; readonly number?: number; readonly solution: string }

export interface Clue {
  readonly direction: Direction
  readonly number: number
  readonly text: string
  readonly explanation?: string | undefined
  readonly slot: Slot
}

/** Puzzle validé, solution incluse : usage serveur uniquement. */
export interface Puzzle {
  readonly id: string
  readonly title: string
  readonly width: number
  readonly height: number
  readonly cells: readonly (readonly PuzzleCell[])[]
  readonly clues: readonly Clue[]
}

export type PublicCell =
  { readonly block: true } | { readonly block: false; readonly number?: number }

export interface PublicClue {
  readonly direction: Direction
  readonly number: number
  readonly text: string
  readonly row: number
  readonly col: number
  readonly length: number
}

/** Structure jouable d'un puzzle, sans aucune lettre de la solution. */
export interface PublicPuzzle {
  readonly id: string
  readonly title: string
  readonly width: number
  readonly height: number
  readonly cells: readonly (readonly PublicCell[])[]
  readonly clues: readonly PublicClue[]
}

/** Saisie du joueur : `null` pour une case vide ou noire. */
export type PlayerGrid = readonly (readonly (string | null)[])[]

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: readonly E[] }
