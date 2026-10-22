import { ERROR_CODES } from '@crossverse/contracts'
import type { FastifyError, FastifyInstance } from 'fastify'
import type { ZodError, ZodType } from 'zod'

type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** Erreur métier transmise telle quelle au client (code stable + message sans détail interne). */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export const notFound = (message = 'Ressource introuvable.'): AppError =>
  new AppError(404, ERROR_CODES.notFound, message)
export const conflict = (message: string): AppError =>
  new AppError(409, ERROR_CODES.conflict, message)

/** Valide une entrée avec un schéma strict ; toute erreur devient une 400 sans écho des valeurs. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(racine)')),
    ]
    throw new AppError(400, ERROR_CODES.validation, `Requête invalide : ${fields.join(', ')}.`)
  }
  return result.data
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    void reply
      .code(404)
      .send({ error: { code: ERROR_CODES.notFound, message: 'Route introuvable.' } })
  })

  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, 'erreur de service')
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } })
    }
    const status =
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500
    if (status === 429) {
      return reply.code(429).send({
        error: {
          code: ERROR_CODES.rateLimited,
          message: 'Trop de requêtes, réessayez plus tard.',
        },
      })
    }
    if (status >= 400 && status < 500) {
      // Erreurs du framework (JSON invalide, corps trop gros…) : message générique.
      return reply
        .code(status)
        .send({ error: { code: ERROR_CODES.validation, message: 'Requête invalide.' } })
    }
    request.log.error({ err: error }, 'erreur non gérée')
    return reply
      .code(500)
      .send({ error: { code: ERROR_CODES.internal, message: 'Erreur interne.' } })
  })
}
