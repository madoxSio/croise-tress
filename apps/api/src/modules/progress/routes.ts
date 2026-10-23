import {
  preferencesSchema,
  uuidSchema,
  type HistoryResponse,
  type ResumeResponse,
} from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../http/errors.ts'
import { requireAccount, requireAuth } from '../../plugins/auth.ts'
import { toDto, type PlayService } from '../play/service.ts'
import type { ProgressService } from './service.ts'

const historyQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: uuidSchema.optional(),
})

const puzzleParamsSchema = z.strictObject({ puzzleId: uuidSchema })

export function progressRoutes(
  app: FastifyInstance,
  play: PlayService,
  progress: ProgressService,
): void {
  // Suivi réservé aux comptes ; la partie en cours (resume) reste accessible à l'invité.
  app.get('/me/history', async (request): Promise<HistoryResponse> => {
    const auth = requireAccount(request)
    const query = parseInput(historyQuerySchema, request.query)
    return play.history(auth.user.id, query.limit, query.cursor)
  })

  app.get('/me/resume', async (request): Promise<ResumeResponse> => {
    const auth = requireAuth(request)
    const found = await play.resume(auth.user.id)
    if (!found) return { session: null, puzzle: null }
    const { puzzle, ...session } = found
    return { session: toDto(session), puzzle }
  })

  app.get('/me/stats', async (request) => progress.stats(requireAccount(request).user.id))

  app.get('/me/achievements', async (request) => ({
    items: await progress.achievements(requireAccount(request).user.id),
  }))

  app.get('/me/favorites', async (request) => ({
    items: await progress.favorites(requireAccount(request).user.id),
  }))

  app.put('/me/favorites/:puzzleId', async (request, reply) => {
    const auth = requireAccount(request)
    const { puzzleId } = parseInput(puzzleParamsSchema, request.params)
    await progress.addFavorite(auth.user.id, puzzleId)
    return reply.code(204).send()
  })

  app.delete('/me/favorites/:puzzleId', async (request, reply) => {
    const auth = requireAccount(request)
    const { puzzleId } = parseInput(puzzleParamsSchema, request.params)
    await progress.removeFavorite(auth.user.id, puzzleId)
    return reply.code(204).send()
  })

  app.get('/me/preferences', async (request) => progress.preferences(requireAuth(request).user.id))

  app.put('/me/preferences', async (request) => {
    const auth = requireAuth(request)
    return progress.savePreferences(auth.user.id, parseInput(preferencesSchema, request.body))
  })
}
