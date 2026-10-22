/**
 * État d'un duel côté interface : connexion temps réel, file d'attente, invitation privée,
 * état officiel du match, grille du joueur et soumission des mots. Classe pure (ni React ni
 * React Native), abonnée par `useSyncExternalStore`, pilotée directement par les tests.
 *
 * Le serveur fait autorité sur tout (mots justes, scores, fin, vainqueur). Le joueur remplit
 * la grille librement ; dès qu'un mot est complet, il est soumis, et les mots validés sont
 * réécrits avec les lettres renvoyées par le serveur.
 */
import type { Ack, MatchState } from '@crossverse/contracts'
import { slotCells, type PublicPuzzle } from '@crossverse/crossword-core'
import { toEnginePuzzle } from '../game/puzzle'
import { cellKey, gameReducer, initialState, type GameAction, type GameState } from '../game/state'
import type { ConnectionStatus, MatchConnection } from './connection'
import {
  applySolved,
  completedWords,
  matchClockOffset,
  matchSides,
  matchWordKey,
  normalizeInviteCode,
} from './logic'

export type QueueStatus = 'idle' | 'joining' | 'queued'

export interface DuelSnapshot {
  readonly status: ConnectionStatus
  readonly state: MatchState | null
  readonly queue: QueueStatus
  readonly busy: boolean
  readonly error: string | null
  /** Écart entre l'horloge du serveur et l'horloge locale (chronomètre affiché). */
  readonly offsetMs: number
  /** Heure locale où l'adversaire a été vu déconnecté (estimation du délai de grâce). */
  readonly opponentLostAt: number | null
  readonly puzzle: PublicPuzzle | null
  readonly game: GameState | null
  /** Dernier verdict annoncé (« Mot trouvé… », « ce n'est pas le bon mot »). */
  readonly notice: string | null
}

const INITIAL: Omit<DuelSnapshot, 'status'> = {
  state: null,
  queue: 'idle',
  busy: false,
  error: null,
  offsetMs: 0,
  opponentLostAt: null,
  puzzle: null,
  game: null,
  notice: null,
}

const wordName = (direction: 'across' | 'down', number: number): string =>
  `${number} ${direction === 'across' ? 'horizontal' : 'vertical'}`

export class DuelController {
  private snapshot: DuelSnapshot
  private readonly listeners = new Set<() => void>()
  /** Dernière proposition envoyée par mot : on ne soumet pas deux fois les mêmes lettres. */
  private readonly attempts = new Map<string, string>()

  constructor(
    private readonly connection: MatchConnection,
    private readonly clock: () => number = Date.now,
  ) {
    this.snapshot = { ...INITIAL, status: connection.status }
    if (connection.state) this.applyState(connection.state)
    connection.onState((state) => {
      this.applyState(state)
    })
    connection.onStatus((status) => {
      const previous = this.snapshot.status
      this.update({ status })
      // Le serveur retire de la file un joueur déconnecté : on y revient après la reconnexion.
      if (status === 'connected' && previous !== 'connected' && this.snapshot.queue === 'queued') {
        void this.joinQueue()
      }
    })
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): DuelSnapshot => this.snapshot

  private update(patch: Partial<DuelSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  connect(): void {
    this.connection.connect()
  }

  // --- État reçu du serveur ------------------------------------------------------

  private applyState(next: MatchState): void {
    const received = this.clock()
    const sameMatch = this.snapshot.state?.id === next.id
    let { puzzle, game } = this.snapshot
    if (!sameMatch) {
      this.attempts.clear()
      puzzle = next.puzzle ? toEnginePuzzle(next.puzzle) : null
      game = puzzle ? initialState(puzzle) : null
    } else if (!puzzle && next.puzzle) {
      puzzle = toEnginePuzzle(next.puzzle)
      game = initialState(puzzle)
    }
    if (puzzle && game) {
      game = applySolved(puzzle, game, next.me.solvedWords)
      game = gameReducer(puzzle, game, { type: 'lock', locked: next.status !== 'active' })
    }
    const opponent = matchSides(next).opponent
    const opponentLost = next.status === 'active' && opponent !== undefined && !opponent.connected
    this.update({
      state: next,
      offsetMs: matchClockOffset(next, received),
      // Appariement trouvé pendant l'attente : la file est vidée par le serveur.
      ...(next.status === 'waiting' ? {} : { queue: 'idle' as const }),
      opponentLostAt: opponentLost ? (this.snapshot.opponentLostAt ?? received) : null,
      puzzle,
      game,
      ...(sameMatch ? {} : { notice: null }),
    })
  }

  // --- Actions --------------------------------------------------------------------

  /** Une action à la fois ; l'erreur du serveur (en français) est exposée telle quelle. */
  private async run<T>(action: () => Promise<Ack<T>>): Promise<Ack<T>> {
    this.update({ busy: true, error: null })
    try {
      const ack = await action()
      if (!ack.ok) this.update({ error: ack.error.message })
      return ack
    } finally {
      this.update({ busy: false })
    }
  }

  async joinQueue(): Promise<void> {
    this.update({ queue: 'joining' })
    const ack = await this.run(() => this.connection.emit('queue:join', {}))
    // `matched` : l'état du match est déjà arrivé par diffusion.
    this.update({ queue: ack.ok && ack.data.status === 'queued' ? 'queued' : 'idle' })
  }

  async leaveQueue(): Promise<void> {
    this.update({ queue: 'idle' })
    await this.run(() => this.connection.emit('queue:leave', {}))
  }

  async createInvite(): Promise<MatchState | null> {
    const ack = await this.run(() => this.connection.emit('invite:create', {}))
    return ack.ok ? ack.data : null
  }

  async acceptInvite(input: string): Promise<MatchState | null> {
    const code = normalizeInviteCode(input)
    if (code === null) {
      this.update({
        error: 'Code invalide : 6 caractères, lettres et chiffres (sans O, I, 0 ni 1).',
      })
      return null
    }
    const ack = await this.run(() => this.connection.emit('invite:accept', { code }))
    return ack.ok ? ack.data : null
  }

  async forfeit(): Promise<boolean> {
    const matchId = this.snapshot.state?.id
    if (!matchId) return false
    return (await this.run(() => this.connection.emit('match:forfeit', { matchId }))).ok
  }

  /** Charge (ou recharge) un match précis et le suit après chaque reconnexion. */
  resync(matchId: string): Promise<Ack<MatchState>> {
    this.connection.track(matchId)
    return this.run(() => this.connection.emit('match:resync', { matchId }))
  }

  // --- Grille -----------------------------------------------------------------------

  /** Action de jeu locale ; chaque mot nouvellement complet est soumis au serveur. */
  readonly dispatch = (action: GameAction): void => {
    const { puzzle, game, state } = this.snapshot
    if (!puzzle || !game || !state) return
    let next = gameReducer(puzzle, game, action)
    if (next === game) return
    if (next.editCount !== game.editCount) {
      // Une case déjà validée par le serveur ne se modifie pas : on la rétablit aussitôt.
      next = applySolved(puzzle, next, state.me.solvedWords)
    }
    this.update({ game: next })
    if (next.editCount !== game.editCount) void this.submitCompletedWords()
  }

  private async submitCompletedWords(): Promise<void> {
    const { puzzle, game, state } = this.snapshot
    if (!puzzle || !game || state?.status !== 'active') return
    const solved = new Set(
      state.me.solvedWords.map((word) => matchWordKey(word.direction, word.number)),
    )
    const complete = completedWords(puzzle, game, solved)
    const completeKeys = new Set(complete.map((word) => word.key))
    // Un mot redevenu incomplet pourra être resoumis avec les mêmes lettres.
    for (const key of this.attempts.keys()) if (!completeKeys.has(key)) this.attempts.delete(key)

    for (const word of complete) {
      if (this.attempts.get(word.key) === word.answer) continue
      this.attempts.set(word.key, word.answer)
      const ack = await this.run(() =>
        this.connection.emit('match:submit-word', {
          matchId: state.id,
          direction: word.direction,
          number: word.number,
          answer: word.answer,
        }),
      )
      if (!ack.ok) {
        // Action refusée (hors ligne…) : on pourra la retenter avec les mêmes lettres.
        this.attempts.delete(word.key)
        continue
      }
      const name = wordName(word.direction, word.number)
      if (ack.data.correct) {
        this.update({ notice: `Mot trouvé : ${name}.` })
        continue
      }
      this.update({ notice: `${name} : ce n’est pas le bon mot.` })
      this.markWrong(word.direction, word.number)
    }
  }

  /** Marque fausses les cases d'un mot refusé qui ne sont pas déjà validées. */
  private markWrong(direction: 'across' | 'down', number: number): void {
    const { puzzle, game } = this.snapshot
    const clue = puzzle?.clues.find((c) => c.direction === direction && c.number === number)
    if (!puzzle || !game || !clue) return
    const cells = slotCells(clue)
      .filter((cell) => !game.marks.has(cellKey(cell)))
      .map((cell) => ({ ...cell, result: 'incorrect' as const }))
    this.update({ game: gameReducer(puzzle, game, { type: 'checked', cells }) })
  }
}
