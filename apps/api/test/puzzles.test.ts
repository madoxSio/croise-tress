import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  Client,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  type TestContext,
} from './helpers.ts'

let ctx: TestContext
let ids: Record<string, string>
beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await ctx.app.close()
  await ctx.db.$disconnect()
})
beforeEach(async () => {
  await resetDatabase(ctx.db)
  ids = await seedPuzzles(ctx.db)
})

/** Recherche récursive d'une clé ou d'une valeur dans un JSON arbitraire. */
function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key))
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k === key || containsKey(v, key))
  }
  return false
}

describe('catalogue', () => {
  it('liste les puzzles publiés avec pagination par curseur', async () => {
    const client = new Client(ctx.app)
    const first = await client.request('GET', '/api/v1/puzzles?limit=4')
    expect(first.statusCode).toBe(200)
    const page1 = first.json<{ items: { id: string }[]; nextCursor: string | null }>()
    expect(page1.items).toHaveLength(4)
    expect(page1.nextCursor).not.toBeNull()
    const second = await client.request(
      'GET',
      `/api/v1/puzzles?limit=4&cursor=${page1.nextCursor ?? ''}`,
    )
    const page2 = second.json<{ items: { id: string }[]; nextCursor: string | null }>()
    expect(page2.items).toHaveLength(2)
    expect(page2.nextCursor).toBeNull()
    expect(new Set([...page1.items, ...page2.items].map((p) => p.id)).size).toBe(6)
  })

  it('filtre par difficulté et thème', async () => {
    const res = await new Client(ctx.app).request(
      'GET',
      '/api/v1/puzzles?difficulty=easy&theme=animaux',
    )
    expect(res.json<{ items: { slug: string }[] }>().items.map((p) => p.slug)).toEqual([
      'chien-fidele',
    ])
  })

  it('refuse des paramètres invalides (VAL-04, AUTHZ-04)', async () => {
    const client = new Client(ctx.app)
    expect((await client.request('GET', '/api/v1/puzzles?limit=100000')).statusCode).toBe(400)
    expect((await client.request('GET', '/api/v1/puzzles?difficulty=impossible')).statusCode).toBe(
      400,
    )
    expect((await client.request('GET', '/api/v1/puzzles?status=draft')).statusCode).toBe(400)
  })

  it('n’expose pas les brouillons', async () => {
    await ctx.db.puzzle.update({ where: { id: ids['la-table'] ?? '' }, data: { status: 'draft' } })
    const client = new Client(ctx.app)
    const list = await client.request('GET', '/api/v1/puzzles?limit=50')
    expect(list.json<{ items: unknown[] }>().items).toHaveLength(5)
    expect(
      (await client.request('GET', `/api/v1/puzzles/${ids['la-table'] ?? ''}`)).statusCode,
    ).toBe(404)
  })
})

describe('puzzle public (SOL-01)', () => {
  it('renvoie la structure sans aucune lettre de solution ni explication', async () => {
    const res = await new Client(ctx.app).request('GET', `/api/v1/puzzles/${ids['la-table'] ?? ''}`)
    expect(res.statusCode).toBe(200)
    const body: unknown = res.json()
    expect(containsKey(body, 'solution')).toBe(false)
    expect(containsKey(body, 'grid')).toBe(false)
    expect(containsKey(body, 'explanation')).toBe(false)
    expect(res.body).not.toMatch(/"[A-Z]"|TABLE|BALLE|ELEVE|battage/)
    expect(body).toMatchObject({ width: 5, height: 5, title: 'La table' })
  })

  it('renvoie 404 pour un identifiant inconnu et 400 pour un identifiant mal formé', async () => {
    const client = new Client(ctx.app)
    expect(
      (await client.request('GET', '/api/v1/puzzles/01900000-0000-7000-8000-000000000000'))
        .statusCode,
    ).toBe(404)
    expect((await client.request('GET', "/api/v1/puzzles/1' OR '1'='1")).statusCode).toBe(400)
  })
})

describe('défi du jour', () => {
  it('attribue le même puzzle à tous pour une date UTC donnée, puis le fige', async () => {
    const a = await new Client(ctx.app).request('GET', '/api/v1/daily')
    const b = await new Client(ctx.app).request('GET', '/api/v1/daily')
    expect(a.statusCode).toBe(200)
    expect(a.json()).toEqual(b.json())
    expect(a.json<{ date: string }>().date).toBe('2026-10-17')
    expect(await ctx.db.dailyChallenge.count()).toBe(1)

    // Ajouter un puzzle ne change pas le défi déjà attribué.
    await ctx.db.puzzle.create({
      data: {
        slug: 'aaa',
        title: 'A',
        theme: 't',
        difficulty: 'easy',
        status: 'published',
        width: 5,
        height: 5,
        grid: [],
        clues: [],
        estimatedMinutes: 1,
      },
    })
    const c = await new Client(ctx.app).request('GET', '/api/v1/daily')
    expect(c.json()).toEqual(a.json())
  })

  it('bascule à minuit UTC', async () => {
    ctx.clock = new Date('2026-10-17T23:59:59Z')
    const before = (await new Client(ctx.app).request('GET', '/api/v1/daily')).json<{
      date: string
    }>()
    ctx.clock = new Date('2026-10-18T00:00:00Z')
    const after = (await new Client(ctx.app).request('GET', '/api/v1/daily')).json<{
      date: string
    }>()
    expect(before.date).toBe('2026-10-17')
    expect(after.date).toBe('2026-10-18')
    ctx.clock = new Date('2026-10-17T10:00:00Z')
  })

  it('résiste aux appels concurrents (un seul enregistrement)', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => new Client(ctx.app).request('GET', '/api/v1/daily')),
    )
    expect(new Set(results.map((r) => r.body)).size).toBe(1)
    expect(await ctx.db.dailyChallenge.count()).toBe(1)
  })
})
