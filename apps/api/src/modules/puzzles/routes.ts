import { toPublicPuzzle } from '@crossverse/crossword-core'
import {
  listPuzzlesQuerySchema,
  uuidSchema,
  type DailyChallenge,
  type PublicPuzzleDto,
  type PuzzleList,
} from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { notFound, parseInput } from '../../http/errors.ts'
import type { PuzzleRepository } from './repository.ts'

const idParamsSchema = z.strictObject({ id: uuidSchema })

/** Date du jour en UTC (décision D7), tronquée à minuit. */
export function utcToday(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function puzzleRoutes(
  app: FastifyInstance,
  puzzles: PuzzleRepository,
  now: () => Date,
): void {
  app.get('/puzzles', async (request): Promise<PuzzleList> => {
    const query = parseInput(listPuzzlesQuerySchema, request.query)
    return puzzles.listPublished(query)
  })

  app.get('/puzzles/:id', async (request): Promise<PublicPuzzleDto> => {
    const { id } = parseInput(idParamsSchema, request.params)
    const loaded = await puzzles.findPublished(id)
    if (!loaded) throw notFound('Puzzle introuvable.')
    const { cells, clues } = toPublicPuzzle(loaded.puzzle)
    return { ...loaded.summary, cells: cells.map((line) => [...line]), clues: [...clues] }
  })

  app.get('/daily', async (): Promise<DailyChallenge> => {
    const date = utcToday(now())
    const puzzle = await puzzles.findOrAssignDaily(date)
    if (!puzzle) throw notFound('Aucun défi pour aujourd’hui.')
    return { date: date.toISOString().slice(0, 10), puzzle }
  })
}
