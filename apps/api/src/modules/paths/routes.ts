import { pathSlugSchema, type PathDetail, type PathList } from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../http/errors.ts'
import type { PathService } from './service.ts'

const slugParamsSchema = z.strictObject({ slug: pathSlugSchema })

/** Lecture publique : sans session, toutes les étapes sauf la première apparaissent verrouillées. */
export function pathRoutes(app: FastifyInstance, paths: PathService): void {
  app.get('/paths', async (request): Promise<PathList> => ({
    items: await paths.list(request.auth?.user.id ?? null),
  }))

  app.get('/paths/:slug', async (request): Promise<PathDetail> => {
    const { slug } = parseInput(slugParamsSchema, request.params)
    return paths.detail(slug, request.auth?.user.id ?? null)
  })
}
