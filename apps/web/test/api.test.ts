import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Réponses simulées de l'API, indexées par « MÉTHODE chemin ». */
type Handler = (init: RequestInit) => { status: number; body: unknown }

const USER = {
  id: '01a14a14-abfe-777e-8562-c5323b3bf9d1',
  username: null,
  isGuest: true,
  emailVerified: false,
  email: null,
}
const PLAY = {
  id: '01a14a15-8d17-724f-8df4-46b08f36350c',
  puzzleId: '01a14a07-9cf5-704f-afa3-629f1b4992ad',
  status: 'in_progress',
  grid: [[null]],
  revision: 0,
  hints: {
    cellChecks: 0,
    wordChecks: 0,
    lettersRevealed: 0,
    wordsRevealed: 0,
    solutionRevealed: false,
  },
  startedAt: '2026-10-17T13:37:11.408Z',
  completedAt: null,
  durationMs: null,
  score: null,
}

let handlers: Record<string, Handler>
let calls: { key: string; headers: Headers; body: unknown }[]

function install(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init: RequestInit = {}) => {
      const key = `${init.method ?? 'GET'} ${input}`
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null
      calls.push({ key, headers: new Headers(init.headers), body })
      const handler = handlers[key]
      const result = handler ? handler(init) : { status: 404, body: null }
      return Promise.resolve(new Response(JSON.stringify(result.body), { status: result.status }))
    }),
  )
}

async function loadApi() {
  // Module neuf à chaque test : le jeton CSRF est un état de module.
  vi.resetModules()
  return import('../app/services/api')
}

beforeEach(() => {
  calls = []
  handlers = {}
  install()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('services/api', () => {
  it('crée une session invitée sans interblocage puis envoie le jeton CSRF', async () => {
    handlers['GET /api/v1/session'] = () => ({ status: 200, body: { user: null, csrfToken: null } })
    handlers['POST /api/v1/session/guest'] = () => ({
      status: 201,
      body: { user: USER, csrfToken: 'jeton' },
    })
    handlers['POST /api/v1/play-sessions'] = () => ({ status: 201, body: PLAY })
    const { api } = await loadApi()

    const session = await api.ensureSession()
    expect(session.user?.isGuest).toBe(true)

    const play = await api.startPlay(PLAY.puzzleId)
    expect(play.id).toBe(PLAY.id)

    const start = calls.find((call) => call.key === 'POST /api/v1/play-sessions')
    expect(start?.headers.get('x-csrf-token')).toBe('jeton')
    expect(start?.headers.get('content-type')).toBe('application/json')
    expect(start?.body).toEqual({ puzzleId: PLAY.puzzleId })
    // Une seule ouverture de session malgré deux appels.
    expect(calls.filter((call) => call.key === 'POST /api/v1/session/guest')).toHaveLength(1)
  })

  it('rafraîchit le jeton une fois si le serveur le refuse', async () => {
    let token = 'ancien'
    handlers['GET /api/v1/session'] = () => ({
      status: 200,
      body: { user: USER, csrfToken: token },
    })
    let attempts = 0
    handlers['PUT /api/v1/play-sessions/' + PLAY.id + '/grid'] = (init) => {
      attempts++
      const sent = new Headers(init.headers).get('x-csrf-token')
      if (sent !== 'nouveau') {
        token = 'nouveau'
        return { status: 403, body: { error: { code: 'csrf_rejected', message: 'Refusé' } } }
      }
      return { status: 200, body: { ...PLAY, revision: 1 } }
    }
    const { api } = await loadApi()
    const saved = await api.saveGrid(PLAY.id, { grid: [['A']], revision: 0 })
    expect(saved.revision).toBe(1)
    expect(attempts).toBe(2)
  })

  it('transforme les erreurs en ApiRequestError typée', async () => {
    handlers['GET /api/v1/session'] = () => ({ status: 200, body: { user: USER, csrfToken: 't' } })
    handlers['PUT /api/v1/play-sessions/' + PLAY.id + '/grid'] = () => ({
      status: 409,
      body: { error: { code: 'conflict', message: 'Révision périmée' } },
    })
    const { api, ApiRequestError } = await loadApi()
    const error: unknown = await api
      .saveGrid(PLAY.id, { grid: [['A']], revision: 0 })
      .catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 409, code: 'conflict', message: 'Révision périmée' })
  })

  it('rejette une réponse qui ne respecte pas le contrat', async () => {
    handlers['GET /api/v1/puzzles/x'] = () => ({ status: 200, body: { id: 'x' } })
    const { api } = await loadApi()
    await expect(api.getPuzzle('x')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('renvoie null quand il n’y a pas de défi du jour', async () => {
    handlers['GET /api/v1/daily'] = () => ({
      status: 404,
      body: { error: { code: 'not_found', message: 'Aucun défi' } },
    })
    const { api } = await loadApi()
    await expect(api.getDaily()).resolves.toBeNull()
  })

  it('n’envoie que les filtres renseignés au catalogue', async () => {
    handlers['GET /api/v1/puzzles?difficulty=easy&limit=20'] = () => ({
      status: 200,
      body: { items: [], nextCursor: null },
    })
    const { api } = await loadApi()
    await expect(api.listPuzzles({ difficulty: 'easy', theme: '', limit: 20 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    })
  })
})

describe('services/api — compte et progression', () => {
  const ACCOUNT = { ...USER, username: 'ada', isGuest: false, emailVerified: true }
  const NO_CONTENT = { status: 204, body: undefined }

  /** Session invitée initiale (jeton « invite »), puis invité neuf après réinitialisation. */
  function guestSessions(): void {
    let guests = 0
    handlers['GET /api/v1/session'] = () => ({ status: 200, body: { user: null, csrfToken: null } })
    handlers['POST /api/v1/session/guest'] = () => {
      guests++
      return { status: 201, body: { user: USER, csrfToken: `invite-${guests}` } }
    }
  }

  const tokenOf = (key: string): string | null | undefined =>
    calls.findLast((call) => call.key === key)?.headers.get('x-csrf-token')

  it('adopte la session renvoyée par la connexion (jeton CSRF et utilisateur)', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/login'] = () => ({
      status: 200,
      body: { user: ACCOUNT, csrfToken: 'compte' },
    })
    handlers['POST /api/v1/play-sessions'] = () => ({ status: 201, body: PLAY })
    const { api } = await loadApi()

    const session = await api.login({ email: 'ada@example.org', password: 'secret' })
    expect(session.user?.username).toBe('ada')
    // La connexion elle-même part avec le jeton de la session invitée ouverte avant.
    expect(tokenOf('POST /api/v1/auth/login')).toBe('invite-1')
    expect(calls.find((c) => c.key === 'POST /api/v1/auth/login')?.body).toEqual({
      email: 'ada@example.org',
      password: 'secret',
    })

    await api.startPlay(PLAY.puzzleId)
    expect(tokenOf('POST /api/v1/play-sessions')).toBe('compte')
    // `ensureSession` ne renvoie plus l'ancienne session invitée.
    await expect(api.ensureSession()).resolves.toMatchObject({ user: { username: 'ada' } })
  })

  it('confirme l’e-mail et adopte la session du compte', async () => {
    guestSessions()
    const token = 'a'.repeat(43)
    handlers['POST /api/v1/auth/verify-email'] = () => ({
      status: 200,
      body: { user: ACCOUNT, csrfToken: 'compte' },
    })
    const { api } = await loadApi()
    await expect(api.verifyEmail(token)).resolves.toMatchObject({ csrfToken: 'compte' })
    expect(calls.find((c) => c.key === 'POST /api/v1/auth/verify-email')?.body).toEqual({ token })
    await expect(api.ensureSession()).resolves.toMatchObject({ user: { isGuest: false } })
  })

  it('se déconnecte (204) puis ouvre une nouvelle session invitée', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/logout'] = () => NO_CONTENT
    handlers['POST /api/v1/play-sessions'] = () => ({ status: 201, body: PLAY })
    const { api } = await loadApi()
    await api.ensureSession()

    const next = await api.logout()
    expect(next).toEqual({ user: USER, csrfToken: 'invite-2' })
    await api.startPlay(PLAY.puzzleId)
    expect(tokenOf('POST /api/v1/play-sessions')).toBe('invite-2')
  })

  it('considère une session déjà expirée comme déconnectée', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/logout'] = () => ({
      status: 401,
      body: { error: { code: 'unauthenticated', message: 'Session requise.' } },
    })
    const { api } = await loadApi()
    await expect(api.logout()).resolves.toMatchObject({ user: { isGuest: true } })
  })

  it('propage les autres erreurs de déconnexion sans oublier la session', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/logout'] = () => ({
      status: 500,
      body: { error: { code: 'internal_error', message: 'Erreur interne.' } },
    })
    const { api } = await loadApi()
    await expect(api.logout()).rejects.toMatchObject({ status: 500 })
    expect(calls.filter((c) => c.key === 'POST /api/v1/session/guest')).toHaveLength(1)
  })

  it('inscription et mot de passe oublié renvoient la réponse générique', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/register'] = () => ({ status: 202, body: { status: 'accepted' } })
    handlers['POST /api/v1/auth/password/forgot'] = () => ({
      status: 202,
      body: { status: 'accepted' },
    })
    const { api } = await loadApi()
    const body = { email: 'ada@example.org', username: 'ada', password: 'phrase de passe longue' }
    await expect(api.register(body)).resolves.toEqual({ status: 'accepted' })
    expect(calls.find((c) => c.key === 'POST /api/v1/auth/register')?.body).toEqual(body)
    await expect(api.forgotPassword('ada@example.org')).resolves.toEqual({ status: 'accepted' })
    expect(calls.find((c) => c.key === 'POST /api/v1/auth/password/forgot')?.body).toEqual({
      email: 'ada@example.org',
    })
  })

  it('réinitialise le mot de passe puis repart d’une session invitée', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/password/reset'] = () => NO_CONTENT
    const { api } = await loadApi()
    const next = await api.resetPassword({ token: 'b'.repeat(43), password: 'nouvelle phrase' })
    expect(next.csrfToken).toBe('invite-2')
  })

  it('supprime le compte avec le mot de passe (DELETE avec corps)', async () => {
    guestSessions()
    handlers['DELETE /api/v1/auth/account'] = () => NO_CONTENT
    const { api } = await loadApi()
    await api.ensureSession()
    const next = await api.deleteAccount('secret')
    const call = calls.find((c) => c.key === 'DELETE /api/v1/auth/account')
    expect(call?.body).toEqual({ password: 'secret' })
    expect(call?.headers.get('x-csrf-token')).toBe('invite-1')
    expect(next.csrfToken).toBe('invite-2')
  })

  it('changements de mot de passe et d’e-mail', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/password/change'] = () => NO_CONTENT
    handlers['POST /api/v1/auth/email/change'] = () => ({
      status: 202,
      body: { status: 'accepted' },
    })
    const { api } = await loadApi()
    await expect(
      api.changePassword({ currentPassword: 'ancien', newPassword: 'nouvelle phrase' }),
    ).resolves.toBeUndefined()
    await expect(
      api.changeEmail({ password: 'secret', newEmail: 'neuf@example.org' }),
    ).resolves.toEqual({ status: 'accepted' })
    expect(calls.find((c) => c.key === 'POST /api/v1/auth/email/change')?.body).toEqual({
      password: 'secret',
      newEmail: 'neuf@example.org',
    })
  })

  it('liste et ferme les sessions', async () => {
    guestSessions()
    const item = {
      id: PLAY.id,
      createdAt: '2026-10-17T13:37:11.408Z',
      lastSeenAt: '2026-10-17T14:00:00.000Z',
      current: false,
    }
    handlers['GET /api/v1/auth/sessions'] = () => ({ status: 200, body: { items: [item] } })
    handlers[`DELETE /api/v1/auth/sessions/${PLAY.id}`] = () => NO_CONTENT
    handlers['POST /api/v1/auth/sessions/revoke-others'] = () => NO_CONTENT
    const { api } = await loadApi()
    await expect(api.listSessions()).resolves.toEqual({ items: [item] })
    await expect(api.revokeSession(PLAY.id)).resolves.toBeUndefined()
    await expect(api.revokeOtherSessions()).resolves.toBeUndefined()
  })

  it('encode l’identifiant de session dans le chemin', async () => {
    guestSessions()
    handlers['DELETE /api/v1/auth/sessions/a%2Fb'] = () => NO_CONTENT
    const { api } = await loadApi()
    await expect(api.revokeSession('a/b')).resolves.toBeUndefined()
  })

  it('rejette un corps inattendu sur une réponse 200 censée être vide', async () => {
    guestSessions()
    handlers['POST /api/v1/auth/password/change'] = () => ({ status: 200, body: { ok: true } })
    const { api } = await loadApi()
    await expect(
      api.changePassword({ currentPassword: 'a', newPassword: 'b' }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('lit statistiques, succès et favoris, et modifie les favoris', async () => {
    guestSessions()
    const stats = {
      completed: 3,
      withoutHelp: 1,
      dailyCompleted: 0,
      bestScore: 980,
      averageDurationMs: 245000,
      byDifficulty: { easy: 2, hard: 1 },
    }
    const achievement = {
      code: 'first_win',
      title: 'Première grille',
      description: 'Terminer une grille.',
      unlockedAt: null,
    }
    handlers['GET /api/v1/me/stats'] = () => ({ status: 200, body: stats })
    handlers['GET /api/v1/me/achievements'] = () => ({
      status: 200,
      body: { items: [achievement] },
    })
    handlers['GET /api/v1/me/favorites'] = () => ({ status: 200, body: { items: [] } })
    handlers[`PUT /api/v1/me/favorites/${PLAY.puzzleId}`] = () => NO_CONTENT
    handlers[`DELETE /api/v1/me/favorites/${PLAY.puzzleId}`] = () => NO_CONTENT
    const { api } = await loadApi()

    await expect(api.getStats()).resolves.toEqual(stats)
    await expect(api.getAchievements()).resolves.toEqual({ items: [achievement] })
    await expect(api.getFavorites()).resolves.toEqual({ items: [] })
    await expect(api.addFavorite(PLAY.puzzleId)).resolves.toBeUndefined()
    await expect(api.removeFavorite(PLAY.puzzleId)).resolves.toBeUndefined()
    expect(tokenOf(`PUT /api/v1/me/favorites/${PLAY.puzzleId}`)).toBe('invite-1')
  })
})
