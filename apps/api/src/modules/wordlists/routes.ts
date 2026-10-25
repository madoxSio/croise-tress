import {
  listWordListsQuerySchema,
  uuidSchema,
  type WordListDto,
  type WordListList,
} from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { notFound, parseInput } from '../../http/errors.ts'
import type { WordListRepository } from './repository.ts'

const idParamsSchema = z.strictObject({ id: uuidSchema })

/** Mots mêlés : lecture publique, comme le catalogue des grilles (rien n'y est secret). */
export function wordListRoutes(app: FastifyInstance, wordLists: WordListRepository): void {
  app.get('/word-lists', async (request): Promise<WordListList> => {
    const query = parseInput(listWordListsQuerySchema, request.query)
    return wordLists.listPublished(query)
  })

  app.get('/word-lists/:id', async (request): Promise<WordListDto> => {
    const { id } = parseInput(idParamsSchema, request.params)
    const wordList = await wordLists.findPublished(id)
    if (!wordList) throw notFound('Mots mêlés introuvables.')
    return wordList
  })
}
