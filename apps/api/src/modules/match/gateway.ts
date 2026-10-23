import {
  ERROR_CODES,
  MAX_SOCKET_MESSAGE_BYTES,
  RECONNECT_GRACE_MS,
  SOCKET_PATH,
  inviteAcceptSchema,
  inviteCreateSchema,
  matchRefSchema,
  queueJoinSchema,
  submitWordSchema,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import type { ZodType } from 'zod'
import type { Config } from '../../config.ts'
import { AppError } from '../../http/errors.ts'
import { isNativeClient, isSessionToken } from '../../plugins/auth.ts'
import type { AuthUser, SessionService } from '../session/service.ts'
import type { FinishResult, MatchService } from './service.ts'

interface SocketData {
  user: AuthUser
  /** Seau de jetons pour la limitation de débit par connexion. */
  tokens: number
  lastRefill: number
  strikes: number
}

type MatchSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

const RATE = { capacity: 10, perSecond: 10, maxStrikes: 20 } as const

/** Jeton passé par un client natif dans la poignée de main (`auth.token`), jamais dans l'URL. */
function nativeToken(auth: Record<string, unknown>): string | undefined {
  const token = auth['token']
  return isSessionToken(token) ? token : undefined
}

/**
 * Passerelle temps réel : authentifie chaque connexion par le cookie de session (navigateur)
 * ou par jeton porteur (client natif), vérifie l'origine des navigateurs, valide chaque
 * événement par schéma et limite le débit. Les rooms sont gérées uniquement côté serveur (une room par utilisateur) : un client ne peut rejoindre aucune room.
 */
export class MatchGateway {
  readonly io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
  private readonly deadlineTimers = new Map<string, NodeJS.Timeout>()
  private readonly graceTimers = new Map<string, NodeJS.Timeout>()
  private readonly log: FastifyInstance['log']

  constructor(
    app: FastifyInstance,
    private readonly config: Config,
    private readonly sessions: SessionService,
    private readonly matches: MatchService,
    private readonly graceMs = RECONNECT_GRACE_MS,
  ) {
    this.log = app.log
    this.io = new Server(app.server, {
      path: SOCKET_PATH,
      serveClient: false,
      maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES,
      // Protection contre le détournement de WebSocket inter-sites (CSWSH) : un navigateur envoie
      // toujours `Origin` sur une poignée de main WebSocket et sur toute requête inter-origines ;
      // il l'omet seulement pour un GET de même origine (long polling), que `Sec-Fetch-Site` confirme.
      allowRequest: (req, callback) => {
        // Client natif : l'en-tête dédié est impossible à poser depuis un navigateur (l'API
        // WebSocket n'accepte aucun en-tête, le polling inter-origines exigerait un pré-vol
        // CORS refusé). L'authentification exige alors un jeton porteur, jamais le cookie.
        if (isNativeClient(req.headers)) {
          callback(null, true)
          return
        }
        const origin = req.headers.origin
        if (origin !== undefined) {
          callback(null, config.webOrigins.includes(origin))
          return
        }
        const site = req.headers['sec-fetch-site']
        callback(null, site === undefined || site === 'same-origin')
      },
    })

    this.io.use((socket, next) => {
      void this.authenticate(socket, app).then(
        () => {
          next()
        },
        (error: unknown) => {
          next(error instanceof Error ? error : new Error('unauthenticated'))
        },
      )
    })
    this.io.on('connection', (socket) => {
      this.onConnection(socket)
    })
    // Avant l'arrêt du serveur HTTP : ferme les connexions temps réel qui le maintiendraient ouvert.
    app.addHook('preClose', (done) => {
      this.clearTimers()
      this.io.disconnectSockets(true)
      this.io.engine.close()
      done()
    })
  }

  /**
   * Coupe les connexions temps réel d'un joueur (suspension, sessions fermées par un
   * administrateur) : la session est vérifiée à la connexion seulement. Un match en cours suit
   * la règle de déconnexion habituelle (délai de grâce puis abandon).
   */
  disconnectUser(userId: string): void {
    this.io.in(this.room(userId)).disconnectSockets(true)
  }

  /** Reprend les matchs actifs après un redémarrage (minuteurs et délais de grâce). */
  async recover(): Promise<void> {
    for (const match of await this.matches.recoverActive()) {
      this.scheduleDeadline(match.id, match.deadlineAt)
      for (const userId of match.userIds) this.scheduleGrace(userId, match.id)
    }
  }

  private async authenticate(socket: MatchSocket, app: FastifyInstance): Promise<void> {
    const token = isNativeClient(socket.handshake.headers)
      ? nativeToken(socket.handshake.auth)
      : app.parseCookie(socket.handshake.headers.cookie ?? '')[this.config.sessionCookieName]
    const auth = token ? await this.sessions.resolve(token) : null
    if (!auth) throw new Error('unauthenticated')
    if (auth.user.isGuest || !auth.user.emailVerified) throw new Error('account_required')
    socket.data = { user: auth.user, tokens: RATE.capacity, lastRefill: Date.now(), strikes: 0 }
  }

  private onConnection(socket: MatchSocket): void {
    const userId = socket.data.user.id
    void socket.join(this.room(userId))
    this.cancelGrace(userId)
    this.background(
      this.matches
        .markConnected(userId)
        .then((matchId) => (matchId ? this.broadcast(matchId) : undefined)),
    )

    this.on(socket, 'queue:join', queueJoinSchema, async () => {
      const matchId = await this.matches.joinQueue(userId)
      if (matchId) await this.started(matchId)
      return { status: matchId ? ('matched' as const) : ('queued' as const) }
    })
    this.on(socket, 'queue:leave', null, async () => {
      await this.matches.leaveQueue(userId)
      return undefined
    })
    this.on(socket, 'invite:create', inviteCreateSchema, async () => {
      const matchId = await this.matches.createInvite(userId)
      return this.matches.state(userId, matchId, (id) => this.isConnected(id))
    })
    this.on(socket, 'invite:accept', inviteAcceptSchema, async (payload) => {
      const matchId = await this.matches.acceptInvite(userId, payload.code)
      await this.started(matchId)
      return this.matches.state(userId, matchId, (id) => this.isConnected(id))
    })
    this.on(socket, 'match:submit-word', submitWordSchema, async (payload) => {
      const { correct, finished } = await this.matches.submitWord({ userId, ...payload })
      if (finished) this.ended(finished)
      if (correct) await this.broadcast(payload.matchId)
      return {
        correct,
        state: await this.matches.state(userId, payload.matchId, (id) => this.isConnected(id)),
      }
    })
    this.on(socket, 'match:forfeit', matchRefSchema, async (payload) => {
      const finished = await this.matches.forfeit(userId, payload.matchId)
      if (finished) this.ended(finished)
      return this.matches.state(userId, payload.matchId, (id) => this.isConnected(id))
    })
    this.on(socket, 'match:resync', matchRefSchema, async (payload) =>
      this.matches.state(userId, payload.matchId, (id) => this.isConnected(id)),
    )

    socket.on('disconnect', () => {
      if (this.isConnected(userId)) return
      this.background(
        this.matches.markDisconnected(userId).then(async (matchId) => {
          if (!matchId) return
          this.scheduleGrace(userId, matchId)
          await this.broadcast(matchId)
        }),
      )
    })
  }

  /**
   * Enregistre un gestionnaire d'événement : limitation de débit, validation stricte,
   * erreurs métier renvoyées dans l'accusé de réception, erreurs internes masquées.
   */
  private on<P, R>(
    socket: MatchSocket,
    event: keyof ClientToServerEvents,
    schema: ZodType<P> | null,
    handler: (payload: P) => Promise<R>,
  ): void {
    const listener = (payload: unknown, ack: unknown): void => {
      if (typeof ack !== 'function') return
      const reply = ack as (res: Ack<R>) => void
      if (!this.consumeToken(socket)) {
        reply({
          ok: false,
          error: { code: ERROR_CODES.rateLimited, message: 'Trop d’actions, ralentissez.' },
        })
        return
      }
      let parsed: P
      if (schema) {
        const result = schema.safeParse(payload)
        if (!result.success) {
          reply({
            ok: false,
            error: { code: ERROR_CODES.validation, message: 'Message invalide.' },
          })
          return
        }
        parsed = result.data
      } else {
        parsed = undefined as P
      }
      handler(parsed).then(
        (data) => {
          reply({ ok: true, data })
        },
        (error: unknown) => {
          if (error instanceof AppError) {
            reply({ ok: false, error: { code: error.code, message: error.message } })
          } else {
            this.log.error({ err: error, event }, 'erreur dans un événement temps réel')
            reply({ ok: false, error: { code: ERROR_CODES.internal, message: 'Erreur interne.' } })
          }
        },
      )
    }
    // Le typage des événements est assuré par les schémas ; l'écoute se fait sur le socket non typé.
    ;(socket as unknown as Socket).on(event, listener)
  }

  private consumeToken(socket: MatchSocket): boolean {
    const now = Date.now()
    const data = socket.data
    data.tokens = Math.min(
      RATE.capacity,
      data.tokens + ((now - data.lastRefill) / 1000) * RATE.perSecond,
    )
    data.lastRefill = now
    if (data.tokens >= 1) {
      data.tokens -= 1
      return true
    }
    data.strikes += 1
    if (data.strikes > RATE.maxStrikes) socket.disconnect(true)
    return false
  }

  private async started(matchId: string): Promise<void> {
    const deadline = await this.matches.deadlineOf(matchId)
    if (deadline) this.scheduleDeadline(matchId, deadline)
    await this.broadcast(matchId)
  }

  private ended(result: FinishResult): void {
    this.clearDeadline(result.matchId)
    for (const userId of result.userIds) this.cancelGrace(userId)
    this.background(this.broadcast(result.matchId))
  }

  /** Tâche asynchrone détachée : toute erreur est journalisée, jamais laissée non gérée. */
  private background(task: Promise<unknown>): void {
    task.catch((error: unknown) => {
      this.log.error({ err: error }, 'erreur dans une tâche temps réel')
    })
  }

  /** Envoie à chaque participant sa propre vue du match. */
  private async broadcast(matchId: string): Promise<void> {
    for (const userId of await this.matches.participants(matchId)) {
      const state = await this.matches.state(userId, matchId, (id) => this.isConnected(id))
      this.io.to(this.room(userId)).emit('match:state', state)
    }
  }

  private scheduleDeadline(matchId: string, deadline: Date): void {
    this.clearDeadline(matchId)
    const delay = Math.max(0, deadline.getTime() - Date.now())
    const timer = setTimeout(() => {
      this.deadlineTimers.delete(matchId)
      this.background(
        this.matches.expire(matchId).then((finished) => {
          if (finished) this.ended(finished)
        }),
      )
    }, delay)
    timer.unref()
    this.deadlineTimers.set(matchId, timer)
  }

  private scheduleGrace(userId: string, matchId: string): void {
    this.cancelGrace(userId)
    const timer = setTimeout(() => {
      this.graceTimers.delete(userId)
      this.background(
        (async () => {
          if (this.isConnected(userId)) return
          if (!(await this.matches.stillDisconnected(userId, matchId, this.graceMs))) return
          const finished = await this.matches.forfeit(userId, matchId, 'disconnect')
          if (finished) this.ended(finished)
        })(),
      )
    }, this.graceMs)
    timer.unref()
    this.graceTimers.set(userId, timer)
  }

  private cancelGrace(userId: string): void {
    const timer = this.graceTimers.get(userId)
    if (timer) clearTimeout(timer)
    this.graceTimers.delete(userId)
  }

  private clearDeadline(matchId: string): void {
    const timer = this.deadlineTimers.get(matchId)
    if (timer) clearTimeout(timer)
    this.deadlineTimers.delete(matchId)
  }

  private clearTimers(): void {
    for (const timer of [...this.deadlineTimers.values(), ...this.graceTimers.values()])
      clearTimeout(timer)
    this.deadlineTimers.clear()
    this.graceTimers.clear()
  }

  private isConnected(userId: string): boolean {
    return (this.io.sockets.adapter.rooms.get(this.room(userId))?.size ?? 0) > 0
  }

  private room(userId: string): string {
    return `user:${userId}`
  }
}
