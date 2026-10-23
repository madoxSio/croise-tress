import {
  adminPuzzleBodySchema,
  adminPuzzleListQuerySchema,
  adminPuzzleStatusBodySchema,
  adminUserListQuerySchema,
  auditListQuerySchema,
  uuidSchema,
} from '@crossverse/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { notFound, parseInput } from '../../http/errors.ts'
import { requireAuth } from '../../plugins/auth.ts'
import type { AuthContext } from '../session/service.ts'
import type { AdminService } from './service.ts'

const idParamsSchema = z.strictObject({ id: uuidSchema })

/**
 * Routes `/admin/*`. Chaque requête relit le rôle en base ; un non-administrateur (invité,
 * joueur, session absente) reçoit une 404 indiscernable d'une route inexistante, pour ne pas
 * signaler l'existence de l'espace d'administration (SECURITY-TEST-PLAN AUTHZ-03).
 */
export function adminRoutes(app: FastifyInstance, admin: AdminService): void {
  async function requireAdmin(request: FastifyRequest): Promise<AuthContext> {
    const auth = request.auth
    if (!auth || !(await admin.isAdmin(auth.user.id))) {
      if (auth) request.log.warn({ userId: auth.user.id }, 'accès admin refusé')
      throw notFound('Route introuvable.')
    }
    return requireAuth(request)
  }

  // Limite plus stricte que la limite globale : ces routes sont coûteuses (agrégats).
  const config = { rateLimit: { max: 120, timeWindow: '1 minute' } }

  app.get('/admin/me', { config }, async (request) => {
    await requireAdmin(request)
    return { isAdmin: true as const }
  })

  app.get('/admin/overview', { config }, async (request) => {
    await requireAdmin(request)
    return admin.overview()
  })

  app.get('/admin/users', { config }, async (request) => {
    await requireAdmin(request)
    return admin.listUsers(parseInput(adminUserListQuerySchema, request.query))
  })

  app.get('/admin/users/:id', { config }, async (request) => {
    const auth = await requireAdmin(request)
    const { id } = parseInput(idParamsSchema, request.params)
    const detail = await admin.userDetail(id)
    // Consulter le parcours d'un joueur est un accès à des données personnelles : tracé.
    await admin.audit(auth.user.id, 'user.view', id)
    return detail
  })

  app.get('/admin/puzzles', { config }, async (request) => {
    await requireAdmin(request)
    return admin.listPuzzles(parseInput(adminPuzzleListQuerySchema, request.query))
  })

  app.get('/admin/puzzles/:id', { config }, async (request) => {
    await requireAdmin(request)
    const { id } = parseInput(idParamsSchema, request.params)
    return admin.getPuzzle(id)
  })

  app.post('/admin/puzzles', { config }, async (request, reply) => {
    const auth = await requireAdmin(request)
    const puzzle = await admin.createPuzzle(parseInput(adminPuzzleBodySchema, request.body))
    await admin.audit(auth.user.id, 'puzzle.create', puzzle.slug)
    return reply.code(201).send(puzzle)
  })

  app.put('/admin/puzzles/:id', { config }, async (request) => {
    const auth = await requireAdmin(request)
    const { id } = parseInput(idParamsSchema, request.params)
    const puzzle = await admin.updatePuzzle(id, parseInput(adminPuzzleBodySchema, request.body))
    await admin.audit(auth.user.id, 'puzzle.update', puzzle.slug)
    return puzzle
  })

  app.put('/admin/puzzles/:id/status', { config }, async (request) => {
    const auth = await requireAdmin(request)
    const { id } = parseInput(idParamsSchema, request.params)
    const { status } = parseInput(adminPuzzleStatusBodySchema, request.body)
    const puzzle = await admin.setPuzzleStatus(id, status)
    await admin.audit(
      auth.user.id,
      status === 'published' ? 'puzzle.publish' : 'puzzle.unpublish',
      puzzle.slug,
    )
    return puzzle
  })

  app.get('/admin/audit', { config }, async (request) => {
    await requireAdmin(request)
    return admin.auditLog(parseInput(auditListQuerySchema, request.query))
  })
}
