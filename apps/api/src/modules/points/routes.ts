import { uuidSchema, type PointTransactionPage, type WalletDto } from '@crossverse/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseInput } from '../../http/errors.ts'
import { requireAuth } from '../../plugins/auth.ts'
import type { PointsService } from './service.ts'

const transactionsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: uuidSchema.optional(),
})

export function pointsRoutes(app: FastifyInstance, points: PointsService): void {
  app.get('/me/wallet', async (request): Promise<WalletDto> =>
    points.wallet(requireAuth(request).user.id),
  )

  app.get('/me/wallet/transactions', async (request): Promise<PointTransactionPage> => {
    const auth = requireAuth(request)
    const query = parseInput(transactionsQuerySchema, request.query)
    return points.transactions(auth.user.id, query.limit, query.cursor)
  })
}
