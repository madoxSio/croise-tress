import {
  checkBodySchema,
  hintBodySchema,
  saveGridBodySchema,
  startPlayBodySchema,
  uuidSchema,
  type CheckBody,
} from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../http/errors.ts'
import { requireAuth } from '../../plugins/auth.ts'
import { toDto, type PlayService } from './service.ts'

const idParamsSchema = z.strictObject({ id: uuidSchema })

export function playRoutes(app: FastifyInstance, play: PlayService): void {
  app.post('/play-sessions', async (request, reply) => {
    const auth = requireAuth(request)
    const { puzzleId } = parseInput(startPlayBodySchema, request.body)
    const { session, created } = await play.start(auth.user.id, puzzleId)
    return reply.code(created ? 201 : 200).send(toDto(session))
  })

  app.get('/play-sessions/:id', async (request) => {
    const auth = requireAuth(request)
    const { id } = parseInput(idParamsSchema, request.params)
    return toDto(await play.get(auth.user.id, id))
  })

  app.put('/play-sessions/:id/grid', async (request) => {
    const auth = requireAuth(request)
    const { id } = parseInput(idParamsSchema, request.params)
    const body = parseInput(saveGridBodySchema, request.body)
    return toDto(await play.saveGrid(auth.user.id, id, body.grid, body.revision))
  })

  app.post(
    '/play-sessions/:id/check',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const auth = requireAuth(request)
      const { id } = parseInput(idParamsSchema, request.params)
      const body: CheckBody = parseInput(checkBodySchema, request.body)
      const { cells, session } = await play.check(auth.user.id, id, body)
      return { cells, session: toDto(session) }
    },
  )

  app.post(
    '/play-sessions/:id/hints',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const auth = requireAuth(request)
      const { id } = parseInput(idParamsSchema, request.params)
      const body = parseInput(hintBodySchema, request.body)
      const { revealed, explanation, session } = await play.hint(auth.user.id, id, body)
      return { revealed, explanation, session: toDto(session) }
    },
  )
}
