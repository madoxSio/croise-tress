import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client, createTestContext, resetDatabase, type TestContext } from './helpers.ts'

let ctx: TestContext
beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await ctx.app.close()
  await ctx.db.$disconnect()
})
beforeEach(async () => {
  await resetDatabase(ctx.db)
})

describe('session invité', () => {
  it('sans cookie, GET /session renvoie un utilisateur nul', async () => {
    const res = await new Client(ctx.app).request('GET', '/api/v1/session')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ user: null, csrfToken: null })
  })

  it('crée un invité avec un cookie HttpOnly SameSite=Lax et un jeton stocké haché', async () => {
    const client = new Client(ctx.app)
    const res = await client.request('POST', '/api/v1/session/guest')
    expect(res.statusCode).toBe(201)
    const cookie = res.cookies.find((c) => c.name === 'cv_session')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Lax')
    expect(cookie?.path).toBe('/')
    const body = res.json<{ user: { isGuest: boolean }; csrfToken: string }>()
    expect(body.user.isGuest).toBe(true)
    expect(body.csrfToken).toMatch(/^[\w-]{43}$/)

    const stored = await ctx.db.session.findMany()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.tokenHash).not.toBe(cookie?.value)
    expect(stored[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('réutilise la session existante au lieu de créer un nouvel invité', async () => {
    const client = await new Client(ctx.app).guest()
    const again = await client.request('POST', '/api/v1/session/guest')
    expect(again.statusCode).toBe(200)
    expect(await ctx.db.user.count()).toBe(1)
  })

  it('ignore une session expirée ou révoquée', async () => {
    const client = await new Client(ctx.app).guest()
    await ctx.db.session.updateMany({ data: { revokedAt: new Date() } })
    expect((await client.request('GET', '/api/v1/session')).json()).toEqual({
      user: null,
      csrfToken: null,
    })
    await ctx.db.session.updateMany({
      data: { revokedAt: null, expiresAt: new Date(Date.now() - 1000) },
    })
    expect((await client.request('GET', '/api/v1/session')).json()).toEqual({
      user: null,
      csrfToken: null,
    })
  })
})

describe('limitation de débit', () => {
  it('limite la création d’invités par IP (30 par heure)', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) {
      statuses.push(
        (await new Client(ctx.app, '10.9.9.9').request('POST', '/api/v1/session/guest')).statusCode,
      )
    }
    expect(statuses.slice(0, 30).every((s) => s === 201)).toBe(true)
    expect(statuses[30]).toBe(429)
    expect(await ctx.db.user.count()).toBe(30)
  })
})

describe('protections CSRF (CSRF-01, CSRF-02)', () => {
  it('refuse une requête mutante depuis une origine étrangère ou sans Origin', async () => {
    const client = new Client(ctx.app)
    const foreign = await client.request('POST', '/api/v1/session/guest', undefined, {
      origin: 'https://evil.example',
    })
    expect(foreign.statusCode).toBe(403)
    expect(foreign.json()).toEqual({
      error: { code: 'csrf_rejected', message: 'Origine non autorisée.' },
    })
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/session/guest' })
    expect(res.statusCode).toBe(403)
    expect(await ctx.db.user.count()).toBe(0)
  })

  it('refuse une requête authentifiée sans jeton CSRF ou avec un mauvais jeton', async () => {
    const client = await new Client(ctx.app).guest()
    const missing = await client.request('POST', '/api/v1/session/guest', undefined, {
      'x-csrf-token': '',
    })
    expect(missing.statusCode).toBe(403)
    const wrong = await client.request('POST', '/api/v1/session/guest', undefined, {
      'x-csrf-token': 'x'.repeat(43),
    })
    expect(wrong.statusCode).toBe(403)
  })
})

describe('en-têtes et erreurs (CFG-01, VAL-05)', () => {
  it('pose les en-têtes de sécurité', async () => {
    const res = await new Client(ctx.app).request('GET', '/api/v1/health')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-security-policy']).toContain("default-src 'none'")
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
  })

  it('n’émet aucun en-tête CORS pour une origine étrangère (CFG-02)', async () => {
    const res = await new Client(ctx.app).request('GET', '/api/v1/health', undefined, {
      origin: 'https://evil.example',
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('renvoie une 404 générique pour une route inconnue', async () => {
    const res = await new Client(ctx.app).request('GET', '/api/v1/inexistant')
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Route introuvable.' } })
  })

  it('refuse un JSON malformé sans détail interne', async () => {
    const client = await new Client(ctx.app).guest()
    const res = await client.request('POST', '/api/v1/play-sessions', '{"puzzleId":', {
      'content-type': 'application/json',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      error: { code: 'validation_error', message: 'Requête invalide.' },
    })
  })

  it('refuse un corps trop volumineux (VAL-01)', async () => {
    const client = await new Client(ctx.app).guest()
    const res = await client.request('POST', '/api/v1/play-sessions', {
      puzzleId: 'x'.repeat(70_000),
    })
    expect(res.statusCode).toBe(413)
  })
})
