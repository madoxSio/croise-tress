import { CSRF_HEADER, ERROR_CODES } from '@crossverse/contracts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Config } from '../config.ts'
import { AppError } from '../http/errors.ts'
import type { AuthContext, SessionService } from '../modules/session/service.ts'
import { safeEqual } from '../modules/session/tokens.ts'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Résout la session depuis le cookie et applique les protections CSRF :
 * - toute requête mutante doit provenir d'une origine autorisée (en-tête Origin obligatoire) ;
 * - si elle est authentifiée, elle doit aussi porter le jeton CSRF de la session.
 */
export function registerAuth(app: FastifyInstance, config: Config, sessions: SessionService): void {
  app.decorateRequest('auth', null)

  app.addHook('onRequest', async (request) => {
    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin
      if (origin === undefined || !config.webOrigins.includes(origin)) {
        throw new AppError(403, ERROR_CODES.csrf, 'Origine non autorisée.')
      }
    }

    const token = request.cookies[config.sessionCookieName]
    request.auth = token ? await sessions.resolve(token) : null

    if (!SAFE_METHODS.has(request.method) && request.auth) {
      const header = request.headers[CSRF_HEADER]
      if (typeof header !== 'string' || !safeEqual(header, request.auth.csrfToken)) {
        throw new AppError(403, ERROR_CODES.csrf, 'Jeton CSRF manquant ou invalide.')
      }
    }
  })
}

/** Garde de route : exige une session valide et renvoie le contexte typé. */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError(401, ERROR_CODES.unauthenticated, 'Session requise.')
  return request.auth
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string): void {
  void reply.setCookie(config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  })
}
