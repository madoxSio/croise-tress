/**
 * État de jeu local d'une grille : sélection, direction, saisie et marques de vérification.
 * Fonctions pures sur un état immuable (aucun React, aucun réseau) afin d'être testées sans
 * appareil. Ce module ne connaît jamais la solution : résultats de vérification et lettres
 * révélées viennent du serveur (`checked`, `revealed`).
 */
import {
  clueAt,
  normalizeAnswer,
  resolveDirection,
  slotCells,
  stepInClue,
} from '@crossverse/crossword-core'
import type { Direction, Position, PublicClue, PublicPuzzle } from '@crossverse/crossword-core'

export type CellMark = 'correct' | 'incorrect'
export type EditableGrid = (string | null)[][]
type ServerGrid = readonly (readonly (string | null)[])[]

export interface GameState {
  readonly grid: EditableGrid
  readonly active: Position | null
  readonly direction: Direction
  /** Résultats de la dernière vérification serveur, effacés quand la case change. */
  readonly marks: ReadonlyMap<string, CellMark>
  /** Cases dont la lettre a été révélée par un indice (affichage distinct). */
  readonly revealed: ReadonlySet<string>
  /** Saisie bloquée (partie terminée, requête en cours). */
  readonly locked: boolean
  /** Incrémenté à chaque modification de lettre par le joueur : déclenche la sauvegarde. */
  readonly editCount: number
}

export type GameAction =
  | { type: 'select'; position: Position }
  | { type: 'selectClue'; clue: Pick<PublicClue, 'direction' | 'number'> }
  | { type: 'toggleDirection' }
  | { type: 'moveToClue'; delta: 1 | -1 }
  | { type: 'input'; text: string }
  | { type: 'backspace' }
  | { type: 'load'; grid: ServerGrid }
  | {
      type: 'checked'
      cells: readonly { row: number; col: number; result: 'correct' | 'incorrect' | 'empty' }[]
    }
  | { type: 'revealed'; cells: readonly { row: number; col: number; letter: string }[] }
  | { type: 'lock'; locked: boolean }

export const cellKey = (position: Position): string => `${position.row}:${position.col}`

const samePosition = (a: Position | null, b: Position | null): boolean =>
  a !== null && b !== null && a.row === b.row && a.col === b.col

const otherDirection = (direction: Direction): Direction =>
  direction === 'across' ? 'down' : 'across'

const isOpen = (puzzle: PublicPuzzle, position: Position): boolean =>
  puzzle.cells[position.row]?.[position.col]?.block === false

const letterAt = (state: GameState, position: Position): string | null =>
  state.grid[position.row]?.[position.col] ?? null

/** Ordre de parcours des mots : horizontaux puis verticaux, par numéro. */
export function orderedClues(puzzle: PublicPuzzle): PublicClue[] {
  const rank = (clue: PublicClue): number => (clue.direction === 'across' ? 0 : 1)
  return [...puzzle.clues].sort((a, b) => rank(a) - rank(b) || a.number - b.number)
}

/** Copie une grille reçue en ne gardant que des lettres sur les cases ouvertes. */
function copyGrid(puzzle: PublicPuzzle, source: ServerGrid | null): EditableGrid {
  return Array.from({ length: puzzle.height }, (_, row) =>
    Array.from({ length: puzzle.width }, (_, col) => {
      if (!isOpen(puzzle, { row, col })) return null
      const value = source?.[row]?.[col] ?? null
      return value === null || value === '' ? null : value
    }),
  )
}

export function initialState(puzzle: PublicPuzzle, grid: ServerGrid | null = null): GameState {
  return {
    grid: copyGrid(puzzle, grid),
    active: null,
    direction: 'across',
    marks: new Map(),
    revealed: new Set(),
    locked: false,
    editCount: 0,
  }
}

// --- Sélecteurs ------------------------------------------------------------

export function activeClue(puzzle: PublicPuzzle, state: GameState): PublicClue | undefined {
  return state.active ? clueAt(puzzle, state.active, state.direction) : undefined
}

export function crossingClue(puzzle: PublicPuzzle, state: GameState): PublicClue | undefined {
  return state.active ? clueAt(puzzle, state.active, otherDirection(state.direction)) : undefined
}

export function highlightedCells(puzzle: PublicPuzzle, state: GameState): ReadonlySet<string> {
  const clue = activeClue(puzzle, state)
  return new Set(clue ? slotCells(clue).map(cellKey) : [])
}

export function openCount(puzzle: PublicPuzzle): number {
  return puzzle.cells.reduce((total, line) => total + line.filter((cell) => !cell.block).length, 0)
}

export function filledCount(puzzle: PublicPuzzle, state: GameState): number {
  let count = 0
  state.grid.forEach((line, row) => {
    line.forEach((value, col) => {
      if (value !== null && isOpen(puzzle, { row, col })) count++
    })
  })
  return count
}

// --- Transitions -----------------------------------------------------------

function toggleDirection(puzzle: PublicPuzzle, state: GameState): GameState {
  if (!state.active) return state
  const other = otherDirection(state.direction)
  return clueAt(puzzle, state.active, other) ? { ...state, direction: other } : state
}

/** Sélectionne une case ; re-toucher la case active bascule la direction. */
function select(puzzle: PublicPuzzle, state: GameState, position: Position): GameState {
  if (!isOpen(puzzle, position)) return state
  if (samePosition(state.active, position)) return toggleDirection(puzzle, state)
  const resolved = resolveDirection(puzzle, position, state.direction)
  if (resolved === null) return state
  return { ...state, active: { row: position.row, col: position.col }, direction: resolved }
}

/** Sélectionne un mot : curseur sur sa première case vide (ou sa première case s'il est plein). */
function selectClue(
  puzzle: PublicPuzzle,
  state: GameState,
  clue: Pick<PublicClue, 'direction' | 'number'>,
): GameState {
  const target = puzzle.clues.find(
    (candidate) => candidate.direction === clue.direction && candidate.number === clue.number,
  )
  if (!target) return state
  const cells = slotCells(target)
  const start = cells.find((cell) => letterAt(state, cell) === null) ?? cells[0]
  if (!start) return state
  return { ...state, active: start, direction: target.direction }
}

function clueIndex(clues: readonly PublicClue[], clue: PublicClue | undefined): number {
  return clue
    ? clues.findIndex((c) => c.direction === clue.direction && c.number === clue.number)
    : -1
}

/** Mot suivant (`1`) ou précédent (`-1`) dans l'ordre de la liste, en boucle. */
function moveToClue(puzzle: PublicPuzzle, state: GameState, delta: 1 | -1): GameState {
  const clues = orderedClues(puzzle)
  if (clues.length === 0) return state
  const index = clueIndex(clues, activeClue(puzzle, state))
  const nextIndex =
    index === -1
      ? delta === 1
        ? 0
        : clues.length - 1
      : (index + delta + clues.length) % clues.length
  const next = clues[nextIndex]
  return next ? selectClue(puzzle, state, next) : state
}

function writeCell(state: GameState, position: Position, letter: string | null): GameState {
  if (letterAt(state, position) === letter) return state
  const key = cellKey(position)
  const marks = new Map(state.marks)
  marks.delete(key)
  const revealed = new Set(state.revealed)
  revealed.delete(key)
  return {
    ...state,
    grid: state.grid.map((line, row) =>
      row === position.row
        ? line.map((value, col) => (col === position.col ? letter : value))
        : line,
    ),
    marks,
    revealed,
    editCount: state.editCount + 1,
  }
}

/** Premier mot suivant (en boucle) qui contient encore une case vide. */
function moveToNextIncompleteClue(puzzle: PublicPuzzle, state: GameState): GameState {
  const clues = orderedClues(puzzle)
  const start = clueIndex(clues, activeClue(puzzle, state))
  for (let offset = 1; offset <= clues.length; offset++) {
    const candidate = clues[(start + offset + clues.length) % clues.length]
    if (candidate && slotCells(candidate).some((cell) => letterAt(state, cell) === null)) {
      return selectClue(puzzle, state, candidate)
    }
  }
  return state
}

/** Après une lettre : case suivante du mot ; en fin de mot, premier mot encore incomplet. */
function advance(puzzle: PublicPuzzle, state: GameState, from: Position): GameState {
  const next = stepInClue(puzzle, from, state.direction, 1)
  if (!samePosition(next, from)) return { ...state, active: next }
  return filledCount(puzzle, state) === openCount(puzzle)
    ? state
    : moveToNextIncompleteClue(puzzle, state)
}

/**
 * Saisie de texte (clavier, collage) : chaque lettre est normalisée par le moteur (accents
 * retirés, Œ → OE) puis écrite avec avance automatique. Les autres caractères sont ignorés.
 */
function input(puzzle: PublicPuzzle, state: GameState, text: string): GameState {
  if (state.locked) return state
  let next = state
  for (const char of text) {
    const letters = normalizeAnswer(char)
    if (letters === null || letters === '') continue
    for (const letter of letters) {
      const position = next.active
      if (!position) return next
      next = advance(puzzle, writeCell(next, position, letter), position)
    }
  }
  return next
}

/** Retour arrière : efface la case active si elle est remplie, sinon recule et efface. */
function backspace(puzzle: PublicPuzzle, state: GameState): GameState {
  if (state.locked || !state.active) return state
  const current = state.active
  if (letterAt(state, current) !== null) return writeCell(state, current, null)
  const previous = stepInClue(puzzle, current, state.direction, -1)
  if (samePosition(previous, current)) return state
  return writeCell({ ...state, active: previous }, previous, null)
}

function applyChecks(
  state: GameState,
  cells: readonly { row: number; col: number; result: 'correct' | 'incorrect' | 'empty' }[],
): GameState {
  const marks = new Map(state.marks)
  for (const cell of cells) {
    const key = cellKey(cell)
    if (cell.result === 'empty') marks.delete(key)
    else marks.set(key, cell.result)
  }
  return { ...state, marks }
}

/** Écrit les lettres révélées par un indice et les signale comme telles. */
function applyRevealed(
  puzzle: PublicPuzzle,
  state: GameState,
  cells: readonly { row: number; col: number; letter: string }[],
): GameState {
  if (cells.length === 0) return state
  const grid = state.grid.map((line) => [...line])
  const revealed = new Set(state.revealed)
  const marks = new Map(state.marks)
  for (const cell of cells) {
    const line = grid[cell.row]
    if (!isOpen(puzzle, cell) || !line) continue
    line[cell.col] = cell.letter
    revealed.add(cellKey(cell))
    marks.delete(cellKey(cell))
  }
  return { ...state, grid, revealed, marks }
}

export function gameReducer(puzzle: PublicPuzzle, state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'select':
      return select(puzzle, state, action.position)
    case 'selectClue':
      return selectClue(puzzle, state, action.clue)
    case 'toggleDirection':
      return toggleDirection(puzzle, state)
    case 'moveToClue':
      return moveToClue(puzzle, state, action.delta)
    case 'input':
      return input(puzzle, state, action.text)
    case 'backspace':
      return backspace(puzzle, state)
    case 'load':
      // Grille du serveur (reprise, conflit, indice) : ce n'est pas une édition du joueur.
      return { ...state, grid: copyGrid(puzzle, action.grid) }
    case 'checked':
      return applyChecks(state, action.cells)
    case 'revealed':
      return applyRevealed(puzzle, state, action.cells)
    case 'lock':
      return state.locked === action.locked ? state : { ...state, locked: action.locked }
  }
}
