import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  Client,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  solvedGrid,
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
  ctx.clock = new Date('2026-10-17T10:00:00Z')
  await resetDatabase(ctx.db)
  ids = await seedPuzzles(ctx.db)
})

async function solve(client: Client, slug: string, minutes = 1): Promise<void> {
  const start = await client.request('POST', '/api/v1/play-sessions', { puzzleId: ids[slug] })
  const session = start.json<{ id: string; revision: number }>()
  ctx.clock = new Date(ctx.clock.getTime() + minutes * 60_000)
  const res = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
    grid: solvedGrid(slug),
    revision: session.revision,
  })
  expect(res.json<{ status: string }>().status).toBe('completed')
}

function unlocked(body: { items: { code: string; unlockedAt: string | null }[] }): string[] {
  return body.items.filter((a) => a.unlockedAt !== null).map((a) => a.code)
}

describe('succès', () => {
  it('attribue les succès à la fin d’une grille, une seule fois', async () => {
    const client = await new Client(ctx.app).guest()
    const daily = (await client.request('GET', '/api/v1/daily')).json<{
      puzzle: { slug: string }
    }>()
    await solve(client, daily.puzzle.slug)
    const first = (await client.request('GET', '/api/v1/me/achievements')).json<{
      items: { code: string; unlockedAt: string | null }[]
    }>()
    expect(unlocked(first).sort()).toEqual(['daily', 'first_grid', 'no_help', 'speedster'])

    const other = ['la-table', 'le-salon', 'motif-floral', 'a-la-plage', 'en-route'].filter(
      (s) => s !== daily.puzzle.slug,
    )
    for (const slug of other.slice(0, 4)) await solve(client, slug, 30)
    const after = (await client.request('GET', '/api/v1/me/achievements')).json<{
      items: { code: string; unlockedAt: string | null }[]
    }>()
    expect(unlocked(after)).toContain('five_grids')
    expect(await ctx.db.userAchievement.count()).toBe(5)
  })

  it('aucun succès quand la solution complète a été révélée', async () => {
    const client = await new Client(ctx.app).guest()
    const start = (
      await client.request('POST', '/api/v1/play-sessions', { puzzleId: ids['la-table'] })
    ).json<{ id: string }>()
    await client.request('POST', `/api/v1/play-sessions/${start.id}/hints`, {
      type: 'solution',
      confirm: true,
    })
    expect(await ctx.db.userAchievement.count()).toBe(0)
  })
})

describe('statistiques', () => {
  it('sont dérivées des parties terminées du joueur uniquement', async () => {
    const alice = await new Client(ctx.app).guest()
    const bob = await new Client(ctx.app).guest()
    await solve(alice, 'la-table', 2)
    await solve(alice, 'motif-floral', 4)
    await solve(bob, 'le-salon')
    const stats = (await alice.request('GET', '/api/v1/me/stats')).json<Record<string, unknown>>()
    expect(stats).toMatchObject({
      completed: 2,
      withoutHelp: 2,
      averageDurationMs: 180_000,
      byDifficulty: { discovery: 1, easy: 1 },
    })
  })
})

describe('favoris et préférences', () => {
  it('ajoute, liste et retire un favori de façon idempotente', async () => {
    const client = await new Client(ctx.app).guest()
    const url = `/api/v1/me/favorites/${ids['la-table'] ?? ''}`
    expect((await client.request('PUT', url)).statusCode).toBe(204)
    expect((await client.request('PUT', url)).statusCode).toBe(204)
    expect(
      (await client.request('GET', '/api/v1/me/favorites'))
        .json<{ items: { slug: string }[] }>()
        .items.map((p) => p.slug),
    ).toEqual(['la-table'])
    expect((await client.request('DELETE', url)).statusCode).toBe(204)
    expect(
      (await client.request('GET', '/api/v1/me/favorites')).json<{ items: unknown[] }>().items,
    ).toHaveLength(0)
    expect(
      (await client.request('PUT', '/api/v1/me/favorites/01900000-0000-7000-8000-000000000000'))
        .statusCode,
    ).toBe(404)
  })

  it('enregistre des préférences valides et refuse les autres', async () => {
    const client = await new Client(ctx.app).guest()
    expect((await client.request('GET', '/api/v1/me/preferences')).json()).toEqual({
      theme: 'minimal',
      textScale: 1,
      reducedMotion: false,
    })
    const saved = await client.request('PUT', '/api/v1/me/preferences', {
      theme: 'dark',
      textScale: 1.2,
      reducedMotion: true,
    })
    expect(saved.json()).toEqual({ theme: 'dark', textScale: 1.2, reducedMotion: true })
    expect(
      (await client.request('PUT', '/api/v1/me/preferences', { theme: 'pirate' })).statusCode,
    ).toBe(400)
    expect(
      (await client.request('PUT', '/api/v1/me/preferences', { textScale: 10 })).statusCode,
    ).toBe(400)
  })
})
