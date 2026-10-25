import {
  uuidSchema,
  wordSearchCheckBodySchema,
  wordSearchQuerySchema,
  wordSearchRevealBodySchema,
  type WordSearchCheckResult,
  type WordSearchDto,
  type WordSearchHit,
} from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../http/errors.ts'
import { requireAuth } from '../../plugins/auth.ts'
import type { WordSearchService } from './service.ts'

const idParamsSchema = z.strictObject({ id: uuidSchema })

/** Une session (invité compris) est exigée, comme pour le solo : elle porte la limite de débit. */
export function wordSearchRoutes(app: FastifyInstance, wordSearch: WordSearchService): void {
  app.get(
    '/puzzles/:id/word-search',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request): Promise<WordSearchDto> => {
      const auth = requireAuth(request)
      const { id } = parseInput(idParamsSchema, request.params)
      const { seed } = parseInput(wordSearchQuerySchema, request.query)
      return wordSearch.get(auth.user.id, id, seed)
    },
  )

  app.post(
    '/puzzles/:id/word-search/check',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request): Promise<WordSearchCheckResult> => {
      const auth = requireAuth(request)
      const { id } = parseInput(idParamsSchema, request.params)
      const body = parseInput(wordSearchCheckBodySchema, request.body)
      return { hit: await wordSearch.check(auth.user.id, id, body) }
    },
  )

  app.post(
    '/puzzles/:id/word-search/reveal',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request): Promise<WordSearchHit> => {
      const auth = requireAuth(request)
      const { id } = parseInput(idParamsSchema, request.params)
      const body = parseInput(wordSearchRevealBodySchema, request.body)
      return wordSearch.reveal(auth.user.id, id, body)
    },
  )
}
