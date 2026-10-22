import {
  ERROR_CODES,
  changeEmailBodySchema,
  changePasswordBodySchema,
  deleteAccountBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  uuidSchema,
  verifyEmailBodySchema,
  type SessionResponse,
} from '@crossverse/contracts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import { AppError, notFound, parseInput } from '../../http/errors.ts'
import { clearSession, issueSession, requireAuth } from '../../plugins/auth.ts'
import type { SessionService } from '../session/service.ts'
import type { AuthService } from './service.ts'

const ACCEPTED = { status: 'accepted' } as const
const idParamsSchema = z.strictObject({ id: uuidSchema })

/** Limite par IP et par adresse e-mail visée (bourrage d'identifiants, abus d'envoi). */
function perEmail(max: number, timeWindow: string) {
  return {
    rateLimit: {
      max,
      timeWindow,
      // Après l'analyse du corps : sinon l'adresse est absente et la clé se réduit à l'IP.
      hook: 'preHandler' as const,
      keyGenerator: (request: FastifyRequest) => {
        const body = request.body as { email?: unknown } | undefined
        const email = typeof body?.email === 'string' ? body.email.toLowerCase() : ''
        return `${request.ip}|${email}`
      },
    },
  }
}

/**
 * Second plafond, par IP, cumulable avec `perEmail` (le plugin n'applique qu'une limite de route
 * par requête) : freine la pulvérisation d'un mot de passe sur de nombreuses adresses.
 */
function perIp(app: FastifyInstance, scope: string, max: number, timeWindow: string) {
  const check = app.createRateLimit({
    max,
    timeWindow,
    keyGenerator: (request) => `${scope}|${request.ip}`,
  })
  return async (request: FastifyRequest): Promise<void> => {
    // `isAllowed` ne signale que la liste d'exemption ; le dépassement est `isExceeded`.
    const result = await check(request)
    if (!result.isAllowed && result.isExceeded) {
      throw new AppError(429, ERROR_CODES.rateLimited, 'Trop de tentatives, réessayez plus tard.')
    }
  }
}

export function authRoutes(
  app: FastifyInstance,
  config: Config,
  sessions: SessionService,
  auth: AuthService,
): void {
  /** Remplace la session courante par une nouvelle session de `userId` (rotation). */
  async function switchSession(
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
  ): Promise<SessionResponse> {
    if (request.auth) await sessions.revoke(request.auth.sessionId)
    const { token, auth: next } = await sessions.create(userId)
    return issueSession(request, reply, config, token, next)
  }

  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const body = parseInput(registerBodySchema, request.body)
      await auth.register(requireAuth(request), body)
      return reply.code(202).send(ACCEPTED)
    },
  )

  app.post(
    '/auth/verify-email',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const { token } = parseInput(verifyEmailBodySchema, request.body)
      const userId = await auth.verifyEmail(token)
      return reply.send(await switchSession(request, reply, userId))
    },
  )

  // Deux niveaux : par adresse visée (devinette d'un mot de passe) et par IP (pulvérisation
  // sur de nombreuses adresses).
  app.post(
    '/auth/login',
    {
      config: perEmail(5, '15 minutes'),
      onRequest: perIp(app, 'login', 30, '15 minutes'),
    },
    async (request, reply) => {
      const { email, password } = parseInput(loginBodySchema, request.body)
      const userId = await auth.login(email, password)
      // Connexion depuis une session invitée : sa progression rejoint le compte.
      if (request.auth?.user.isGuest) await auth.mergeGuest(request.auth.user.id, userId)
      return reply.send(await switchSession(request, reply, userId))
    },
  )

  app.post('/auth/logout', async (request, reply) => {
    const current = requireAuth(request)
    await sessions.revoke(current.sessionId)
    clearSession(request, reply, config)
    return reply.code(204).send()
  })

  app.post(
    '/auth/password/forgot',
    {
      config: perEmail(3, '1 hour'),
      onRequest: perIp(app, 'forgot', 10, '1 hour'),
    },
    async (request, reply) => {
      const { email } = parseInput(forgotPasswordBodySchema, request.body)
      await auth.forgotPassword(email)
      return reply.code(202).send(ACCEPTED)
    },
  )

  app.post(
    '/auth/password/reset',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const { token, password } = parseInput(resetPasswordBodySchema, request.body)
      await auth.resetPassword(token, password)
      clearSession(request, reply, config)
      return reply.code(204).send()
    },
  )

  app.post(
    '/auth/password/change',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = parseInput(changePasswordBodySchema, request.body)
      await auth.changePassword(requireAuth(request), body.currentPassword, body.newPassword)
      return reply.code(204).send()
    },
  )

  app.post(
    '/auth/email/change',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const body = parseInput(changeEmailBodySchema, request.body)
      await auth.requestEmailChange(requireAuth(request), body.password, body.newEmail)
      return reply.code(202).send(ACCEPTED)
    },
  )

  app.get('/auth/sessions', async (request) => {
    const current = requireAuth(request)
    return { items: await sessions.list(current.user.id, current.sessionId) }
  })

  app.delete('/auth/sessions/:id', async (request, reply) => {
    const current = requireAuth(request)
    const { id } = parseInput(idParamsSchema, request.params)
    const owned = (await sessions.list(current.user.id, current.sessionId)).some((s) => s.id === id)
    if (!owned) throw notFound('Session introuvable.')
    await sessions.revoke(id)
    return reply.code(204).send()
  })

  app.post('/auth/sessions/revoke-others', async (request, reply) => {
    const current = requireAuth(request)
    await sessions.revokeAll(current.user.id, current.sessionId)
    return reply.code(204).send()
  })

  app.delete(
    '/auth/account',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = parseInput(deleteAccountBodySchema, request.body)
      await auth.deleteAccount(requireAuth(request), body.password)
      clearSession(request, reply, config)
      return reply.code(204).send()
    },
  )
}
