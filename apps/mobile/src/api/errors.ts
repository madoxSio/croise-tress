import { ERROR_CODES } from '@crossverse/contracts'

/** Codes d'erreur propres au client (réseau, réponse illisible), en plus de ceux de l'API. */
export const CLIENT_ERROR_CODES = {
  network: 'network_error',
  invalidResponse: 'invalid_response',
} as const

/** Erreur d'appel à l'API : `status` vaut 0 pour une erreur réseau. */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError'

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }

  get isConflict(): boolean {
    return this.code === ERROR_CODES.conflict || this.status === 409
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}

/** Message affichable pour une erreur quelconque. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  return 'Une erreur inattendue est survenue.'
}
