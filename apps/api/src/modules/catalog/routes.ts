import { quickPlayQuerySchema, type Catalog, type QuickPlay } from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { notFound, parseInput } from '../../http/errors.ts'
import type { CatalogRepository } from './repository.ts'

export function catalogRoutes(app: FastifyInstance, catalog: CatalogRepository): void {
  app.get('/catalog', async (): Promise<Catalog> => catalog.catalog())

  app.get('/quick-play', async (request): Promise<QuickPlay> => {
    const { theme, format } = parseInput(quickPlayQuerySchema, request.query)
    const puzzle = await catalog.quickPlay(theme, format)
    if (!puzzle) throw notFound('Aucune grille disponible pour une partie rapide.')
    return { puzzle }
  })
}
