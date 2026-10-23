/**
 * Client HTTP unique de l'application : tous les appels à l'API passent par ce module.
 *
 * - Même origine (`/api/v1`, proxifié vers Fastify en dev, reverse proxy en prod) :
 *   le cookie de session HttpOnly est envoyé automatiquement par le navigateur.
 * - Toute requête mutante porte le jeton anti-CSRF obtenu par `GET /session`.
 * - Toute réponse est validée par le schéma Zod du paquet `contracts` : une réponse
 *   inattendue devient une erreur typée plutôt qu'un état incohérent dans l'interface.
 */
import {
  API_PREFIX,
  CSRF_HEADER,
  ERROR_CODES,
  acceptedResponseSchema,
  achievementListSchema,
  apiErrorSchema,
  checkResponseSchema,
  dailyChallengeSchema,
  favoriteListSchema,
  hintResponseSchema,
  historyResponseSchema,
  pathDetailSchema,
  pathListSchema,
  playSessionSchema,
  pointTransactionPageSchema,
  publicPuzzleSchema,
  puzzleListSchema,
  resumeResponseSchema,
  sessionListSchema,
  sessionResponseSchema,
  statsSchema,
  walletSchema,
} from '@crossverse/contracts'
import type {
  CheckBody,
  DailyChallenge,
  HintBody,
  HintResponse,
  HistoryResponse,
  Difficulty,
  PathDetail,
  PathList,
  PointTransactionPage,
  PlaySessionDto,
  PublicPuzzleDto,
  PuzzleList,
  ResumeResponse,
  SessionResponse,
  Stats,
  WalletDto,
} from '@crossverse/contracts'
import { z } from 'zod'

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

export type CheckResponse = z.infer<typeof checkResponseSchema>
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>
export type SessionList = z.infer<typeof sessionListSchema>
export type AchievementList = z.infer<typeof achievementListSchema>
export type FavoriteList = z.infer<typeof favoriteListSchema>

/** Réponse `204 No Content` : aucun corps à lire. */
const noContentSchema = z.undefined()

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  readonly body?: unknown
  /** Permet à la requête de survivre à la fermeture de la page (sauvegarde de sortie). */
  readonly keepalive?: boolean
  /** Usage interne : évite de boucler si le jeton CSRF est refusé deux fois. */
  readonly retried?: boolean
  /**
   * Requête d'ouverture de session (création d'invité) : elle ne doit pas attendre
   * `ensureSession()`, dont elle fait elle-même partie (sinon interblocage).
   */
  readonly opensSession?: boolean
}

let csrfToken: string | null = null
let pendingSession: Promise<SessionResponse> | null = null

const GENERIC_MESSAGE = 'Le serveur a renvoyé une réponse inattendue.'

async function readError(response: Response): Promise<ApiRequestError> {
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Corps absent ou non JSON : on garde un message générique.
  }
  const parsed = apiErrorSchema.safeParse(payload)
  if (parsed.success) {
    return new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message)
  }
  return new ApiRequestError(response.status, `http_${response.status}`, GENERIC_MESSAGE)
}

/** Requête typée vers l'API ; réutilisée par les autres modules de `services/`. */
export async function request<S extends z.ZodType>(
  method: Method,
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const mutating = method !== 'GET'
  if (mutating && csrfToken === null && options.opensSession !== true) await ensureSession()

  const headers: Record<string, string> = { accept: 'application/json' }
  if (mutating) {
    headers['content-type'] = 'application/json'
    if (csrfToken !== null) headers[CSRF_HEADER] = csrfToken
  }

  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: mutating ? JSON.stringify(options.body ?? {}) : null,
      keepalive: options.keepalive ?? false,
    })
  } catch {
    throw new ApiRequestError(
      0,
      CLIENT_ERROR_CODES.network,
      'Connexion au serveur impossible. Vérifiez votre réseau.',
    )
  }

  if (!response.ok) {
    const error = await readError(response)
    // Jeton expiré ou session renouvelée ailleurs : on le rafraîchit une seule fois.
    if (
      error.code === ERROR_CODES.csrf &&
      mutating &&
      options.retried !== true &&
      options.opensSession !== true
    ) {
      csrfToken = null
      await refreshSession()
      return request(method, path, schema, { ...options, retried: true })
    }
    throw error
  }

  let payload: unknown
  if (response.status !== 204) {
    try {
      payload = await response.json()
    } catch {
      throw new ApiRequestError(
        response.status,
        CLIENT_ERROR_CODES.invalidResponse,
        GENERIC_MESSAGE,
      )
    }
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiRequestError(response.status, CLIENT_ERROR_CODES.invalidResponse, GENERIC_MESSAGE)
  }
  return parsed.data
}

function remember(session: SessionResponse): SessionResponse {
  csrfToken = session.csrfToken
  return session
}

/**
 * Adopte la session renvoyée par la connexion ou la confirmation d'e-mail : le serveur a
 * remplacé le cookie (rotation), le jeton CSRF et l'utilisateur changent avec lui.
 */
function adopt(session: SessionResponse): SessionResponse {
  remember(session)
  pendingSession = Promise.resolve(session)
  return session
}

/**
 * Oublie la session locale (déconnexion, suppression du compte, réinitialisation du mot de
 * passe : le serveur a effacé le cookie) puis ouvre une nouvelle session invitée.
 */
function restartSession(): Promise<SessionResponse> {
  csrfToken = null
  pendingSession = null
  return ensureSession()
}

async function refreshSession(): Promise<SessionResponse> {
  const current = remember(await request('GET', '/session', sessionResponseSchema))
  if (current.user !== null) return current
  // Pas encore de compte : on crée un invité (le serveur pose le cookie et renvoie le jeton).
  return remember(
    await request('POST', '/session/guest', sessionResponseSchema, { opensSession: true }),
  )
}

/**
 * Garantit une session (invitée au besoin) et un jeton CSRF. Les appels concurrents
 * partagent la même requête ; un échec permet de réessayer plus tard.
 */
export function ensureSession(): Promise<SessionResponse> {
  pendingSession ??= refreshSession().catch((error: unknown) => {
    pendingSession = null
    throw error
  })
  return pendingSession
}

export function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export const segment = (id: string): string => encodeURIComponent(id)

export type PlayerGridInput = (string | null)[][]

/**
 * Paramètres du catalogue. `ListPuzzlesQuery` (z.input) type `limit` en `unknown` à cause
 * de `z.coerce` : on expose ici un type client précis.
 */
export interface ListPuzzlesParams {
  readonly difficulty?: Difficulty
  readonly theme?: string
  readonly limit?: number
  readonly cursor?: string
}

export const api = {
  ensureSession,

  listPuzzles(params: ListPuzzlesParams = {}): Promise<PuzzleList> {
    return request(
      'GET',
      `/puzzles${query({
        difficulty: params.difficulty,
        theme: params.theme,
        limit: params.limit,
        cursor: params.cursor,
      })}`,
      puzzleListSchema,
    )
  },

  getPuzzle(id: string): Promise<PublicPuzzleDto> {
    return request('GET', `/puzzles/${segment(id)}`, publicPuzzleSchema)
  },

  /** Défi du jour, ou `null` s'il n'y en a pas (404). */
  async getDaily(): Promise<DailyChallenge | null> {
    try {
      return await request('GET', '/daily', dailyChallengeSchema)
    } catch (error) {
      if (error instanceof ApiRequestError && error.isNotFound) return null
      throw error
    }
  },

  /** Démarre une partie, ou reprend celle en cours pour ce puzzle. */
  startPlay(puzzleId: string): Promise<PlaySessionDto> {
    return request('POST', '/play-sessions', playSessionSchema, { body: { puzzleId } })
  },

  getPlay(sessionId: string): Promise<PlaySessionDto> {
    return request('GET', `/play-sessions/${segment(sessionId)}`, playSessionSchema)
  },

  saveGrid(
    sessionId: string,
    body: { grid: PlayerGridInput; revision: number },
    options: { keepalive?: boolean } = {},
  ): Promise<PlaySessionDto> {
    return request('PUT', `/play-sessions/${segment(sessionId)}/grid`, playSessionSchema, {
      body,
      keepalive: options.keepalive ?? false,
    })
  },

  check(sessionId: string, body: CheckBody): Promise<CheckResponse> {
    return request('POST', `/play-sessions/${segment(sessionId)}/check`, checkResponseSchema, {
      body,
    })
  },

  hint(sessionId: string, body: HintBody): Promise<HintResponse> {
    return request('POST', `/play-sessions/${segment(sessionId)}/hints`, hintResponseSchema, {
      body,
    })
  },

  getHistory(): Promise<HistoryResponse> {
    return request('GET', '/me/history', historyResponseSchema)
  },

  getResume(): Promise<ResumeResponse> {
    return request('GET', '/me/resume', resumeResponseSchema)
  },

  // --- Compte ---

  /** Prépare l'inscription du compte invité courant ; un e-mail de confirmation suit. */
  register(body: { email: string; username: string; password: string }): Promise<AcceptedResponse> {
    return request('POST', '/auth/register', acceptedResponseSchema, { body })
  },

  /** Confirme une inscription ou un changement d'e-mail ; la session devient celle du compte. */
  async verifyEmail(token: string): Promise<SessionResponse> {
    return adopt(
      await request('POST', '/auth/verify-email', sessionResponseSchema, { body: { token } }),
    )
  },

  async login(body: { email: string; password: string }): Promise<SessionResponse> {
    return adopt(await request('POST', '/auth/login', sessionResponseSchema, { body }))
  },

  /** Ferme la session puis en ouvre une invitée ; renvoie cette nouvelle session. */
  async logout(): Promise<SessionResponse> {
    try {
      await request('POST', '/auth/logout', noContentSchema)
    } catch (error) {
      // Session déjà expirée ou révoquée ailleurs : le résultat voulu est atteint.
      if (!(error instanceof ApiRequestError && error.status === 401)) throw error
    }
    return restartSession()
  },

  /** Réponse identique que l'adresse soit connue ou non (anti-énumération). */
  forgotPassword(email: string): Promise<AcceptedResponse> {
    return request('POST', '/auth/password/forgot', acceptedResponseSchema, { body: { email } })
  },

  /** Le serveur ferme toutes les sessions du compte et efface le cookie de ce navigateur. */
  async resetPassword(body: { token: string; password: string }): Promise<SessionResponse> {
    await request('POST', '/auth/password/reset', noContentSchema, { body })
    return restartSession()
  },

  /** Les autres sessions du compte sont fermées par le serveur ; celle-ci reste ouverte. */
  async changePassword(body: { currentPassword: string; newPassword: string }): Promise<void> {
    await request('POST', '/auth/password/change', noContentSchema, { body })
  },

  /** Envoie un lien de confirmation à la nouvelle adresse (réponse générique). */
  changeEmail(body: { password: string; newEmail: string }): Promise<AcceptedResponse> {
    return request('POST', '/auth/email/change', acceptedResponseSchema, { body })
  },

  listSessions(): Promise<SessionList> {
    return request('GET', '/auth/sessions', sessionListSchema)
  },

  async revokeSession(id: string): Promise<void> {
    await request('DELETE', `/auth/sessions/${segment(id)}`, noContentSchema)
  },

  async revokeOtherSessions(): Promise<void> {
    await request('POST', '/auth/sessions/revoke-others', noContentSchema)
  },

  /** Suppression définitive ; renvoie la session invitée ouverte ensuite. */
  async deleteAccount(password: string): Promise<SessionResponse> {
    await request('DELETE', '/auth/account', noContentSchema, { body: { password } })
    return restartSession()
  },

  // --- Parcours et Coumba points ---

  listPaths(): Promise<PathList> {
    return request('GET', '/paths', pathListSchema)
  },

  getPath(slug: string): Promise<PathDetail> {
    return request('GET', `/paths/${segment(slug)}`, pathDetailSchema)
  },

  /** Solde et règles (indices gratuits, coûts) ; `eligible` est faux pour un invité. */
  getWallet(): Promise<WalletDto> {
    return request('GET', '/me/wallet', walletSchema)
  },

  getWalletTransactions(cursor?: string): Promise<PointTransactionPage> {
    return request(
      'GET',
      `/me/wallet/transactions${query({ limit: 20, cursor })}`,
      pointTransactionPageSchema,
    )
  },

  // --- Progression ---

  getStats(): Promise<Stats> {
    return request('GET', '/me/stats', statsSchema)
  },

  getAchievements(): Promise<AchievementList> {
    return request('GET', '/me/achievements', achievementListSchema)
  },

  getFavorites(): Promise<FavoriteList> {
    return request('GET', '/me/favorites', favoriteListSchema)
  },

  async addFavorite(puzzleId: string): Promise<void> {
    await request('PUT', `/me/favorites/${segment(puzzleId)}`, noContentSchema)
  },

  async removeFavorite(puzzleId: string): Promise<void> {
    await request('DELETE', `/me/favorites/${segment(puzzleId)}`, noContentSchema)
  },
}

/** Message affichable pour une erreur quelconque. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  return 'Une erreur inattendue est survenue.'
}
