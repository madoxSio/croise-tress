import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  Client,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  solvedGrid,
  type TestContext,
} from './helpers.ts'

interface SessionBody {
  id: string
  status: string
  revision: number
  grid: (string | null)[][]
  hints: { lettersRevealed: number; wordsRevealed: number }
}
interface Wallet {
  eligible: boolean
  balance: number
  earned: number
  spent: number
  rules: { freeHintsPerGame: number; hintCost: { letter: number; word: number } }
}
interface Ledger {
  items: { id: string; amount: number; balanceAfter: number; reason: string }[]
  nextCursor: string | null
}
interface PathBody {
  slug: string
  stepCount: number
  completedCount: number
  steps: { position: number; state: string; puzzle: { id: string } }[]
}

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

const id = (slug: string): string => ids[slug] ?? ''

async function start(client: Client, slug = 'la-table'): Promise<SessionBody> {
  const res = await client.request('POST', '/api/v1/play-sessions', { puzzleId: id(slug) })
  expect([200, 201]).toContain(res.statusCode)
  return res.json<SessionBody>()
}

function letterHint(client: Client, session: SessionBody, usePoints = false) {
  return client.request('POST', `/api/v1/play-sessions/${session.id}/hints`, {
    type: 'letter',
    cell: { row: 0, col: 0 },
    ...(usePoints ? { usePoints: true } : {}),
  })
}

async function solve(client: Client, slug: string): Promise<SessionBody> {
  const session = await start(client, slug)
  const res = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
    grid: solvedGrid(slug),
    revision: session.revision,
  })
  expect(res.statusCode).toBe(200)
  return res.json<SessionBody>()
}

async function wallet(client: Client): Promise<Wallet> {
  const res = await client.request('GET', '/api/v1/me/wallet')
  expect(res.statusCode).toBe(200)
  return res.json<Wallet>()
}

async function ledger(client: Client): Promise<Ledger> {
  return (await client.request('GET', '/api/v1/me/wallet/transactions?limit=50')).json<Ledger>()
}

async function createPath(slugs: string[], status: 'published' | 'draft' = 'published') {
  return ctx.db.path.create({
    data: {
      slug: 'culture-rois',
      title: 'Rois et empires',
      description: 'Parcours de test',
      theme: 'rois-de-france',
      status,
      steps: {
        create: slugs.map((slug, index) => ({
          position: index + 1,
          title: `Étape ${String(index + 1)}`,
          puzzleId: id(slug),
        })),
      },
    },
  })
}

describe('portefeuille', () => {
  it('un invité n’a pas de portefeuille', async () => {
    const guest = await new Client(ctx.app).guest()
    expect(await wallet(guest)).toMatchObject({ eligible: false, balance: 0 })
    expect((await ledger(guest)).items).toEqual([])
  })

  it('un compte confirmé reçoit le bonus de bienvenue une seule fois', async () => {
    const player = await new Client(ctx.app).account(ctx.db)
    const first = await wallet(player)
    expect(first).toMatchObject({ eligible: true, balance: 20, earned: 20, spent: 0 })
    expect(first.rules).toEqual({ freeHintsPerGame: 3, hintCost: { letter: 5, word: 15 } })
    await Promise.all([wallet(player), wallet(player), wallet(player)])
    expect((await wallet(player)).balance).toBe(20)
    expect((await ledger(player)).items).toMatchObject([{ amount: 20, reason: 'welcome' }])
  })

  it('le journal est privé et paginé', async () => {
    const alice = await new Client(ctx.app).account(ctx.db)
    const bob = await new Client(ctx.app).account(ctx.db)
    await wallet(alice)
    await solve(alice, 'la-table')
    expect((await ledger(bob)).items).toEqual([])
    const page = (
      await alice.request('GET', '/api/v1/me/wallet/transactions?limit=1')
    ).json<Ledger>()
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).not.toBeNull()
    const rest = (
      await alice.request(
        'GET',
        `/api/v1/me/wallet/transactions?limit=50&cursor=${page.nextCursor ?? ''}`,
      )
    ).json<Ledger>()
    expect(rest.items.length).toBeGreaterThan(0)
    expect(rest.items.map((t) => t.id)).not.toContain(page.items[0]?.id)
    expect(
      (await alice.request('GET', '/api/v1/me/wallet/transactions?limit=500')).statusCode,
    ).toBe(400)
  })
})

describe('indices gratuits et payants', () => {
  it('un invité a trois indices gratuits, puis doit créer un compte', async () => {
    const guest = await new Client(ctx.app).guest()
    const session = await start(guest)
    for (let i = 0; i < 3; i++) expect((await letterHint(guest, session)).statusCode).toBe(200)
    const refused = await letterHint(guest, session, true)
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toMatchObject({ error: { code: 'hint_limit_reached' } })
  })

  it('au-delà de trois, l’indice exige un consentement puis débite le solde', async () => {
    const player = await new Client(ctx.app).account(ctx.db)
    await wallet(player)
    const session = await start(player)
    for (let i = 0; i < 2; i++) await letterHint(player, session)
    const word = await player.request('POST', `/api/v1/play-sessions/${session.id}/hints`, {
      type: 'word',
      word: { direction: 'across', number: 1 },
    })
    expect(word.statusCode).toBe(200)
    expect((await wallet(player)).balance).toBe(20)

    const refused = await letterHint(player, session)
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ error: { code: 'hint_limit_reached' } })

    const paid = await letterHint(player, session, true)
    expect(paid.statusCode).toBe(200)
    expect(paid.json<{ session: SessionBody }>().session.hints.lettersRevealed).toBe(3)
    expect(await wallet(player)).toMatchObject({ balance: 15, spent: 5 })
    expect((await ledger(player)).items[0]).toMatchObject({
      amount: -5,
      balanceAfter: 15,
      reason: 'hint_purchase',
    })
  })

  it('solde insuffisant : rien n’est révélé ni débité', async () => {
    const player = await new Client(ctx.app).account(ctx.db)
    await wallet(player)
    const session = await start(player)
    for (let i = 0; i < 3; i++) await letterHint(player, session)
    // 20 points : un mot (15) passe, le suivant (15) non.
    const wordHint = () =>
      player.request('POST', `/api/v1/play-sessions/${session.id}/hints`, {
        type: 'word',
        word: { direction: 'down', number: 1 },
        usePoints: true,
      })
    expect((await wordHint()).statusCode).toBe(200)
    const before = await ctx.db.playSession.findUniqueOrThrow({ where: { id: session.id } })
    const refused = await wordHint()
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ error: { code: 'insufficient_points' } })
    const after = await ctx.db.playSession.findUniqueOrThrow({ where: { id: session.id } })
    expect(after.revision).toBe(before.revision)
    expect(after.wordsRevealed).toBe(before.wordsRevealed)
    expect(await wallet(player)).toMatchObject({ balance: 5, spent: 15 })
  })

  it('des achats simultanés ne débitent jamais plus que ce qui est révélé', async () => {
    const player = await new Client(ctx.app).account(ctx.db)
    await wallet(player)
    const session = await start(player)
    for (let i = 0; i < 3; i++) await letterHint(player, session)
    const results = await Promise.all(
      Array.from({ length: 6 }, () => letterHint(player, session, true)),
    )
    const ok = results.filter((r) => r.statusCode === 200).length
    const stored = await ctx.db.playSession.findUniqueOrThrow({ where: { id: session.id } })
    const current = await wallet(player)
    expect(current.spent).toBe((stored.lettersRevealed - 3) * 5)
    expect(current.spent).toBe(ok * 5)
    const entries = (await ledger(player)).items
    expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(current.balance)
  })
})

describe('récompenses', () => {
  it('première réussite sans indice : grille + bonus, une seule fois', async () => {
    const player = await new Client(ctx.app).account(ctx.db)
    const solved = await solve(player, 'motif-floral')
    expect(solved.status).toBe('completed')
    // Bienvenue 20 + grille facile 10 + bonus sans indice 5.
    expect((await wallet(player)).balance).toBe(35)
    await solve(player, 'motif-floral')
    expect((await wallet(player)).balance).toBe(35)
  })

  it('pas de bonus avec un indice, rien si la solution est révélée', async () => {
    const player = await new Client(ctx.app).account(ctx.db)
    const helped = await start(player, 'la-table')
    await letterHint(player, helped)
    const current = await ctx.db.playSession.findUniqueOrThrow({ where: { id: helped.id } })
    await player.request('PUT', `/api/v1/play-sessions/${helped.id}/grid`, {
      grid: solvedGrid('la-table'),
      revision: current.revision,
    })
    expect((await wallet(player)).balance).toBe(20 + 5)

    const revealed = await start(player, 'le-salon')
    await player.request('POST', `/api/v1/play-sessions/${revealed.id}/hints`, {
      type: 'solution',
      confirm: true,
    })
    expect((await wallet(player)).balance).toBe(25)
  })

  it('un invité ne gagne rien', async () => {
    const guest = await new Client(ctx.app).guest()
    await solve(guest, 'la-table')
    expect(await ctx.db.pointTransaction.count()).toBe(0)
  })

  it('défi du jour terminé le jour même : +10', async () => {
    await ctx.db.dailyChallenge.create({
      data: { date: new Date('2026-10-17T00:00:00Z'), puzzleId: id('la-table') },
    })
    const player = await new Client(ctx.app).account(ctx.db)
    await solve(player, 'la-table')
    expect((await ledger(player)).items.map((e) => e.reason)).toContain('daily_challenge')
    expect((await wallet(player)).balance).toBe(20 + 5 + 5 + 10)
  })
})

describe('parcours', () => {
  it('un invité voit la première étape ouverte et ne peut pas démarrer la suivante', async () => {
    await createPath(['la-table', 'le-salon', 'motif-floral'])
    const guest = await new Client(ctx.app).guest()
    const detail = (await guest.request('GET', '/api/v1/paths/culture-rois')).json<PathBody>()
    expect(detail.steps.map((s) => s.state)).toEqual(['available', 'locked', 'locked'])
    await solve(guest, 'la-table')
    const after = (await guest.request('GET', '/api/v1/paths/culture-rois')).json<PathBody>()
    expect(after.steps.map((s) => s.state)).toEqual(['completed', 'locked', 'locked'])
    const refused = await guest.request('POST', '/api/v1/play-sessions', {
      puzzleId: id('le-salon'),
    })
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toMatchObject({ error: { code: 'step_locked' } })
  })

  it('les étapes se débloquent une à une et rapportent des points', async () => {
    await createPath(['la-table', 'le-salon'])
    const player = await new Client(ctx.app).account(ctx.db)
    const locked = await player.request('POST', '/api/v1/play-sessions', {
      puzzleId: id('le-salon'),
    })
    expect(locked.statusCode).toBe(403)

    await solve(player, 'la-table')
    let detail = (await player.request('GET', '/api/v1/paths/culture-rois')).json<PathBody>()
    expect(detail.steps.map((s) => s.state)).toEqual(['completed', 'available'])

    await solve(player, 'le-salon')
    detail = (await player.request('GET', '/api/v1/paths/culture-rois')).json<PathBody>()
    expect(detail).toMatchObject({ stepCount: 2, completedCount: 2 })
    const reasons = (await ledger(player)).items.map((e) => e.reason)
    expect(reasons.filter((r) => r === 'path_step')).toHaveLength(2)
    expect(reasons.filter((r) => r === 'path_completed')).toHaveLength(1)
    // 20 + 2 × (5 + 5 + 10) + 50
    expect((await wallet(player)).balance).toBe(110)

    const list = (await player.request('GET', '/api/v1/paths')).json<{ items: PathBody[] }>()
    expect(list.items).toMatchObject([{ slug: 'culture-rois', stepCount: 2, completedCount: 2 }])
  })

  it('révéler la solution ne valide pas l’étape', async () => {
    await createPath(['la-table', 'le-salon'])
    const player = await new Client(ctx.app).account(ctx.db)
    const session = await start(player, 'la-table')
    await player.request('POST', `/api/v1/play-sessions/${session.id}/hints`, {
      type: 'solution',
      confirm: true,
    })
    const detail = (await player.request('GET', '/api/v1/paths/culture-rois')).json<PathBody>()
    expect(detail.steps.map((s) => s.state)).toEqual(['available', 'locked'])
  })

  it('un parcours en brouillon est invisible et ne verrouille rien', async () => {
    await createPath(['la-table', 'le-salon'], 'draft')
    const guest = await new Client(ctx.app).guest()
    expect((await guest.request('GET', '/api/v1/paths/culture-rois')).statusCode).toBe(404)
    expect((await guest.request('GET', '/api/v1/paths')).json()).toEqual({ items: [] })
    expect(
      (await guest.request('POST', '/api/v1/play-sessions', { puzzleId: id('le-salon') }))
        .statusCode,
    ).toBe(201)
  })

  it('refuse un slug mal formé', async () => {
    const res = await new Client(ctx.app).request('GET', '/api/v1/paths/..%2Fadmin')
    expect(res.statusCode).toBe(400)
  })
})
