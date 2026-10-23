import type { Config } from '../../config.ts'
import type { Db } from '../../db.ts'
import { generateToken, hashToken } from './tokens.ts'

export interface AuthUser {
  readonly id: string
  readonly username: string | null
  readonly isGuest: boolean
  readonly emailVerified: boolean
  readonly email: string | null
}

export interface AuthContext {
  readonly sessionId: string
  readonly csrfToken: string
  readonly user: AuthUser
}

/** Ne met à jour `last_seen_at` qu'au plus une fois par intervalle pour limiter les écritures. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

const userSelect = {
  id: true,
  username: true,
  email: true,
  passwordHash: true,
  emailVerifiedAt: true,
  suspendedAt: true,
} as const

function toAuthUser(user: {
  id: string
  username: string | null
  email: string | null
  passwordHash: string | null
  emailVerifiedAt: Date | null
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    isGuest: user.passwordHash === null,
    emailVerified: user.emailVerifiedAt !== null,
    email: user.email,
  }
}

export class SessionService {
  constructor(
    private readonly db: Db,
    private readonly config: Config,
  ) {}

  /** Crée un compte invité et sa session. Renvoie le jeton brut, à placer uniquement dans le cookie. */
  async createGuest(): Promise<{ token: string; auth: AuthContext }> {
    const user = await this.db.user.create({ data: {}, select: { id: true } })
    return this.create(user.id)
  }

  /** Ouvre une nouvelle session (nouvel identifiant à chaque connexion : anti-fixation). */
  async create(userId: string): Promise<{ token: string; auth: AuthContext }> {
    const token = generateToken()
    const csrfToken = generateToken()
    const session = await this.db.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        csrfSecret: csrfToken,
        expiresAt: new Date(Date.now() + this.config.sessionTtlMs),
      },
      select: { id: true, user: { select: userSelect } },
    })
    return { token, auth: { sessionId: session.id, csrfToken, user: toAuthUser(session.user) } }
  }

  /** Résout une session valide (non expirée, non révoquée) à partir du jeton du cookie. */
  async resolve(token: string): Promise<AuthContext | null> {
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        csrfSecret: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        user: { select: userSelect },
      },
    })
    const now = Date.now()
    if (!session) return null
    if (session.revokedAt !== null || session.expiresAt.getTime() <= now) return null
    // Compte suspendu : ses sessions sont révoquées à la suspension, ce contrôle couvre la course.
    if (session.user.suspendedAt !== null) return null

    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      })
    }
    return { sessionId: session.id, csrfToken: session.csrfSecret, user: toAuthUser(session.user) }
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /** Révoque toutes les sessions d'un utilisateur, sauf éventuellement la session courante. */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    })
  }

  async list(userId: string, currentSessionId: string) {
    const rows = await this.db.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: { id: true, createdAt: true, lastSeenAt: true },
    })
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      current: row.id === currentSessionId,
    }))
  }
}
