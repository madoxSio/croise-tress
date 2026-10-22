import {
  CSRF_HEADER,
  ERROR_CODES,
  NATIVE_CLIENT_HEADER,
  NATIVE_CLIENT_VALUE,
  type SessionResponse,
} from '@crossverse/contracts'
import type { IncomingHttpHeaders } from 'node:http'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Config } from '../config.ts'
import { AppError } from '../http/errors.ts'
import type { AuthContext, SessionService } from '../modules/session/service.ts'
import { TOKEN_PATTERN, safeEqual } from '../modules/session/tokens.ts'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
    /** Client natif (app mobile) : jeton porteur au lieu du cookie, cf. `isNativeClient`. */
    nativeClient: boolean
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const BEARER_PREFIX = 'Bearer '

/**
 * Un client natif s'annonce par un en-tête personnalisé. Un navigateur ne peut pas l'envoyer
 * vers une autre origine sans pré-vol CORS, que l'API n'accorde à personne : cet en-tête ne
 * peut donc pas servir à une attaque CSRF, et le jeton porteur n'est jamais envoyé
 * automatiquement par un navigateur. Seul le contrôle d'`Origin` est alors sauté.
 */
export function isNativeClient(headers: IncomingHttpHeaders): boolean {
  return headers[NATIVE_CLIENT_HEADER] === NATIVE_CLIENT_VALUE
}

/** Jeton de session d'un client natif ; une forme invalide est refusée sans requête en base. */
export function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (header === undefined) return null
  const token = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : null
  if (!isSessionToken(token))
    throw new AppError(401, ERROR_CODES.unauthenticated, 'Jeton invalide.')
  return token
}

/**
 * Résout la session et applique les protections CSRF.
 *
 * Navigateur (cookie) :
 * - toute requête mutante doit provenir d'une origine autorisée (en-tête Origin obligatoire) ;
 * - si elle est authentifiée, elle doit aussi porter le jeton CSRF de la session.
 *
 * Client natif : la session vient uniquement de `Authorization: Bearer` (le cookie est ignoré),
 * l'en-tête Origin n'est pas exigé, le jeton CSRF l'est toujours.
 */
export function registerAuth(app: FastifyInstance, config: Config, sessions: SessionService): void {
  app.decorateRequest('auth', null)
  app.decorateRequest('nativeClient', false)

  app.addHook('onRequest', async (request) => {
    request.nativeClient = isNativeClient(request.headers)

    // Contrôle d'origine : propre aux navigateurs, sans objet pour un client natif (cf. ci-dessus).
    if (!request.nativeClient && !SAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin
      if (origin === undefined || !config.webOrigins.includes(origin)) {
        throw new AppError(403, ERROR_CODES.csrf, 'Origine non autorisée.')
      }
    }

    const token = request.nativeClient
      ? bearerToken(request)
      : request.cookies[config.sessionCookieName]
    request.auth = token ? await sessions.resolve(token) : null

    // Le jeton CSRF reste exigé dans les deux modes (défense en profondeur).
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

/**
 * Remet une session qui vient de s'ouvrir à son client : cookie HttpOnly pour un navigateur,
 * jeton dans le corps pour un client natif (qui le range dans son stockage sécurisé).
 */
export function issueSession(
  request: FastifyRequest,
  reply: FastifyReply,
  config: Config,
  token: string,
  auth: AuthContext,
): SessionResponse {
  const response = { user: auth.user, csrfToken: auth.csrfToken }
  if (request.nativeClient) return { ...response, sessionToken: token }
  setSessionCookie(reply, config, token)
  return response
}

/** Efface le cookie de session d'un navigateur ; un client natif oublie lui-même son jeton. */
export function clearSession(request: FastifyRequest, reply: FastifyReply, config: Config): void {
  if (!request.nativeClient) void reply.clearCookie(config.sessionCookieName, { path: '/' })
}
