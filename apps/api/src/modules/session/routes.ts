import type { SessionResponse } from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../../config.ts'
import { issueSession } from '../../plugins/auth.ts'
import type { AuthContext, SessionService } from './service.ts'

function toResponse(auth: AuthContext | null): SessionResponse {
  return auth ? { user: auth.user, csrfToken: auth.csrfToken } : { user: null, csrfToken: null }
}

export function sessionRoutes(
  app: FastifyInstance,
  config: Config,
  sessions: SessionService,
): void {
  app.get('/session', (request, reply) => reply.send(toResponse(request.auth)))

  app.post(
    '/session/guest',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      // Une session valide existe déjà : on la réutilise plutôt que de multiplier les invités.
      if (request.auth) return toResponse(request.auth)
      const { token, auth } = await sessions.createGuest()
      return reply.code(201).send(issueSession(request, reply, config, token, auth))
    },
  )
}
