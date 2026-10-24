import { computed, reactive, ref, shallowRef } from 'vue'
import { lineCells, snapToLine, type Position } from '@crossverse/crossword-core'
import type {
  WordSearchClue,
  WordSearchClueRef,
  WordSearchDto,
  WordSearchHit,
} from '@crossverse/contracts'

/**
 * État d'interface d'une grille pré-remplie : curseur clavier, début de sélection, mots trouvés.
 * Aucune règle officielle ici : savoir si une sélection est un mot appartient au serveur.
 */

export const clueKey = (clue: WordSearchClueRef): string =>
  `${clue.direction}:${String(clue.number)}`

export interface FoundWord extends WordSearchHit {
  /** Montré par « Où est-il ? » plutôt que trouvé par le joueur. */
  readonly revealed: boolean
  /** Rang d'apparition : choisit la couleur du surlignage. */
  readonly order: number
}

export interface Selection {
  readonly from: Position
  readonly to: Position
}

const samePosition = (a: Position, b: Position): boolean => a.row === b.row && a.col === b.col

export function useWordSearchGame(data: WordSearchDto) {
  const size = data.size
  const clamp = (value: number): number => Math.min(size - 1, Math.max(0, value))

  const cursor = ref<Position>({ row: 0, col: 0 })
  /** Première case d'une sélection en cours (tap, clavier ou début de glisser). */
  const anchor = shallowRef<Position | null>(null)
  /** Case visée pendant la sélection : la ligne d'aperçu va de `anchor` à elle. */
  const target = shallowRef<Position | null>(null)
  const found = reactive(new Map<string, FoundWord>())
  /** Définition choisie dans la liste : simple repère visuel, aucune contrainte. */
  const activeClue = shallowRef<WordSearchClue | null>(null)

  const letterAt = (position: Position): string => data.rows[position.row]?.[position.col] ?? ''

  /** Cases de l'aperçu, ramenées sur la direction alignée la plus proche. */
  const preview = computed<Position[]>(() => {
    const start = anchor.value
    if (!start) return []
    const end = target.value ? snapToLine(start, target.value) : start
    return lineCells(start, { row: clamp(end.row), col: clamp(end.col) }) ?? [start]
  })

  const previewEnd = computed<Position | null>(() => preview.value.at(-1) ?? null)

  const foundRefs = computed<WordSearchClueRef[]>(() =>
    [...found.values()].map(({ direction, number }) => ({ direction, number })),
  )
  const foundCount = computed(() => [...found.values()].filter((w) => !w.revealed).length)
  const complete = computed(() => found.size === data.clues.length)

  function moveCursor(dr: number, dc: number): void {
    cursor.value = { row: clamp(cursor.value.row + dr), col: clamp(cursor.value.col + dc) }
    if (anchor.value) target.value = cursor.value
  }

  function setCursor(position: Position): void {
    cursor.value = { row: clamp(position.row), col: clamp(position.col) }
  }

  function cancel(): void {
    anchor.value = null
    target.value = null
  }

  /** Commence une sélection (début de glisser ou premier tap). */
  function begin(position: Position): void {
    setCursor(position)
    anchor.value = cursor.value
    target.value = cursor.value
  }

  function aim(position: Position): void {
    if (!anchor.value) return
    target.value = { row: clamp(position.row), col: clamp(position.col) }
  }

  /**
   * Termine la sélection en cours. Renvoie le tracé à soumettre, ou `null` si la sélection
   * ne couvre qu'une case (le joueur doit encore choisir la dernière lettre).
   */
  function finish(): Selection | null {
    const start = anchor.value
    const end = previewEnd.value
    if (!start || !end || samePosition(start, end)) return null
    cancel()
    return { from: start, to: end }
  }

  /**
   * Tap ou touche Entrée sur une case : le premier choisit la première lettre, le second la
   * dernière. Un second tap sur la même case annule la sélection.
   */
  function press(position: Position): Selection | null {
    const start = anchor.value
    if (!start) {
      begin(position)
      return null
    }
    if (samePosition(start, position)) {
      cancel()
      return null
    }
    aim(position)
    setCursor(position)
    return finish()
  }

  function addHit(hit: WordSearchHit, revealed = false): boolean {
    const key = clueKey(hit)
    if (found.has(key)) return false
    found.set(key, { ...hit, revealed, order: found.size })
    return true
  }

  function isFound(clue: WordSearchClueRef): boolean {
    return found.has(clueKey(clue))
  }

  function selectClue(clue: WordSearchClue | null): void {
    activeClue.value = clue
  }

  return reactive({
    data,
    size,
    cursor,
    anchor,
    target,
    preview,
    found,
    foundRefs,
    foundCount,
    complete,
    activeClue,
    letterAt,
    moveCursor,
    setCursor,
    begin,
    aim,
    finish,
    press,
    cancel,
    addHit,
    isFound,
    selectClue,
  })
}

export type WordSearchGame = ReturnType<typeof useWordSearchGame>
