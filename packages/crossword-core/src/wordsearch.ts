import type { Direction, Position, Puzzle } from './types.js'

/**
 * Mode « grille pré-remplie » (façon mots mêlés) : les réponses d'un puzzle sont cachées dans
 * une grille entièrement remplie de lettres. Le joueur lit une définition, retrouve le mot et
 * le surligne. La disposition est déterministe pour un couple (puzzle, graine) : le serveur
 * peut valider une sélection sans rien stocker.
 */

/** Pas d'un tracé : ligne, colonne (chaque composante vaut -1, 0 ou 1). */
export interface WordSearchStep {
  readonly dr: -1 | 0 | 1
  readonly dc: -1 | 0 | 1
}

export interface WordSearchOptions {
  readonly seed: number
  /** Autorise les diagonales (descendantes vers la droite et vers la gauche). */
  readonly diagonals: boolean
  /** Autorise les mots écrits à l'envers (de droite à gauche, de bas en haut). */
  readonly reversed: boolean
}

export interface WordSearchPlacement {
  /** Définition du puzzle d'origine dont c'est la réponse. */
  readonly direction: Direction
  readonly number: number
  readonly answer: string
  readonly start: Position
  readonly end: Position
}

export interface WordSearch {
  readonly size: number
  /** Une chaîne de `size` lettres par ligne. */
  readonly rows: readonly string[]
  /** Usage serveur : révèle où se trouve chaque réponse. */
  readonly placements: readonly WordSearchPlacement[]
}

export const WORD_SEARCH_MAX_SIZE = 18
const MIN_SIZE = 8
/** Part visée des cases occupées par les réponses (le reste est du remplissage). */
const DENSITY = 0.55
const ATTEMPTS_PER_WORD = 400

/** Lettres de remplissage pondérées comme le français : les mots ne se repèrent pas aux lettres rares. */
const FILLER = 'EEEEEEEAAAAASSSSIIIIINNNNTTTTRRRRUUUULLLOOODDDCCMMPPGBVHFQ'

const FORWARD: readonly WordSearchStep[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
]
const DIAGONAL: readonly WordSearchStep[] = [
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
]

/** Générateur pseudo-aléatoire reproductible (mulberry32) : pas de cryptographie ici. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mélange la graine avec l'identifiant du puzzle (FNV-1a) : même graine, grilles différentes. */
function mixSeed(seed: number, id: string): number {
  let hash = 0x811c9dc5 ^ (seed >>> 0)
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193)
  }
  return hash >>> 0
}

export function wordSearchSteps(options: Omit<WordSearchOptions, 'seed'>): WordSearchStep[] {
  const base = options.diagonals ? [...FORWARD, ...DIAGONAL] : [...FORWARD]
  if (!options.reversed) return base
  return [
    ...base,
    ...base.map((s) => ({ dr: -s.dr as WordSearchStep['dr'], dc: -s.dc as WordSearchStep['dc'] })),
  ]
}

/** Réponse d'une définition, lue dans la solution du puzzle. */
function answers(puzzle: Puzzle): { direction: Direction; number: number; answer: string }[] {
  return puzzle.clues.map((clue) => ({
    direction: clue.direction,
    number: clue.number,
    answer: clue.slot.cells
      .map(({ row, col }) => {
        const cell = puzzle.cells[row]?.[col]
        return cell && !cell.block ? cell.solution : ''
      })
      .join(''),
  }))
}

function initialSize(words: readonly string[]): number {
  const longest = Math.max(...words.map((w) => w.length))
  const letters = words.reduce((sum, w) => sum + w.length, 0)
  return Math.min(
    WORD_SEARCH_MAX_SIZE,
    Math.max(MIN_SIZE, longest, Math.ceil(Math.sqrt(letters / DENSITY))),
  )
}

/** Tente de placer tous les mots dans une grille `size × size` ; `null` en cas d'échec. */
function tryPlace(
  words: readonly { direction: Direction; number: number; answer: string }[],
  size: number,
  steps: readonly WordSearchStep[],
  next: () => number,
): { grid: (string | null)[][]; placements: WordSearchPlacement[] } | null {
  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array<string | null>(size).fill(null),
  )
  const placements: WordSearchPlacement[] = []
  for (const word of words) {
    const length = word.answer.length
    let placed = false
    for (let attempt = 0; attempt < ATTEMPTS_PER_WORD && !placed; attempt++) {
      const step = steps[Math.floor(next() * steps.length)] ?? { dr: 0, dc: 1 }
      const row = Math.floor(next() * size)
      const col = Math.floor(next() * size)
      const endRow = row + step.dr * (length - 1)
      const endCol = col + step.dc * (length - 1)
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue
      // Un croisement n'est permis que sur une lettre identique (comme dans les mots mêlés).
      let fits = true
      for (let i = 0; i < length && fits; i++) {
        const current = grid[row + step.dr * i]?.[col + step.dc * i]
        if (current !== null && current !== word.answer[i]) fits = false
      }
      if (!fits) continue
      for (let i = 0; i < length; i++) {
        const line = grid[row + step.dr * i]
        if (line) line[col + step.dc * i] = word.answer[i] ?? null
      }
      placements.push({
        direction: word.direction,
        number: word.number,
        answer: word.answer,
        start: { row, col },
        end: { row: endRow, col: endCol },
      })
      placed = true
    }
    if (!placed) return null
  }
  return { grid, placements }
}

/**
 * Construit la grille pré-remplie d'un puzzle. Les mots les plus longs sont placés d'abord ;
 * si l'un d'eux ne trouve pas de place, la grille grandit d'une case et l'on recommence.
 */
export function buildWordSearch(puzzle: Puzzle, options: WordSearchOptions): WordSearch {
  const words = answers(puzzle).sort((a, b) => b.answer.length - a.answer.length)
  const steps = wordSearchSteps(options)
  const next = random(mixSeed(options.seed, puzzle.id))
  for (let size = initialSize(words.map((w) => w.answer)); size <= WORD_SEARCH_MAX_SIZE; size++) {
    const result = tryPlace(words, size, steps, next)
    if (!result) continue
    const rows = result.grid.map((line) =>
      line.map((letter) => letter ?? FILLER[Math.floor(next() * FILLER.length)] ?? 'E').join(''),
    )
    const placements = [...result.placements].sort((a, b) =>
      a.direction === b.direction ? a.number - b.number : a.direction === 'across' ? -1 : 1,
    )
    return { size, rows, placements }
  }
  throw new RangeError(
    `Puzzle ${puzzle.id} : réponses trop nombreuses pour une grille pré-remplie.`,
  )
}

const samePosition = (a: Position, b: Position): boolean => a.row === b.row && a.col === b.col

/**
 * Réponse surlignée par une sélection, dans un sens ou dans l'autre ; `undefined` sinon.
 * Une réponse peut apparaître par hasard ailleurs dans le remplissage : une sélection dont les
 * lettres forment exactement une réponse est donc acceptée elle aussi, à l'endroit choisi.
 * `alreadyFound` départage deux définitions de même réponse : la non trouvée est préférée.
 */
export function findPlacement(
  search: WordSearch,
  from: Position,
  to: Position,
  alreadyFound: (placement: WordSearchPlacement) => boolean = () => false,
): WordSearchPlacement | undefined {
  const cells = lineCells(from, to)
  if (!cells || cells.length < 2) return undefined
  const letters = cells.map(({ row, col }) => search.rows[row]?.[col] ?? '?').join('')
  // Réponses normalisées en A–Z (normalizeAnswer) : découper caractère par caractère est sûr.
  const backwards = letters.split('').reverse().join('')
  const isExact = (p: WordSearchPlacement): boolean =>
    (samePosition(p.start, from) && samePosition(p.end, to)) ||
    (samePosition(p.start, to) && samePosition(p.end, from))
  // Emplacements prévus d'abord, puis occurrences fortuites ; une définition non trouvée l'emporte.
  const candidates = search.placements
    .filter((p) => p.answer === letters || p.answer === backwards)
    .sort((a, b) => Number(isExact(b)) - Number(isExact(a)))
  const match = candidates.find((p) => !alreadyFound(p)) ?? candidates[0]
  if (!match) return undefined
  if (isExact(match)) return match
  return match.answer === letters
    ? { ...match, start: from, end: to }
    : { ...match, start: to, end: from }
}

/**
 * Cases d'un tracé rectiligne de `from` à `to` (horizontal, vertical ou diagonal à 45°).
 * Renvoie `null` si les deux cases ne sont pas alignées : l'interface n'envoie alors rien.
 */
export function lineCells(from: Position, to: Position): Position[] | null {
  const dr = to.row - from.row
  const dc = to.col - from.col
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null
  const length = Math.max(Math.abs(dr), Math.abs(dc)) + 1
  const stepRow = Math.sign(dr)
  const stepCol = Math.sign(dc)
  return Array.from({ length }, (_, i) => ({
    row: from.row + stepRow * i,
    col: from.col + stepCol * i,
  }))
}

/**
 * Case d'arrivée la plus proche alignée avec `from` : pendant un glisser, le doigt n'est jamais
 * parfaitement sur la diagonale. On projette sur la direction autorisée la plus proche.
 */
export function snapToLine(from: Position, to: Position): Position {
  const dr = to.row - from.row
  const dc = to.col - from.col
  if (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) return to
  const angle = Math.atan2(dr, dc)
  const octant = Math.round(angle / (Math.PI / 4))
  const stepRow = Math.round(Math.sin((octant * Math.PI) / 4))
  const stepCol = Math.round(Math.cos((octant * Math.PI) / 4))
  const length =
    stepRow !== 0 && stepCol !== 0
      ? Math.min(Math.abs(dr), Math.abs(dc))
      : Math.max(Math.abs(dr), Math.abs(dc))
  return { row: from.row + stepRow * length, col: from.col + stepCol * length }
}
