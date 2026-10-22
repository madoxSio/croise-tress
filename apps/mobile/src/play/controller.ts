/**
 * Orchestration réseau d'une partie solo : chargement ou reprise, sauvegarde automatique
 * différée avec révision, vérifications et indices. Classe TypeScript pure (ni React ni
 * React Native) : l'écran s'y abonne avec `useSyncExternalStore`, les tests la pilotent
 * directement. Le score et la fin de partie viennent exclusivement du serveur.
 */
import type { CheckBody, HintBody, PlaySessionDto, PublicPuzzleDto } from '@crossverse/contracts'
import type { PublicPuzzle } from '@crossverse/crossword-core'
import type { ApiClient } from '../api/client'
import { ApiRequestError, errorMessage } from '../api/errors'
import { gridMatches, toEnginePuzzle } from '../game/puzzle'
import {
  activeClue,
  gameReducer,
  initialState,
  type GameAction,
  type GameState,
} from '../game/state'

export const AUTOSAVE_DELAY_MS = 800
const RETRY_DELAY_MS = 4000
const CONFLICT_MESSAGE = 'La partie a été modifiée ailleurs : la grille a été rechargée.'

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
export type CheckScope = 'cell' | 'word' | 'grid'
export type HintKind = 'letter' | 'word' | 'explain' | 'solution'

export interface PlaySnapshot {
  readonly loading: boolean
  readonly loadError: string | null
  readonly notFound: boolean
  readonly details: PublicPuzzleDto | null
  readonly puzzle: PublicPuzzle | null
  readonly session: PlaySessionDto | null
  readonly game: GameState | null
  readonly saveState: SaveState
  /** Message d'état annoncé aux lecteurs d'écran (résultat de vérification, conflit…). */
  readonly notice: string | null
  readonly actionError: string | null
  readonly explanation: { readonly label: string; readonly text: string } | null
  readonly busy: boolean
}

type PlayApi = Pick<
  ApiClient,
  'ensureSession' | 'getPuzzle' | 'startPlay' | 'getPlay' | 'saveGrid' | 'check' | 'hint'
>

const INITIAL: PlaySnapshot = {
  loading: true,
  loadError: null,
  notFound: false,
  details: null,
  puzzle: null,
  session: null,
  game: null,
  saveState: 'idle',
  notice: null,
  actionError: null,
  explanation: null,
  busy: false,
}

export class PlayController {
  private snapshot: PlaySnapshot = INITIAL
  private readonly listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<void> | null = null
  private dirty = false

  constructor(
    private readonly api: PlayApi,
    private readonly puzzleId: string,
  ) {}

  // --- Abonnement (contrat de useSyncExternalStore) --------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): PlaySnapshot => this.snapshot

  private update(patch: Partial<PlaySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  private get completed(): boolean {
    return this.snapshot.session?.status === 'completed'
  }

  // --- Saisie ------------------------------------------------------------------

  /** Action de jeu locale ; toute modification de lettre programme une sauvegarde. */
  readonly dispatch = (action: GameAction): void => {
    const { puzzle, game } = this.snapshot
    if (!puzzle || !game) return
    const next = gameReducer(puzzle, game, action)
    if (next === game) return
    this.update({ game: next })
    if (next.editCount !== game.editCount) this.schedule()
  }

  // --- Cycle de vie --------------------------------------------------------------

  async load(): Promise<void> {
    this.update({ loading: true, loadError: null, notFound: false })
    try {
      await this.api.ensureSession()
      const [dto, play] = await Promise.all([
        this.api.getPuzzle(this.puzzleId),
        this.api.startPlay(this.puzzleId),
      ])
      const puzzle = toEnginePuzzle(dto)
      if (!gridMatches(puzzle, play.grid)) {
        throw new ApiRequestError(0, 'invalid_response', 'La partie enregistrée est illisible.')
      }
      this.update({
        details: dto,
        puzzle,
        game: { ...initialState(puzzle, play.grid), locked: play.status === 'completed' },
        session: play,
        saveState: 'saved',
      })
    } catch (error) {
      const notFound = error instanceof ApiRequestError && error.isNotFound
      this.update({
        notFound,
        loadError: notFound ? 'Cette grille est introuvable.' : errorMessage(error),
      })
    } finally {
      this.update({ loading: false })
    }
  }

  /** Écran quitté ou app passée en arrière-plan : on n'abandonne pas la saisie en attente. */
  dispose(): Promise<void> {
    return this.dirty ? this.flush() : Promise.resolve()
  }

  clearNotice(): void {
    this.update({ notice: null, actionError: null })
  }

  clearExplanation(): void {
    this.update({ explanation: null })
  }

  // --- Sauvegarde ----------------------------------------------------------------

  private adopt(next: PlaySessionDto, options: { replaceGrid: boolean }): void {
    const { puzzle } = this.snapshot
    let game = this.snapshot.game
    if (puzzle && game && (options.replaceGrid || next.status === 'completed')) {
      game = gameReducer(puzzle, game, { type: 'load', grid: next.grid })
    }
    if (next.status === 'completed') {
      this.dirty = false
      this.clearTimer()
      if (game) game = { ...game, locked: true }
    }
    this.update({ session: next, game })
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(delay = AUTOSAVE_DELAY_MS): void {
    if (this.completed) return
    this.dirty = true
    this.update({ saveState: 'pending' })
    this.clearTimer()
    this.timer = setTimeout(() => {
      void this.flush()
    }, delay)
  }

  /** Recharge la session serveur après un conflit de révision (autre appareil, partie finie). */
  private async reload(message: string): Promise<void> {
    const current = this.snapshot.session
    if (!current) return
    try {
      this.adopt(await this.api.getPlay(current.id), { replaceGrid: true })
      this.dirty = false
      this.update({ saveState: 'saved', notice: message })
    } catch (error) {
      this.update({ saveState: 'error', actionError: errorMessage(error) })
    }
  }

  /** Envoie immédiatement la sauvegarde en attente (et attend celle déjà en cours). */
  async flush(): Promise<void> {
    this.clearTimer()
    if (this.inFlight) await this.inFlight
    const { session, game } = this.snapshot
    if (!this.dirty || !session || !game || this.completed) return
    this.dirty = false
    this.update({ saveState: 'saving' })
    this.inFlight = (async () => {
      try {
        const next = await this.api.saveGrid(session.id, {
          grid: game.grid.map((line) => [...line]),
          revision: session.revision,
        })
        // La grille locale peut être plus récente que celle envoyée : on ne garde que la révision.
        this.adopt(next, { replaceGrid: false })
        this.update({ saveState: this.dirty ? 'pending' : 'saved' })
      } catch (error) {
        if (error instanceof ApiRequestError && error.isConflict) {
          await this.reload(CONFLICT_MESSAGE)
          return
        }
        this.update({ saveState: 'error', actionError: errorMessage(error) })
        this.schedule(RETRY_DELAY_MS)
      } finally {
        this.inFlight = null
      }
    })()
    await this.inFlight
  }

  // --- Vérifications et indices ----------------------------------------------------

  /** Exécute une action serveur en bloquant la saisie pour garder grille et révision cohérentes. */
  private async withLock(action: () => Promise<void>): Promise<void> {
    if (!this.snapshot.game || this.snapshot.busy || this.completed) return
    this.update({ busy: true, actionError: null })
    this.dispatch({ type: 'lock', locked: true })
    try {
      await action()
    } catch (error) {
      if (error instanceof ApiRequestError && error.isConflict) {
        await this.reload(CONFLICT_MESSAGE)
      } else {
        this.update({ actionError: errorMessage(error) })
      }
    } finally {
      this.update({ busy: false })
      this.dispatch({ type: 'lock', locked: this.completed })
    }
  }

  check(scope: CheckScope): Promise<void> {
    return this.withLock(async () => {
      // Une vérification enregistre aussi la grille : on attend la sauvegarde en cours.
      this.clearTimer()
      if (this.inFlight) await this.inFlight
      const { session, game, puzzle } = this.snapshot
      if (!session || !game || !puzzle) return
      const base = { grid: game.grid.map((line) => [...line]), revision: session.revision }
      const clue = activeClue(puzzle, game)
      let body: CheckBody
      if (scope === 'cell') {
        if (!game.active) {
          this.update({ notice: 'Sélectionnez d’abord une case.' })
          return
        }
        body = { scope, ...base, cell: { row: game.active.row, col: game.active.col } }
      } else if (scope === 'word') {
        if (!clue) {
          this.update({ notice: 'Sélectionnez d’abord un mot.' })
          return
        }
        body = { scope, ...base, word: { direction: clue.direction, number: clue.number } }
      } else {
        body = { scope, ...base }
      }
      const response = await this.api.check(session.id, body)
      this.dirty = false
      this.adopt(response.session, { replaceGrid: false })
      this.dispatch({ type: 'checked', cells: response.cells })
      this.update({ saveState: 'saved', notice: describeCheck(response.cells) })
    })
  }

  hint(kind: HintKind): Promise<void> {
    return this.withLock(async () => {
      // Les indices s'appliquent à la grille stockée : on envoie d'abord la saisie en attente.
      await this.flush()
      const { session, game, puzzle } = this.snapshot
      if (!session || !game || !puzzle) return
      const clue = activeClue(puzzle, game)
      let body: HintBody
      if (kind === 'letter') {
        if (!game.active) {
          this.update({ notice: 'Sélectionnez d’abord une case.' })
          return
        }
        body = { type: 'letter', cell: { row: game.active.row, col: game.active.col } }
      } else if (kind === 'word' || kind === 'explain') {
        if (!clue) {
          this.update({ notice: 'Sélectionnez d’abord un mot.' })
          return
        }
        body = { type: kind, word: { direction: clue.direction, number: clue.number } }
      } else {
        body = { type: 'solution', confirm: true }
      }
      const response = await this.api.hint(session.id, body)
      this.adopt(response.session, { replaceGrid: true })
      this.dispatch({ type: 'revealed', cells: response.revealed })
      if (response.explanation !== null && clue) {
        this.update({
          explanation: {
            label: `${clue.number} ${clue.direction === 'across' ? 'horizontal' : 'vertical'}`,
            text: response.explanation,
          },
        })
      } else if (kind === 'explain') {
        this.update({ notice: 'Aucune explication n’est disponible pour ce mot.' })
      }
      if (response.revealed.length > 0) {
        this.update({
          notice:
            response.revealed.length === 1
              ? 'Une lettre a été révélée.'
              : `${response.revealed.length} lettres ont été révélées.`,
        })
      }
      this.update({ saveState: 'saved' })
    })
  }
}

export function describeCheck(
  cells: readonly { result: 'correct' | 'incorrect' | 'empty' }[],
): string {
  const wrong = cells.filter((cell) => cell.result === 'incorrect').length
  const empty = cells.filter((cell) => cell.result === 'empty').length
  if (wrong === 0 && empty === 0) return 'Tout est juste.'
  const parts: string[] = []
  if (wrong > 0) parts.push(wrong === 1 ? '1 lettre fausse' : `${wrong} lettres fausses`)
  if (empty > 0) parts.push(empty === 1 ? '1 case vide' : `${empty} cases vides`)
  return parts.join(', ') + '.'
}
