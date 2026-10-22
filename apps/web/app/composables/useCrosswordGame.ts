/**
 * État de jeu local d'une grille : sélection, direction, saisie, tracé et marques de
 * vérification. Composable pur (Vue réactif uniquement, aucun appel réseau ni DOM) afin
 * d'être testé sans navigateur. Il ne connaît jamais la solution : les résultats de
 * vérification et les lettres révélées viennent du serveur via `applyChecks`/`applyRevealed`.
 */
import { computed, ref, shallowRef } from 'vue'
import type { UnwrapNestedRefs } from 'vue'
import {
  clueAt,
  clueFromDrag,
  normalizeAnswer,
  resolveDirection,
  slotCells,
  stepInClue,
} from '@crossverse/crossword-core'
import type { Direction, Position, PublicClue, PublicPuzzle } from '@crossverse/crossword-core'

export type CellMark = 'correct' | 'incorrect'
export type EditableGrid = (string | null)[][]

export const cellKey = (position: Position): string => `${position.row}:${position.col}`

const samePosition = (a: Position | null, b: Position | null): boolean =>
  a !== null && b !== null && a.row === b.row && a.col === b.col

const otherDirection = (direction: Direction): Direction =>
  direction === 'across' ? 'down' : 'across'

/** Ordre de parcours des mots pour Tab : horizontaux puis verticaux, par numéro. */
function orderedClues(puzzle: PublicPuzzle): PublicClue[] {
  const rank = (clue: PublicClue): number => (clue.direction === 'across' ? 0 : 1)
  return [...puzzle.clues].sort((a, b) => rank(a) - rank(b) || a.number - b.number)
}

function emptyGrid(puzzle: PublicPuzzle): EditableGrid {
  return Array.from({ length: puzzle.height }, () =>
    Array.from({ length: puzzle.width }, () => null),
  )
}

/** Copie une grille reçue en ne gardant que des lettres sur les cases ouvertes. */
function copyGrid(puzzle: PublicPuzzle, source: readonly (readonly (string | null)[])[]) {
  return emptyGrid(puzzle).map((line, row) =>
    line.map((_, col) => {
      if (puzzle.cells[row]?.[col]?.block !== false) return null
      const value = source[row]?.[col] ?? null
      return value === null || value === '' ? null : value
    }),
  )
}

export interface CrosswordGameOptions {
  readonly initialGrid?: readonly (readonly (string | null)[])[]
}

export function useCrosswordGame(puzzle: PublicPuzzle, options: CrosswordGameOptions = {}) {
  const clues = orderedClues(puzzle)

  const grid = shallowRef<EditableGrid>(
    options.initialGrid ? copyGrid(puzzle, options.initialGrid) : emptyGrid(puzzle),
  )
  const active = ref<Position | null>(null)
  const direction = ref<Direction>('across')
  /** Résultats de la dernière vérification serveur, effacés quand la case change. */
  const marks = shallowRef<ReadonlyMap<string, CellMark>>(new Map())
  /** Cases dont la lettre a été révélée par un indice (affichage distinct). */
  const revealed = shallowRef<ReadonlySet<string>>(new Set())
  /** Saisie bloquée (partie terminée, requête d'indice en cours…). */
  const locked = ref(false)
  /** Incrémenté à chaque modification de lettre par le joueur : déclenche la sauvegarde. */
  const editCount = ref(0)

  const isOpen = (position: Position): boolean =>
    puzzle.cells[position.row]?.[position.col]?.block === false

  const letterAt = (position: Position): string | null =>
    grid.value[position.row]?.[position.col] ?? null

  const activeClue = computed<PublicClue | undefined>(() =>
    active.value ? clueAt(puzzle, active.value, direction.value) : undefined,
  )

  const crossingClue = computed<PublicClue | undefined>(() =>
    active.value ? clueAt(puzzle, active.value, otherDirection(direction.value)) : undefined,
  )

  const highlighted = computed<ReadonlySet<string>>(() => {
    const clue = activeClue.value
    return new Set(clue ? slotCells(clue).map(cellKey) : [])
  })

  const filledCount = computed(() => {
    let count = 0
    grid.value.forEach((line, row) => {
      line.forEach((value, col) => {
        if (value !== null && isOpen({ row, col })) count++
      })
    })
    return count
  })

  const openCount = puzzle.cells.reduce(
    (total, line) => total + line.filter((cell) => !cell.block).length,
    0,
  )

  const isFull = computed(() => filledCount.value === openCount)

  // --- Sélection ---------------------------------------------------------

  function firstOpenCell(): Position | null {
    const first = clues[0]
    return first ? { row: first.row, col: first.col } : null
  }

  /** Sélectionne une case ; re-sélectionner la case active bascule la direction. */
  function select(position: Position): void {
    if (!isOpen(position)) return
    if (samePosition(active.value, position)) {
      toggleDirection()
      return
    }
    const resolved = resolveDirection(puzzle, position, direction.value)
    if (resolved === null) return
    active.value = { row: position.row, col: position.col }
    direction.value = resolved
  }

  /** Bascule horizontal/vertical si la case active appartient aussi à un mot dans l'autre sens. */
  function toggleDirection(): void {
    if (!active.value) return
    const other = otherDirection(direction.value)
    if (clueAt(puzzle, active.value, other)) direction.value = other
  }

  /** Sélectionne un mot : curseur sur sa première case vide (ou sa première case s'il est plein). */
  function selectClue(clue: Pick<PublicClue, 'direction' | 'number'>): void {
    const target = puzzle.clues.find(
      (candidate) => candidate.direction === clue.direction && candidate.number === clue.number,
    )
    if (!target) return
    const cells = slotCells(target)
    const start = cells.find((cell) => letterAt(cell) === null) ?? cells[0]
    if (!start) return
    active.value = start
    direction.value = target.direction
  }

  /** Mot suivant (`1`) ou précédent (`-1`) dans l'ordre de la liste, en boucle. */
  function moveToClue(delta: 1 | -1): void {
    if (clues.length === 0) return
    const current = activeClue.value
    const index = current
      ? clues.findIndex((c) => c.direction === current.direction && c.number === current.number)
      : -1
    const nextIndex =
      index === -1
        ? delta === 1
          ? 0
          : clues.length - 1
        : (index + delta + clues.length) % clues.length
    const next = clues[nextIndex]
    if (next) selectClue(next)
  }

  /**
   * Flèches : déplace vers la prochaine case ouverte dans le sens indiqué (en sautant
   * les cases noires) et aligne la direction sur l'axe de la flèche quand c'est possible.
   */
  function move(deltaRow: -1 | 0 | 1, deltaCol: -1 | 0 | 1): void {
    const axis: Direction = deltaRow === 0 ? 'across' : 'down'
    if (!active.value) {
      const first = firstOpenCell()
      if (first) select(first)
      return
    }
    let row = active.value.row + deltaRow
    let col = active.value.col + deltaCol
    while (row >= 0 && row < puzzle.height && col >= 0 && col < puzzle.width) {
      const position = { row, col }
      if (isOpen(position)) {
        active.value = position
        direction.value = resolveDirection(puzzle, position, axis) ?? direction.value
        return
      }
      row += deltaRow
      col += deltaCol
    }
    // Bord de grille atteint : on aligne au moins la direction sur la flèche.
    if (clueAt(puzzle, active.value, axis)) direction.value = axis
  }

  // --- Saisie ------------------------------------------------------------

  function writeCell(position: Position, letter: string | null): void {
    if (letterAt(position) === letter) return
    grid.value = grid.value.map((line, row) =>
      row === position.row
        ? line.map((value, col) => (col === position.col ? letter : value))
        : line,
    )
    const key = cellKey(position)
    if (marks.value.has(key)) {
      const next = new Map(marks.value)
      next.delete(key)
      marks.value = next
    }
    if (revealed.value.has(key)) {
      const next = new Set(revealed.value)
      next.delete(key)
      revealed.value = next
    }
    editCount.value++
  }

  /** Après une lettre : case suivante du mot ; en fin de mot, première case vide du mot suivant. */
  function advance(from: Position): void {
    const next = stepInClue(puzzle, from, direction.value, 1)
    if (!samePosition(next, from)) {
      active.value = next
      return
    }
    if (!isFull.value) moveToNextIncompleteClue()
  }

  /** Premier mot suivant (en boucle) qui contient encore une case vide. */
  function moveToNextIncompleteClue(): void {
    const current = activeClue.value
    const start = current
      ? clues.findIndex((c) => c.direction === current.direction && c.number === current.number)
      : -1
    for (let offset = 1; offset <= clues.length; offset++) {
      const candidate = clues[(start + offset + clues.length) % clues.length]
      if (candidate && slotCells(candidate).some((cell) => letterAt(cell) === null)) {
        selectClue(candidate)
        return
      }
    }
  }

  /**
   * Saisie de texte (clavier physique, clavier virtuel, collage) : chaque lettre est
   * normalisée par le moteur (accents retirés, Œ → OE) puis écrite avec avance automatique.
   * Les caractères non alphabétiques sont ignorés. Renvoie le nombre de lettres écrites.
   */
  const currentActive = (): Position | null => active.value

  function input(text: string): number {
    if (locked.value || !active.value) return 0
    let written = 0
    for (const char of text) {
      const letters = normalizeAnswer(char)
      if (letters === null || letters === '') continue
      for (const letter of letters) {
        // Relu à chaque lettre : `advance` déplace le curseur (fonction, pas de narrowing TS).
        const position = currentActive()
        if (!position) return written
        writeCell(position, letter)
        written++
        advance(position)
      }
    }
    return written
  }

  /** Retour arrière : efface la case active si elle est remplie, sinon recule et efface. */
  function backspace(): void {
    if (locked.value || !active.value) return
    const current = active.value
    if (letterAt(current) !== null) {
      writeCell(current, null)
      return
    }
    const previous = stepInClue(puzzle, current, direction.value, -1)
    if (samePosition(previous, current)) return
    active.value = previous
    writeCell(previous, null)
  }

  /** Suppr : efface la case active sans déplacer le curseur. */
  function clearActive(): void {
    if (locked.value || !active.value) return
    writeCell(active.value, null)
  }

  // --- Tracé par glissement ----------------------------------------------

  const dragStart = ref<Position | null>(null)
  const dragCurrent = ref<Position | null>(null)
  const dragged = ref(false)

  /** Mot couvert par le tracé en cours (aperçu), s'il est valide. */
  const dragClue = computed<PublicClue | undefined>(() =>
    dragStart.value && dragCurrent.value && dragged.value
      ? clueFromDrag(puzzle, dragStart.value, dragCurrent.value)
      : undefined,
  )

  const dragPreview = computed<ReadonlySet<string>>(() => {
    const clue = dragClue.value
    return new Set(clue ? slotCells(clue).map(cellKey) : [])
  })

  function pointerStart(position: Position): void {
    if (!isOpen(position)) {
      dragStart.value = null
      return
    }
    dragStart.value = position
    dragCurrent.value = position
    dragged.value = false
  }

  function pointerMove(position: Position): void {
    if (!dragStart.value) return
    if (!samePosition(dragCurrent.value, position)) dragCurrent.value = position
    if (!samePosition(dragStart.value, position)) dragged.value = true
  }

  /**
   * Fin de geste. Sans déplacement : simple sélection (re-toucher = changer de direction).
   * Avec tracé aligné sur un mot : sélection de ce mot, curseur sur la case de départ.
   * Renvoie `true` si le geste a changé la sélection.
   */
  function pointerEnd(): boolean {
    const start = dragStart.value
    const clue = dragClue.value
    const wasDragged = dragged.value
    pointerCancel()
    if (!start) return false
    if (!wasDragged) {
      select(start)
      return true
    }
    if (!clue) return false
    active.value = start
    direction.value = clue.direction
    return true
  }

  function pointerCancel(): void {
    dragStart.value = null
    dragCurrent.value = null
    dragged.value = false
  }

  // --- Données serveur ---------------------------------------------------

  /** Remplace la grille par celle du serveur (reprise, conflit, indice) sans compter d'édition. */
  function loadGrid(source: readonly (readonly (string | null)[])[]): void {
    grid.value = copyGrid(puzzle, source)
  }

  function applyChecks(
    cells: readonly { row: number; col: number; result: 'correct' | 'incorrect' | 'empty' }[],
  ): void {
    const next = new Map(marks.value)
    for (const cell of cells) {
      const key = cellKey(cell)
      if (cell.result === 'empty') next.delete(key)
      else next.set(key, cell.result)
    }
    marks.value = next
  }

  function clearMarks(): void {
    marks.value = new Map()
  }

  /** Écrit les lettres révélées par un indice et les signale comme telles. */
  function applyRevealed(cells: readonly { row: number; col: number; letter: string }[]): void {
    if (cells.length === 0) return
    const nextGrid = grid.value.map((line) => [...line])
    const nextRevealed = new Set(revealed.value)
    const nextMarks = new Map(marks.value)
    for (const cell of cells) {
      if (!isOpen(cell)) continue
      const line = nextGrid[cell.row]
      if (!line) continue
      line[cell.col] = cell.letter
      nextRevealed.add(cellKey(cell))
      nextMarks.delete(cellKey(cell))
    }
    grid.value = nextGrid
    revealed.value = nextRevealed
    marks.value = nextMarks
  }

  function snapshot(): EditableGrid {
    return grid.value.map((line) => [...line])
  }

  return {
    puzzle,
    clues,
    grid,
    active,
    direction,
    activeClue,
    crossingClue,
    highlighted,
    marks,
    revealed,
    locked,
    editCount,
    filledCount,
    openCount,
    isFull,
    dragPreview,
    letterAt,
    isOpen,
    select,
    selectClue,
    toggleDirection,
    moveToClue,
    move,
    input,
    backspace,
    clearActive,
    pointerStart,
    pointerMove,
    pointerEnd,
    pointerCancel,
    loadGrid,
    applyChecks,
    clearMarks,
    applyRevealed,
    snapshot,
  }
}

export type CrosswordGame = ReturnType<typeof useCrosswordGame>

/** Forme réactive (refs déballées) utilisée par les composants. */
export type ReactiveCrosswordGame = UnwrapNestedRefs<CrosswordGame>
