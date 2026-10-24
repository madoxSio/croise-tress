/**
 * Client HTTP unique de l'application mobile : tous les appels à l'API passent par ici.
 *
 * - La preuve de session dépend de la plateforme (`AuthTransport`) : cookie sur le web,
 *   jeton porteur rangé dans le coffre du système sur iOS et Android.
 * - Toute requête mutante porte le jeton anti-CSRF obtenu par `GET /session`.
 * - Toute réponse est validée par le schéma Zod du paquet `contracts` : une réponse
 *   inattendue devient une erreur typée plutôt qu'un état incohérent à l'écran.
 */
import {
  API_PREFIX,
  CSRF_HEADER,
  ERROR_CODES,
  acceptedResponseSchema,
  achievementListSchema,
  apiErrorSchema,
  catalogSchema,
  checkResponseSchema,
  dailyChallengeSchema,
  favoriteListSchema,
  hintResponseSchema,
  historyResponseSchema,
  playSessionSchema,
  publicPuzzleSchema,
  puzzleListSchema,
  quickPlaySchema,
  resumeResponseSchema,
  sessionListSchema,
  sessionResponseSchema,
  statsSchema,
  uuidSchema,
} from '@crossverse/contracts'
import type {
  CatalogTheme,
  CheckBody,
  DailyChallenge,
  Difficulty,
  HintBody,
  HintResponse,
  HistoryResponse,
  PlaySessionDto,
  PublicPuzzleDto,
  PuzzleList,
  PuzzleSummary,
  ResumeResponse,
  SessionResponse,
  Stats,
} from '@crossverse/contracts'
import { z } from 'zod'
import { ApiRequestError, CLIENT_ERROR_CODES } from './errors'
import type { AuthTransport, OpenedSession } from './transport'

export type CheckResponse = z.infer<typeof checkResponseSchema>
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>
export type SessionList = z.infer<typeof sessionListSchema>
export type AchievementList = z.infer<typeof achievementListSchema>
export type FavoriteList = z.infer<typeof favoriteListSchema>
export type PlayerGridInput = (string | null)[][]

/*
 * Réponses des routes du duel : `contracts` ne les définit pas encore (point ouvert de
 * PROGRESS.md) ; ces schémas reflètent `apps/api/src/modules/match/service.ts`, comme le web.
 */
const resultSchema = z.enum(['win', 'loss', 'draw'])
export const leaderboardSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      rank: z.int().positive(),
      username: z.string(),
      rating: z.int(),
      gamesPlayed: z.int(),
      wins: z.int(),
    }),
  ),
})
export type Leaderboard = z.infer<typeof leaderboardSchema>
export const matchHistorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      matchId: uuidSchema,
      mode: z.enum(['quick', 'private']),
      puzzleTitle: z.string(),
      opponent: z.string().nullable(),
      result: resultSchema.nullable(),
      endReason: z.string().nullable(),
      solvedCount: z.int(),
      endedAt: z.iso.datetime().nullable(),
    }),
  ),
})
export type MatchHistory = z.infer<typeof matchHistorySchema>
export const ratingSchema = z.strictObject({
  rating: z.int(),
  gamesPlayed: z.int(),
  wins: z.int(),
  losses: z.int(),
  draws: z.int(),
})
export type Rating = z.infer<typeof ratingSchema>

/** Réponse `204 No Content` : aucun corps à lire. */
const noContentSchema = z.undefined()

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  readonly body?: unknown
  /** Usage interne : évite de boucler si le jeton CSRF est refusé deux fois. */
  readonly retried?: boolean
  /** Requête d'ouverture de session : elle ne doit pas attendre `ensureSession()` (interblocage). */
  readonly opensSession?: boolean
}

export interface ListPuzzlesParams {
  readonly difficulty?: Difficulty
  readonly theme?: string
  readonly limit?: number
  readonly cursor?: string
}

export interface ApiClientOptions {
  /** Origine de l'API (`https://crossverse.example`), vide pour la même origine (web). */
  readonly baseUrl: string
  readonly transport: AuthTransport
  readonly fetch?: typeof fetch
  /** Prévient l'interface quand l'utilisateur courant change (connexion, déconnexion…). */
  readonly onSession?: (session: SessionResponse) => void
}

const GENERIC_MESSAGE = 'Le serveur a renvoyé une réponse inattendue.'
const NETWORK_MESSAGE = 'Connexion au serveur impossible. Vérifiez votre réseau.'

export function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

const segment = (id: string): string => encodeURIComponent(id)

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

export class ApiClient {
  private csrfToken: string | null = null
  private pendingSession: Promise<SessionResponse> | null = null
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: ApiClientOptions) {
    // Appel via une fonction fléchée : `fetch` du navigateur lève « Illegal invocation » s'il est
    // appelé comme méthode d'un autre objet (`this.fetchImpl(...)`).
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
  }

  /** Requête typée vers l'API ; la réponse est validée par `schema`. */
  async request<S extends z.ZodType>(
    method: Method,
    path: string,
    schema: S,
    options: RequestOptions = {},
  ): Promise<z.infer<S>> {
    const mutating = method !== 'GET'
    if (mutating && this.csrfToken === null && options.opensSession !== true) {
      await this.ensureSession()
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(await this.options.transport.headers()),
    }
    if (mutating) {
      headers['content-type'] = 'application/json'
      if (this.csrfToken !== null) headers[CSRF_HEADER] = this.csrfToken
    }

    let response: Response
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${API_PREFIX}${path}`, {
        method,
        headers,
        credentials: this.options.transport.credentials,
        body: mutating ? JSON.stringify(options.body ?? {}) : null,
      })
    } catch {
      throw new ApiRequestError(0, CLIENT_ERROR_CODES.network, NETWORK_MESSAGE)
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
        this.csrfToken = null
        await this.refreshSession()
        return this.request(method, path, schema, { ...options, retried: true })
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
      throw new ApiRequestError(
        response.status,
        CLIENT_ERROR_CODES.invalidResponse,
        GENERIC_MESSAGE,
      )
    }
    return parsed.data
  }

  // --- Session -------------------------------------------------------------

  private remember(session: SessionResponse): SessionResponse {
    this.csrfToken = session.csrfToken
    this.options.onSession?.(session)
    return session
  }

  /** Adopte une session que le serveur vient d'ouvrir (le jeton change avec elle). */
  private async open(response: Promise<OpenedSession>): Promise<SessionResponse> {
    const opened = await response
    await this.options.transport.sessionOpened(opened)
    // Le jeton brut reste dans le transport : le reste de l'application ne le voit jamais.
    const session: SessionResponse = { user: opened.user, csrfToken: opened.csrfToken }
    this.remember(session)
    this.pendingSession = Promise.resolve(session)
    return session
  }

  /** Oublie la session locale puis ouvre une nouvelle session invitée. */
  private async restartSession(): Promise<SessionResponse> {
    await this.options.transport.sessionClosed()
    this.csrfToken = null
    this.pendingSession = null
    return this.ensureSession()
  }

  private async refreshSession(): Promise<SessionResponse> {
    const current = this.remember(await this.request('GET', '/session', sessionResponseSchema))
    if (current.user !== null) return current
    // Pas encore de session valide : on crée un invité.
    return this.open(
      this.request('POST', '/session/guest', sessionResponseSchema, { opensSession: true }),
    )
  }

  /** Relit la session sur le serveur (ex. adresse confirmée depuis un autre appareil). */
  reloadSession(): Promise<SessionResponse> {
    this.pendingSession = null
    return this.ensureSession()
  }

  /**
   * Garantit une session (invitée au besoin) et un jeton CSRF. Les appels concurrents
   * partagent la même requête ; un échec permet de réessayer plus tard.
   */
  ensureSession(): Promise<SessionResponse> {
    this.pendingSession ??= this.refreshSession().catch((error: unknown) => {
      this.pendingSession = null
      throw error
    })
    return this.pendingSession
  }

  // --- Catalogue et parties solo --------------------------------------------

  listPuzzles(params: ListPuzzlesParams = {}): Promise<PuzzleList> {
    return this.request(
      'GET',
      `/puzzles${query({
        difficulty: params.difficulty,
        theme: params.theme,
        limit: params.limit,
        cursor: params.cursor,
      })}`,
      puzzleListSchema,
    )
  }

  /** Thèmes et sous-thèmes ayant au moins une grille, avec leur habillage. */
  async getCatalog(): Promise<CatalogTheme[]> {
    return (await this.request('GET', '/catalog', catalogSchema)).themes
  }

  /** Grille simple tirée au hasard (éventuellement dans un thème), ou `null` s'il n'y en a pas. */
  async quickPlay(theme?: string): Promise<PuzzleSummary | null> {
    try {
      return (await this.request('GET', `/quick-play${query({ theme })}`, quickPlaySchema)).puzzle
    } catch (error) {
      if (error instanceof ApiRequestError && error.isNotFound) return null
      throw error
    }
  }

  getPuzzle(id: string): Promise<PublicPuzzleDto> {
    return this.request('GET', `/puzzles/${segment(id)}`, publicPuzzleSchema)
  }

  /** Défi du jour, ou `null` s'il n'y en a pas (404). */
  async getDaily(): Promise<DailyChallenge | null> {
    try {
      return await this.request('GET', '/daily', dailyChallengeSchema)
    } catch (error) {
      if (error instanceof ApiRequestError && error.isNotFound) return null
      throw error
    }
  }

  /** Démarre une partie, ou reprend celle en cours pour ce puzzle. */
  startPlay(puzzleId: string): Promise<PlaySessionDto> {
    return this.request('POST', '/play-sessions', playSessionSchema, { body: { puzzleId } })
  }

  getPlay(sessionId: string): Promise<PlaySessionDto> {
    return this.request('GET', `/play-sessions/${segment(sessionId)}`, playSessionSchema)
  }

  saveGrid(
    sessionId: string,
    body: { grid: PlayerGridInput; revision: number },
  ): Promise<PlaySessionDto> {
    return this.request('PUT', `/play-sessions/${segment(sessionId)}/grid`, playSessionSchema, {
      body,
    })
  }

  check(sessionId: string, body: CheckBody): Promise<CheckResponse> {
    return this.request('POST', `/play-sessions/${segment(sessionId)}/check`, checkResponseSchema, {
      body,
    })
  }

  hint(sessionId: string, body: HintBody): Promise<HintResponse> {
    return this.request('POST', `/play-sessions/${segment(sessionId)}/hints`, hintResponseSchema, {
      body,
    })
  }

  getHistory(): Promise<HistoryResponse> {
    return this.request('GET', '/me/history', historyResponseSchema)
  }

  getResume(): Promise<ResumeResponse> {
    return this.request('GET', '/me/resume', resumeResponseSchema)
  }

  // --- Compte ----------------------------------------------------------------

  /** Prépare l'inscription du compte invité courant ; un e-mail de confirmation suit. */
  register(body: { email: string; username: string; password: string }): Promise<AcceptedResponse> {
    return this.request('POST', '/auth/register', acceptedResponseSchema, { body })
  }

  /** Confirme une inscription ou un changement d'e-mail ; la session devient celle du compte. */
  verifyEmail(token: string): Promise<SessionResponse> {
    return this.open(
      this.request('POST', '/auth/verify-email', sessionResponseSchema, { body: { token } }),
    )
  }

  login(body: { email: string; password: string }): Promise<SessionResponse> {
    return this.open(this.request('POST', '/auth/login', sessionResponseSchema, { body }))
  }

  /** Ferme la session puis en ouvre une invitée ; renvoie cette nouvelle session. */
  async logout(): Promise<SessionResponse> {
    try {
      await this.request('POST', '/auth/logout', noContentSchema)
    } catch (error) {
      // Session déjà expirée ou révoquée ailleurs : le résultat voulu est atteint.
      if (!(error instanceof ApiRequestError && error.status === 401)) throw error
    }
    return this.restartSession()
  }

  /** Réponse identique que l'adresse soit connue ou non (anti-énumération). */
  forgotPassword(email: string): Promise<AcceptedResponse> {
    return this.request('POST', '/auth/password/forgot', acceptedResponseSchema, {
      body: { email },
    })
  }

  /** Le serveur ferme toutes les sessions du compte. */
  async resetPassword(body: { token: string; password: string }): Promise<SessionResponse> {
    await this.request('POST', '/auth/password/reset', noContentSchema, { body })
    return this.restartSession()
  }

  async changePassword(body: { currentPassword: string; newPassword: string }): Promise<void> {
    await this.request('POST', '/auth/password/change', noContentSchema, { body })
  }

  listSessions(): Promise<SessionList> {
    return this.request('GET', '/auth/sessions', sessionListSchema)
  }

  async revokeSession(id: string): Promise<void> {
    await this.request('DELETE', `/auth/sessions/${segment(id)}`, noContentSchema)
  }

  /** Suppression définitive ; renvoie la session invitée ouverte ensuite. */
  async deleteAccount(password: string): Promise<SessionResponse> {
    await this.request('DELETE', '/auth/account', noContentSchema, { body: { password } })
    return this.restartSession()
  }

  // --- Progression -----------------------------------------------------------

  getStats(): Promise<Stats> {
    return this.request('GET', '/me/stats', statsSchema)
  }

  getAchievements(): Promise<AchievementList> {
    return this.request('GET', '/me/achievements', achievementListSchema)
  }

  getFavorites(): Promise<FavoriteList> {
    return this.request('GET', '/me/favorites', favoriteListSchema)
  }

  async addFavorite(puzzleId: string): Promise<void> {
    await this.request('PUT', `/me/favorites/${segment(puzzleId)}`, noContentSchema)
  }

  async removeFavorite(puzzleId: string): Promise<void> {
    await this.request('DELETE', `/me/favorites/${segment(puzzleId)}`, noContentSchema)
  }

  // --- Duel ------------------------------------------------------------------

  leaderboard(limit?: number): Promise<Leaderboard> {
    return this.request('GET', `/leaderboard${query({ limit })}`, leaderboardSchema)
  }

  myMatches(limit?: number): Promise<MatchHistory> {
    return this.request('GET', `/me/matches${query({ limit })}`, matchHistorySchema)
  }

  myRating(): Promise<Rating> {
    return this.request('GET', '/me/rating', ratingSchema)
  }
}
