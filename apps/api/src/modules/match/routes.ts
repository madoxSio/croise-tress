import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../http/errors.ts'
import { requireAuth } from '../../plugins/auth.ts'
import type { MatchService } from './service.ts'

const limitSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50) })

export function matchRoutes(app: FastifyInstance, matches: MatchService): void {
  app.get('/leaderboard', async (request) => {
    const { limit } = parseInput(limitSchema, request.query)
    return { items: await matches.leaderboard(limit) }
  })

  app.get('/me/matches', async (request) => {
    const auth = requireAuth(request)
    const { limit } = parseInput(limitSchema, request.query)
    return { items: await matches.history(auth.user.id, limit) }
  })

  app.get('/me/rating', async (request) => {
    const auth = requireAuth(request)
    return matches.rating(auth.user.id)
  })
}
