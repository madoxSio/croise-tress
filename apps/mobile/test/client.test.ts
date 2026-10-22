import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../src/api/client'
import { ApiRequestError } from '../src/api/errors'
import { bearerTransport, cookieTransport, memoryTokenStore } from '../src/api/transport'

const USER = {
  id: '00000000-0000-4000-8000-0000000000aa',
  username: null,
  isGuest: true,
  emailVerified: false,
  email: null,
}

interface Call {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly credentials: string | undefined
}

type Responder = (call: Call) => Response

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Faux serveur : enregistre les appels et répond selon `routes` (« MÉTHODE /chemin »). */
function fakeServer(routes: Record<string, Responder | Responder[]>) {
  const calls: Call[] = []
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString()
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      credentials: init?.credentials,
    }
    calls.push(call)
    const key = `${call.method} ${new URL(url, 'http://local').pathname.replace('/api/v1', '')}`
    const route = routes[key]
    const responder = Array.isArray(route) ? route.shift() : route
    if (!responder) return Promise.reject(new TypeError(`route inattendue ${key}`))
    return Promise.resolve(responder(call))
  }
  return { calls, fetch: fetchImpl }
}

describe('client API — mode cookie (version web)', () => {
  it('ouvre une session invitée puis envoie le jeton CSRF sur les requêtes mutantes', async () => {
    const server = fakeServer({
      'GET /session': () => json(200, { user: null, csrfToken: null }),
      'POST /session/guest': () => json(201, { user: USER, csrfToken: 'csrf-1' }),
      'PUT /me/favorites/p1': () => new Response(null, { status: 204 }),
    })
    const client = new ApiClient({ baseUrl: '', transport: cookieTransport, fetch: server.fetch })

    await client.addFavorite('p1')

    expect(server.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/session',
      'POST /api/v1/session/guest',
      'PUT /api/v1/me/favorites/p1',
    ])
    expect(server.calls[2]?.headers['x-csrf-token']).toBe('csrf-1')
    expect(server.calls.every((c) => c.credentials === 'same-origin')).toBe(true)
    expect(server.calls.some((c) => 'authorization' in c.headers)).toBe(false)
  })

  it('rafraîchit le jeton CSRF une seule fois quand il est refusé', async () => {
    const csrfError = () =>
      json(403, { error: { code: 'csrf_rejected', message: 'Jeton CSRF manquant ou invalide.' } })
    const server = fakeServer({
      'GET /session': [
        () => json(200, { user: USER, csrfToken: 'ancien' }),
        () => json(200, { user: USER, csrfToken: 'nouveau' }),
        () => json(200, { user: USER, csrfToken: 'encore' }),
      ],
      'PUT /me/favorites/p1': [csrfError, () => new Response(null, { status: 204 })],
      'DELETE /me/favorites/p1': [csrfError, csrfError],
    })
    const client = new ApiClient({ baseUrl: '', transport: cookieTransport, fetch: server.fetch })

    await client.addFavorite('p1')
    expect(server.calls.at(-1)?.headers['x-csrf-token']).toBe('nouveau')

    await expect(client.removeFavorite('p1')).rejects.toMatchObject({ code: 'csrf_rejected' })
  })
})

describe('client API — mode jeton (iOS, Android)', () => {
  it('range le jeton reçu, puis l’envoie en Authorization avec l’en-tête natif', async () => {
    const store = memoryTokenStore()
    const server = fakeServer({
      'GET /session': () => json(200, { user: null, csrfToken: null }),
      'POST /session/guest': () =>
        json(201, { user: USER, csrfToken: 'csrf-1', sessionToken: 'jeton-secret-0123456789' }),
      'GET /me/stats': () =>
        json(200, {
          completed: 0,
          withoutHelp: 0,
          dailyCompleted: 0,
          bestScore: null,
          averageDurationMs: null,
          byDifficulty: {},
        }),
    })
    const client = new ApiClient({
      baseUrl: 'https://api.example',
      transport: bearerTransport(store),
      fetch: server.fetch,
    })

    const session = await client.ensureSession()
    await client.getStats()

    expect(session).toEqual({ user: USER, csrfToken: 'csrf-1' })
    expect(await store.get()).toBe('jeton-secret-0123456789')
    expect(server.calls[0]?.url).toBe('https://api.example/api/v1/session')
    expect(server.calls[0]?.headers['authorization']).toBeUndefined()
    const last = server.calls.at(-1)
    expect(last?.headers['authorization']).toBe('Bearer jeton-secret-0123456789')
    expect(last?.headers['x-crossverse-client']).toBe('native')
    expect(server.calls.every((c) => c.credentials === 'omit')).toBe(true)
  })

  it('oublie le jeton à la déconnexion puis rouvre une session invitée', async () => {
    const store = memoryTokenStore('ancien-jeton-0123456789')
    const server = fakeServer({
      'GET /session': [
        () => json(200, { user: { ...USER, isGuest: false }, csrfToken: 'c1' }),
        () => json(200, { user: null, csrfToken: null }),
      ],
      'POST /auth/logout': () => new Response(null, { status: 204 }),
      'POST /session/guest': () =>
        json(201, { user: USER, csrfToken: 'c2', sessionToken: 'nouveau-jeton-0123456789' }),
    })
    const client = new ApiClient({
      baseUrl: '',
      transport: bearerTransport(store),
      fetch: server.fetch,
    })

    await client.ensureSession()
    const after = await client.logout()

    expect(after.user?.isGuest).toBe(true)
    expect(await store.get()).toBe('nouveau-jeton-0123456789')
    // La requête qui suit la déconnexion ne porte plus l'ancien jeton.
    const sessionAfterLogout = server.calls.find(
      (c, index) => index > 1 && c.url.endsWith('/session'),
    )
    expect(sessionAfterLogout?.headers['authorization']).toBeUndefined()
  })
})

describe('client API — fetch global', () => {
  it('appelle le fetch global sans le rattacher au client (« Illegal invocation »)', async () => {
    // Comme celui du navigateur, ce faux fetch refuse d'être appelé comme méthode d'un objet.
    const strictFetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(json(200, { items: [], nextCursor: null }))
    })
    vi.stubGlobal('fetch', strictFetch)
    try {
      const client = new ApiClient({ baseUrl: '', transport: cookieTransport })
      expect(await client.listPuzzles()).toEqual({ items: [], nextCursor: null })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('client API — erreurs', () => {
  it('signale une erreur réseau avec un statut 0', async () => {
    const client = new ApiClient({
      baseUrl: '',
      transport: cookieTransport,
      fetch: () => Promise.reject(new TypeError('hors ligne')),
    })
    await expect(client.listPuzzles()).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('refuse une réponse qui ne respecte pas le contrat', async () => {
    const server = fakeServer({ 'GET /puzzles': () => json(200, { items: 'pas une liste' }) })
    const client = new ApiClient({ baseUrl: '', transport: cookieTransport, fetch: server.fetch })
    await expect(client.listPuzzles()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('garde le code et le message d’erreur de l’API', async () => {
    const server = fakeServer({
      'GET /puzzles/x': () => json(404, { error: { code: 'not_found', message: 'Introuvable.' } }),
    })
    const client = new ApiClient({ baseUrl: '', transport: cookieTransport, fetch: server.fetch })
    const error: unknown = await client.getPuzzle('x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).isNotFound).toBe(true)
    expect((error as ApiRequestError).message).toBe('Introuvable.')
  })

  it('renvoie null quand il n’y a pas de défi du jour', async () => {
    const server = fakeServer({
      'GET /daily': () => json(404, { error: { code: 'not_found', message: 'Aucun défi.' } }),
    })
    const client = new ApiClient({ baseUrl: '', transport: cookieTransport, fetch: server.fetch })
    expect(await client.getDaily()).toBeNull()
  })
})
