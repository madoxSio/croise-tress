import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { API_PREFIX } from '@crossverse/contracts'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Config } from './config.ts'
import type { Db } from './db.ts'
import { registerErrorHandler } from './http/errors.ts'
import { adminRoutes } from './modules/admin/routes.ts'
import { AdminService } from './modules/admin/service.ts'
import { AdminUserService } from './modules/admin/users.ts'
import { authRoutes } from './modules/auth/routes.ts'
import { AuthService } from './modules/auth/service.ts'
import { SmtpMailer, type Mailer } from './modules/mail/mailer.ts'
import { playRoutes } from './modules/play/routes.ts'
import { PlayService } from './modules/play/service.ts'
import { progressRoutes } from './modules/progress/routes.ts'
import { ProgressService } from './modules/progress/service.ts'
import { puzzleRoutes } from './modules/puzzles/routes.ts'
import { PuzzleRepository } from './modules/puzzles/repository.ts'
import { sessionRoutes } from './modules/session/routes.ts'
import { SessionService } from './modules/session/service.ts'
import { registerAuth } from './plugins/auth.ts'
import { MatchGateway } from './modules/match/gateway.ts'
import { matchRoutes } from './modules/match/routes.ts'
import { MatchService } from './modules/match/service.ts'

export interface AppDeps {
  readonly config: Config
  readonly db: Db
  /** Horloge injectable pour les tests (défi du jour, durées). */
  readonly now?: () => Date
  /** Fournisseur d'e-mails ; SMTP par défaut. */
  readonly mailer?: Mailer
  /** Délai de grâce avant abandon d'un joueur déconnecté (raccourci en test). */
  readonly reconnectGraceMs?: number
}

/** N sauts de confiance depuis la droite de X-Forwarded-For (sémantique de `proxy-addr`). */
function trustHops(hops: number) {
  return (_address: string, hop: number): boolean => hop < hops
}

export async function buildApp({
  config,
  db,
  now = () => new Date(),
  mailer = new SmtpMailer(config),
  reconnectGraceMs,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[masqué]',
      },
    },
    trustProxy:
      typeof config.trustProxy === 'number' ? trustHops(config.trustProxy) : config.trustProxy,
    bodyLimit: 64 * 1024,
    disableRequestLogging: config.env === 'test',
  })

  registerErrorHandler(app)
  await app.register(helmet, {
    // API JSON uniquement : politique la plus stricte, aucune ressource à charger.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: config.isProduction,
  })
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' })
  await app.register(cookie)

  const sessions = new SessionService(db, config)
  const puzzles = new PuzzleRepository(db)
  const progress = new ProgressService(db)
  const play = new PlayService(db, puzzles, now, (session) => progress.onCompleted(session))
  const auth = new AuthService(db, config, sessions, mailer)
  const matches = new MatchService(db, puzzles, now)
  const admin = new AdminService(db, now)
  // La passerelle temps réel est créée après les routes : appel différé (jamais avant le démarrage).
  const adminUsers = new AdminUserService(db, sessions, now, (userId) => {
    gateway.disconnectUser(userId)
  })

  await app.register(
    (api, _opts, done) => {
      registerAuth(api, config, sessions)
      api.get('/health', (_request, reply) => reply.send({ status: 'ok' }))
      sessionRoutes(api, config, sessions)
      authRoutes(api, config, sessions, auth)
      puzzleRoutes(api, puzzles, now)
      playRoutes(api, play)
      progressRoutes(api, play, progress)
      matchRoutes(api, matches)
      adminRoutes(api, admin, adminUsers, auth)
      done()
    },
    { prefix: API_PREFIX },
  )

  const gateway = new MatchGateway(app, config, sessions, matches, reconnectGraceMs)
  app.addHook('onReady', () => gateway.recover())

  return app
}
