/**
 * État d'un duel côté interface : connexion temps réel, file d'attente, invitation privée,
 * état officiel du match et actions du joueur. Le serveur fait autorité sur tout (mots
 * justes, scores, fin, vainqueur) ; le chronomètre affiché n'est qu'une projection de
 * l'échéance envoyée par le serveur, corrigée de l'écart entre les horloges.
 *
 * Écrit avec les imports Vue explicites (sans auto-import Nuxt) pour être testé sans Nuxt.
 */
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import {
  RECONNECT_GRACE_MS,
  inviteCodeSchema,
  type Ack,
  type MatchHintResult,
  type MatchState,
} from '@crossverse/contracts'
import type { Direction } from '@crossverse/crossword-core'
import {
  acquireMatchConnection,
  type ConnectionStatus,
  type MatchConnection,
} from '../services/match'

export type Participant = MatchState['participants'][number]
export type QueueStatus = 'idle' | 'joining' | 'queued'
export type MatchOutcome = 'win' | 'loss' | 'draw'

// --- Logique pure (testée unitairement) -----------------------------------------

/** Clé d'un mot, identique à celle du serveur (`3-down`). */
export const matchWordKey = (direction: Direction, number: number): string =>
  `${number}-${direction}`

/** Écart (ms) entre l'horloge du serveur et l'horloge locale au moment de la réception. */
export function matchClockOffset(
  state: Pick<MatchState, 'serverTime'>,
  receivedAt: number,
): number {
  const server = Date.parse(state.serverTime)
  return Number.isNaN(server) ? 0 : server - receivedAt
}

/** Temps restant affiché, ou `null` hors match en cours. Jamais négatif. */
export function matchRemainingMs(
  state: Pick<MatchState, 'status' | 'deadlineAt'> | null,
  offsetMs: number,
  now: number,
): number | null {
  if (state?.status !== 'active' || state.deadlineAt === null) return null
  const deadline = Date.parse(state.deadlineAt)
  if (Number.isNaN(deadline)) return null
  return Math.max(0, deadline - (now + offsetMs))
}

/** Le joueur et son adversaire (absent tant qu'une invitation n'est pas acceptée). */
export function matchSides(state: MatchState | null): {
  me: Participant | undefined
  opponent: Participant | undefined
} {
  if (!state) return { me: undefined, opponent: undefined }
  return {
    me: state.participants.find((p) => p.userId === state.me.userId),
    opponent: state.participants.find((p) => p.userId !== state.me.userId),
  }
}

/** Saisie d'un code d'invitation : majuscules, sans espaces ni tirets. `null` si invalide. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return inviteCodeSchema.safeParse(code).success ? code : null
}

/** Phrase expliquant la fin d'un match, du point de vue du joueur. */
export function matchEndLabel(state: MatchState): string {
  if (state.status === 'aborted') return 'Invitation annulée.'
  const won = state.winnerId === state.me.userId
  switch (state.endReason) {
    case 'completed':
      return won
        ? 'Vous avez trouvé tous les mots en premier.'
        : 'Votre adversaire a tout trouvé en premier.'
    case 'deadline':
      return state.winnerId === null
        ? 'Temps écoulé : égalité parfaite.'
        : 'Temps écoulé : victoire au nombre de mots trouvés (puis au plus rapide).'
    case 'forfeit':
      return won ? 'Votre adversaire a abandonné.' : 'Vous avez abandonné.'
    case 'disconnect':
      return won
        ? 'Votre adversaire ne s’est pas reconnecté à temps.'
        : 'Vous avez été déconnecté trop longtemps.'
    default:
      return 'Match terminé.'
  }
}

// --- Composable ---------------------------------------------------------------

export interface UseMatchOptions {
  /** Connexion à utiliser (tests) ; par défaut la connexion partagée de l'application. */
  readonly connection?: MatchConnection
  readonly clock?: () => number
}

export function useMatch(options: UseMatchOptions = {}) {
  const lease = options.connection
    ? { connection: options.connection, release: () => undefined }
    : acquireMatchConnection()
  const { connection } = lease
  const clock = options.clock ?? Date.now

  const status = ref<ConnectionStatus>(connection.status)
  const state = shallowRef<MatchState | null>(null)
  const offsetMs = ref(0)
  const now = ref(clock())
  const queue = ref<QueueStatus>('idle')
  const busy = ref(false)
  const error = ref<string | null>(null)
  /** Heure locale où l'adversaire a été vu déconnecté (estimation du délai de grâce). */
  const opponentLostAt = ref<number | null>(null)

  function applyState(next: MatchState): void {
    const received = clock()
    state.value = next
    offsetMs.value = matchClockOffset(next, received)
    now.value = received
    // Appariement trouvé pendant l'attente : la file est vidée par le serveur.
    if (next.status !== 'waiting') queue.value = 'idle'
    const opponent = matchSides(next).opponent
    if (next.status === 'active' && opponent && !opponent.connected) {
      opponentLostAt.value ??= received
    } else {
      opponentLostAt.value = null
    }
  }

  if (connection.state) applyState(connection.state)
  const stopState = connection.onState(applyState)
  const stopStatus = connection.onStatus((next) => {
    const previous = status.value
    status.value = next
    // Le serveur retire de la file un joueur déconnecté : on y revient après la reconnexion.
    if (next === 'connected' && previous !== 'connected' && queue.value === 'queued') {
      void joinQueue()
    }
  })
  connection.connect()

  const timer = setInterval(() => {
    now.value = clock()
  }, 1000)

  const sides = computed(() => matchSides(state.value))
  const remainingMs = computed(() => matchRemainingMs(state.value, offsetMs.value, now.value))
  const opponentGraceMs = computed(() =>
    opponentLostAt.value === null
      ? null
      : Math.max(0, RECONNECT_GRACE_MS - (now.value - opponentLostAt.value)),
  )
  const solvedKeys = computed<ReadonlySet<string>>(
    () =>
      new Set(state.value?.me.solvedWords.map((word) => matchWordKey(word.direction, word.number))),
  )
  const outcome = computed<MatchOutcome | null>(() => sides.value.me?.result ?? null)

  /** Exécute une action : une seule à la fois, erreur serveur exposée telle quelle (en français). */
  async function run<T>(action: () => Promise<Ack<T>>): Promise<Ack<T>> {
    busy.value = true
    error.value = null
    try {
      const ack = await action()
      if (!ack.ok) error.value = ack.error.message
      return ack
    } finally {
      busy.value = false
    }
  }

  async function joinQueue(): Promise<void> {
    queue.value = 'joining'
    const ack = await run(() => connection.emit('queue:join', {}))
    // `matched` : l'état du match est déjà arrivé par diffusion (`applyState`).
    queue.value = ack.ok && ack.data.status === 'queued' ? 'queued' : 'idle'
  }

  async function leaveQueue(): Promise<void> {
    queue.value = 'idle'
    await run(() => connection.emit('queue:leave', {}))
  }

  async function createInvite(): Promise<MatchState | null> {
    const ack = await run(() => connection.emit('invite:create', {}))
    return ack.ok ? ack.data : null
  }

  async function acceptInvite(input: string): Promise<MatchState | null> {
    const code = normalizeInviteCode(input)
    if (code === null) {
      error.value = 'Code invalide : 6 caractères, lettres et chiffres (sans O, I, 0 ni 1).'
      return null
    }
    const ack = await run(() => connection.emit('invite:accept', { code }))
    return ack.ok ? ack.data : null
  }

  /** Soumet un mot entier. `true`/`false` : verdict du serveur ; `null` : action refusée. */
  async function submitWord(
    direction: Direction,
    number: number,
    answer: string,
  ): Promise<boolean | null> {
    const matchId = state.value?.id
    if (!matchId) return null
    const ack = await run(() =>
      connection.emit('match:submit-word', { matchId, direction, number, answer }),
    )
    return ack.ok ? ack.data.correct : null
  }

  /** Achète la lettre d'une case en Coumba points ; `null` si le serveur refuse (solde…). */
  async function buyHint(cell: { row: number; col: number }): Promise<MatchHintResult | null> {
    const matchId = state.value?.id
    if (!matchId) return null
    const ack = await run(() => connection.emit('match:hint', { matchId, cell }))
    return ack.ok ? ack.data : null
  }

  async function forfeit(): Promise<boolean> {
    const matchId = state.value?.id
    if (!matchId) return false
    return (await run(() => connection.emit('match:forfeit', { matchId }))).ok
  }

  /** Charge (ou recharge) un match précis et le suit après chaque reconnexion. */
  async function resync(matchId: string): Promise<Ack<MatchState>> {
    connection.track(matchId)
    if (state.value?.id !== matchId) state.value = null
    return run(() => connection.emit('match:resync', { matchId }))
  }

  function dispose(): void {
    clearInterval(timer)
    stopState()
    stopStatus()
    lease.release()
  }
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    status,
    state,
    queue,
    busy,
    error,
    remainingMs,
    opponentGraceMs,
    me: computed(() => sides.value.me),
    opponent: computed(() => sides.value.opponent),
    solvedKeys,
    outcome,
    connect: () => {
      connection.connect()
    },
    joinQueue,
    leaveQueue,
    createInvite,
    acceptInvite,
    submitWord,
    buyHint,
    forfeit,
    resync,
    dispose,
  }
}

export type MatchController = ReturnType<typeof useMatch>
