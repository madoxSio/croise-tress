/**
 * Client du duel : appels REST (classement, historique) et connexion temps réel Socket.IO.
 *
 * - REST : réutilise `request` de `services/api.ts` (même origine, validation Zod).
 * - Temps réel : même origine (`/ws`, proxifié vers l'API), authentifié par le cookie de
 *   session HttpOnly. Chaque action porte un `clientEventId` aléatoire : le serveur ignore
 *   une action rejouée. Après une reconnexion, l'état du match suivi est redemandé
 *   (`match:resync`) : le serveur reste la seule source de vérité.
 * - Tout ce qui arrive du serveur (accusés, `match:state`) est validé par le schéma du contrat.
 */
import {
  ERROR_CODES,
  SOCKET_PATH,
  matchHintResultSchema,
  matchStateSchema,
  uuidSchema,
  type Ack,
  type ClientToServerEvents,
  type MatchState,
} from '@crossverse/contracts'
import { io } from 'socket.io-client'
import { z } from 'zod'
import { query, request } from './api'

// --- REST -------------------------------------------------------------------

/*
 * Le paquet `contracts` ne définit pas (encore) les réponses de ces routes : les schémas
 * ci-dessous reflètent `apps/api/src/modules/match/service.ts` et doivent y être déplacés.
 */
const resultSchema = z.enum(['win', 'loss', 'draw'])

export const leaderboardSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      rank: z.int().positive(),
      username: z.string(),
      rating: z.int(),
      gamesPlayed: z.int(),
      wins: z.int(),
    }),
  ),
})
export type Leaderboard = z.infer<typeof leaderboardSchema>

export const matchHistorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      matchId: uuidSchema,
      mode: z.enum(['quick', 'private']),
      puzzleTitle: z.string(),
      opponent: z.string().nullable(),
      result: resultSchema.nullable(),
      endReason: z.string().nullable(),
      solvedCount: z.int(),
      endedAt: z.iso.datetime().nullable(),
    }),
  ),
})
export type MatchHistory = z.infer<typeof matchHistorySchema>

export const ratingSchema = z.strictObject({
  rating: z.int(),
  gamesPlayed: z.int(),
  wins: z.int(),
  losses: z.int(),
  draws: z.int(),
})
export type Rating = z.infer<typeof ratingSchema>

/** Taille maximale d'une page acceptée par l'API (`limit` ≤ 100, pas de curseur). */
export const MAX_PAGE_SIZE = 100

export const matchApi = {
  leaderboard(limit?: number): Promise<Leaderboard> {
    return request('GET', `/leaderboard${query({ limit })}`, leaderboardSchema)
  },

  myMatches(limit?: number): Promise<MatchHistory> {
    return request('GET', `/me/matches${query({ limit })}`, matchHistorySchema)
  },

  myRating(): Promise<Rating> {
    return request('GET', '/me/rating', ratingSchema)
  },
}

// --- Temps réel ---------------------------------------------------------------

/** Codes d'erreur propres au client temps réel, en plus de ceux renvoyés par le serveur. */
export const MATCH_CLIENT_ERRORS = {
  offline: 'offline',
  timeout: 'timeout',
  invalidResponse: 'invalid_response',
} as const

/** Raisons de refus à la connexion (middleware d'authentification de la passerelle). */
const ACCOUNT_ERRORS = new Set(['account_required', ERROR_CODES.unauthenticated])

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  /** Coupure réseau : Socket.IO retente seul. */
  | 'reconnecting'
  /** Coupure définitive (fermeture par le serveur) : reconnexion manuelle possible. */
  | 'disconnected'
  /** Invité, session absente ou compte non confirmé : le duel exige un compte confirmé. */
  | 'account_required'

type Events = ClientToServerEvents
type EventName = keyof Events
/** Données de l'accusé de réception d'un événement. */
type AckData<E extends EventName> =
  Parameters<Parameters<Events[E]>[1]>[0] extends Ack<infer T> ? T : never
/** Charge utile sans `clientEventId`, ajouté par la connexion. */
type Payload<E extends EventName> = Omit<Parameters<Events[E]>[0], 'clientEventId'>

/** Sous-ensemble du `Socket` de socket.io-client utilisé ici (remplaçable en test). */
export interface SocketLike {
  readonly connected: boolean
  /** Vrai tant que Socket.IO tentera de (re)connecter de lui-même. */
  readonly active: boolean
  connect(): unknown
  disconnect(): unknown
  on(event: string, listener: (...args: never[]) => void): unknown
  emit(event: string, payload: unknown, ack: (response: unknown) => void): unknown
}

export type SocketFactory = () => SocketLike

const defaultFactory: SocketFactory = () =>
  io({
    path: SOCKET_PATH,
    withCredentials: true,
    // Transports par défaut (long polling puis passage en WebSocket) : le proxy de dev Nuxt ne
    // relaie pas l'upgrade WebSocket, le polling garantit la connexion ; en production le
    // reverse proxy relaie l'upgrade et la connexion passe en WebSocket.
    autoConnect: false,
  })

const ACK_TIMEOUT_MS = 10_000

const stateAck = z.union([
  z.strictObject({ ok: z.literal(true), data: matchStateSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
])

/** Validation des accusés : seuls ceux qui contiennent un `MatchState` ont un schéma riche. */
const ACK_SCHEMAS: { [E in EventName]: z.ZodType<Ack<AckData<E>>> } = {
  'queue:join': z.union([
    z.strictObject({
      ok: z.literal(true),
      data: z.strictObject({ status: z.enum(['queued', 'matched']) }),
    }),
    z.strictObject({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]),
  'queue:leave': z.union([
    // Sans données, la clé `data` disparaît à la sérialisation JSON : on la rétablit.
    z
      .strictObject({ ok: z.literal(true), data: z.undefined().optional() })
      .transform(() => ({ ok: true as const, data: undefined })),
    z.strictObject({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]),
  'invite:create': stateAck,
  'invite:accept': stateAck,
  'match:submit-word': z.union([
    z.strictObject({
      ok: z.literal(true),
      data: z.strictObject({ correct: z.boolean(), state: matchStateSchema }),
    }),
    z.strictObject({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]),
  'match:hint': z.union([
    z.strictObject({ ok: z.literal(true), data: matchHintResultSchema }),
    z.strictObject({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]),
  'match:forfeit': stateAck,
  'match:resync': stateAck,
}

const failure = (
  code: string,
  message: string,
): { ok: false; error: { code: string; message: string } } => ({
  ok: false,
  error: { code, message },
})

export interface MatchConnectionOptions {
  readonly factory?: SocketFactory
  readonly ackTimeoutMs?: number
  readonly newId?: () => string
}

/**
 * Connexion temps réel du joueur. Une seule instance suffit pour toute l'application
 * (`sharedMatchConnection`) : l'état reçu sur `/duel` reste disponible sur la page du match.
 */
export class MatchConnection {
  private socket: SocketLike | null = null
  private statusValue: ConnectionStatus = 'idle'
  private stateValue: MatchState | null = null
  private everConnected = false
  /** Match dont l'état est redemandé après chaque reconnexion. */
  private tracked: string | null = null
  private readonly stateListeners = new Set<(state: MatchState) => void>()
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>()
  private readonly factory: SocketFactory
  private readonly ackTimeoutMs: number
  private readonly newId: () => string

  constructor(options: MatchConnectionOptions = {}) {
    this.factory = options.factory ?? defaultFactory
    this.ackTimeoutMs = options.ackTimeoutMs ?? ACK_TIMEOUT_MS
    this.newId = options.newId ?? (() => crypto.randomUUID())
  }

  get status(): ConnectionStatus {
    return this.statusValue
  }

  /** Dernier état reçu (du match suivi, ou du dernier match annoncé par le serveur). */
  get state(): MatchState | null {
    return this.stateValue
  }

  /** Ouvre la connexion (sans effet si elle est déjà ouverte ou en cours). */
  connect(): void {
    if (this.socket?.active === true || this.socket?.connected === true) return
    this.socket ??= this.createSocket()
    this.setStatus('connecting')
    this.socket.connect()
  }

  disconnect(): void {
    // Statut posé avant : l'événement `disconnect` (synchrone) reconnaît ainsi un départ voulu.
    this.setStatus('idle')
    this.socket?.disconnect()
  }

  /** Suit un match : son état est redemandé à chaque reconnexion. `null` arrête le suivi. */
  track(matchId: string | null): void {
    this.tracked = matchId
    if (matchId === null || this.stateValue?.id !== matchId) this.stateValue = null
  }

  onState(listener: (state: MatchState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  /**
   * Envoie un événement et attend son accusé de réception. Ne rejette jamais : hors ligne,
   * délai dépassé ou réponse invalide donnent un `Ack` en échec avec un code client.
   * Hors ligne, rien n'est mis en file : une action ne doit pas partir des secondes plus tard.
   */
  emit<E extends EventName>(event: E, payload: Payload<E>): Promise<Ack<AckData<E>>> {
    const socket = this.socket
    if (!socket?.connected) {
      return Promise.resolve(
        failure(MATCH_CLIENT_ERRORS.offline, 'Connexion au serveur de jeu perdue.'),
      )
    }
    // `queue:leave` est le seul événement dont le contrat n'accepte pas d'identifiant.
    const body = event === 'queue:leave' ? {} : { ...payload, clientEventId: this.newId() }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(failure(MATCH_CLIENT_ERRORS.timeout, 'Le serveur de jeu ne répond pas.'))
      }, this.ackTimeoutMs)
      socket.emit(event, body, (response) => {
        clearTimeout(timer)
        const parsed = ACK_SCHEMAS[event].safeParse(response)
        if (!parsed.success) {
          resolve(failure(MATCH_CLIENT_ERRORS.invalidResponse, 'Réponse inattendue du serveur.'))
          return
        }
        const ack = parsed.data
        // Les accusés porteurs d'un état le diffusent comme un `match:state`.
        if (ack.ok) this.receive(stateOf(ack.data))
        resolve(ack)
      })
    })
  }

  private createSocket(): SocketLike {
    const socket = this.factory()
    socket.on('connect', () => {
      const reconnected = this.everConnected
      this.everConnected = true
      this.setStatus('connected')
      if (reconnected && this.tracked) void this.emit('match:resync', { matchId: this.tracked })
    })
    socket.on('connect_error', (error: Error) => {
      if (ACCOUNT_ERRORS.has(error.message)) this.setStatus('account_required')
      else this.setStatus(socket.active ? 'reconnecting' : 'disconnected')
    })
    socket.on('disconnect', () => {
      // Déconnexion volontaire (`disconnect()`) : le statut est déjà `idle`.
      if (this.statusValue === 'idle') return
      this.setStatus(socket.active ? 'reconnecting' : 'disconnected')
    })
    socket.on('match:state', (raw: unknown) => {
      const parsed = matchStateSchema.safeParse(raw)
      if (parsed.success) this.receive(parsed.data)
    })
    return socket
  }

  private receive(state: MatchState | null): void {
    if (!state) return
    // Un état plus ancien que celui déjà connu (accusé arrivé après une diffusion) est ignoré.
    const current = this.stateValue
    if (current?.id === state.id && current.serverTime > state.serverTime) return
    this.stateValue = state
    // Un match en attente ou en cours annoncé par le serveur est forcément le nôtre : on le suit.
    if (state.status === 'waiting' || state.status === 'active') this.tracked = state.id
    for (const listener of this.stateListeners) listener(state)
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.statusValue === status) return
    this.statusValue = status
    for (const listener of this.statusListeners) listener(status)
  }
}

function stateOf(data: unknown): MatchState | null {
  if (data === undefined || data === null || typeof data !== 'object') return null
  if ('state' in data) return (data as { state: MatchState }).state
  if ('id' in data && 'participants' in data) return data as MatchState
  return null
}

let shared: MatchConnection | null = null
let users = 0
let closeTimer: ReturnType<typeof setTimeout> | undefined
/** Délai avant fermeture quand plus aucune page ne l'utilise : couvre un changement de page. */
const RELEASE_DELAY_MS = 3000

/**
 * Connexion partagée, comptée par utilisateur : elle est fermée peu après le départ de la
 * dernière page qui s'en sert (sans cela, passer de `/duel` au match la couperait).
 */
export function acquireMatchConnection(): { connection: MatchConnection; release: () => void } {
  shared ??= new MatchConnection()
  const connection = shared
  users += 1
  clearTimeout(closeTimer)
  let released = false
  return {
    connection,
    release() {
      if (released) return
      released = true
      users -= 1
      if (users > 0) return
      closeTimer = setTimeout(() => {
        if (users === 0) connection.disconnect()
      }, RELEASE_DELAY_MS)
    },
  }
}
