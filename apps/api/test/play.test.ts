import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  Client,
  createTestContext,
  emptyGrid,
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
  score: number | null
  durationMs: number | null
  hints: {
    cellChecks: number
    wordChecks: number
    lettersRevealed: number
    wordsRevealed: number
    solutionRevealed: boolean
  }
}

let ctx: TestContext
let ids: Record<string, string>
let tableId: string
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
  tableId = ids['la-table'] ?? ''
})

async function start(client: Client, puzzleId = tableId): Promise<SessionBody> {
  const res = await client.request('POST', '/api/v1/play-sessions', { puzzleId })
  expect([200, 201]).toContain(res.statusCode)
  return res.json<SessionBody>()
}

describe('démarrage et reprise', () => {
  it('exige une session', async () => {
    const res = await new Client(ctx.app).request('POST', '/api/v1/play-sessions', {
      puzzleId: tableId,
    })
    expect(res.statusCode).toBe(401)
  })

  it('crée une partie vide puis la reprend au lieu d’en créer une seconde', async () => {
    const client = await new Client(ctx.app).guest()
    const created = await client.request('POST', '/api/v1/play-sessions', { puzzleId: tableId })
    expect(created.statusCode).toBe(201)
    expect(created.json<SessionBody>().grid).toEqual(emptyGrid())
    const resumed = await client.request('POST', '/api/v1/play-sessions', { puzzleId: tableId })
    expect(resumed.statusCode).toBe(200)
    expect(resumed.json<SessionBody>().id).toBe(created.json<SessionBody>().id)
  })

  it('n’ouvre qu’une partie en cours même en cas de démarrages concurrents', async () => {
    const client = await new Client(ctx.app).guest()
    const results = await Promise.all(Array.from({ length: 8 }, () => start(client)))
    expect(new Set(results.map((s) => s.id)).size).toBe(1)
    expect(await ctx.db.playSession.count()).toBe(1)
  })

  it('/me/resume renvoie la dernière partie en cours', async () => {
    const client = await new Client(ctx.app).guest()
    expect((await client.request('GET', '/api/v1/me/resume')).json()).toEqual({
      session: null,
      puzzle: null,
    })
    const session = await start(client)
    const res = await client.request('GET', '/api/v1/me/resume')
    expect(res.json()).toMatchObject({ session: { id: session.id }, puzzle: { title: 'La table' } })
  })
})

describe('sauvegarde', () => {
  it('enregistre la grille normalisée et incrémente la révision', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const grid = emptyGrid()
    grid[0] = ['t', 'É', null, null, null]
    const res = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid,
      revision: 0,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<SessionBody>()).toMatchObject({
      revision: 1,
      grid: [['T', 'E', null, null, null], ...emptyGrid().slice(1)],
    })

    const reloaded = await client.request('GET', `/api/v1/play-sessions/${session.id}`)
    expect(reloaded.json<SessionBody>().grid[0]).toEqual(['T', 'E', null, null, null])
  })

  it('refuse une révision périmée (409)', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: emptyGrid(),
      revision: 0,
    })
    const stale = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: emptyGrid(),
      revision: 0,
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('conflict')
  })

  it.each([
    [
      'lettre sur case noire',
      (() => {
        const g = emptyGrid()
        g[1] = [null, 'A', null, null, null]
        return g
      })(),
    ],
    ['dimensions fausses', [[null]]],
    [
      'chiffre',
      (() => {
        const g = emptyGrid()
        g[0] = ['1', null, null, null, null]
        return g
      })(),
    ],
  ])('refuse une grille invalide : %s', async (_label, grid) => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const res = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid,
      revision: 0,
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuse les champs non prévus (affectation massive, AUTHZ-04)', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const res = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: emptyGrid(),
      revision: 0,
      score: 99999,
      status: 'completed',
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('contrôle d’accès entre joueurs (AUTHZ-01)', () => {
  it('un joueur ne peut ni lire, ni modifier, ni vérifier, ni obtenir d’indice sur la partie d’un autre', async () => {
    const alice = await new Client(ctx.app).guest()
    const bob = await new Client(ctx.app).guest()
    const session = await start(alice)
    const base = `/api/v1/play-sessions/${session.id}`

    const attempts = [
      await bob.request('GET', base),
      await bob.request('PUT', `${base}/grid`, { grid: solvedGrid('la-table'), revision: 0 }),
      await bob.request('POST', `${base}/check`, { scope: 'grid', grid: emptyGrid(), revision: 0 }),
      await bob.request('POST', `${base}/hints`, { type: 'solution', confirm: true }),
    ]
    for (const res of attempts) {
      expect(res.statusCode).toBe(404)
      expect(res.body).not.toContain('TABLE')
    }
    const untouched = await ctx.db.playSession.findUniqueOrThrow({ where: { id: session.id } })
    expect(untouched.revision).toBe(0)
    expect(untouched.status).toBe('in_progress')
  })

  it('l’historique ne contient que les parties du joueur', async () => {
    const alice = await new Client(ctx.app).guest()
    const bob = await new Client(ctx.app).guest()
    const session = await start(alice)
    await alice.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: solvedGrid('la-table'),
      revision: 0,
    })
    expect(
      (await alice.request('GET', '/api/v1/me/history')).json<{ items: unknown[] }>().items,
    ).toHaveLength(1)
    expect(
      (await bob.request('GET', '/api/v1/me/history')).json<{ items: unknown[] }>().items,
    ).toHaveLength(0)
  })
})

describe('vérifications', () => {
  it('vérifie une case, un mot et la grille, et compte chaque vérification', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const grid = emptyGrid()
    grid[0] = ['T', 'O', 'B', null, null]

    const cell = await client.request('POST', `/api/v1/play-sessions/${session.id}/check`, {
      scope: 'cell',
      grid,
      revision: 0,
      cell: { row: 0, col: 1 },
    })
    expect(cell.json<{ cells: unknown[] }>().cells).toEqual([
      { row: 0, col: 1, result: 'incorrect' },
    ])

    const word = await client.request('POST', `/api/v1/play-sessions/${session.id}/check`, {
      scope: 'word',
      grid,
      revision: 1,
      word: { direction: 'across', number: 1 },
    })
    const wordBody = word.json<{ cells: { result: string }[]; session: SessionBody }>()
    expect(wordBody.cells.map((c) => c.result)).toEqual([
      'correct',
      'incorrect',
      'correct',
      'empty',
      'empty',
    ])
    expect(wordBody.session.hints).toMatchObject({ cellChecks: 1, wordChecks: 1 })
    expect(wordBody.session.revision).toBe(2)
  })

  it('refuse une case noire ou un mot inexistant', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const url = `/api/v1/play-sessions/${session.id}/check`
    expect(
      (
        await client.request('POST', url, {
          scope: 'cell',
          grid: emptyGrid(),
          revision: 0,
          cell: { row: 1, col: 1 },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await client.request('POST', url, {
          scope: 'word',
          grid: emptyGrid(),
          revision: 0,
          word: { direction: 'down', number: 9 },
        })
      ).statusCode,
    ).toBe(404)
  })
})

describe('limitation des vérifications (SOL-03)', () => {
  it('bloque au-delà de 60 vérifications par minute', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    let revision = 0
    let last = 0
    for (let i = 0; i < 61; i++) {
      const res = await client.request('POST', `/api/v1/play-sessions/${session.id}/check`, {
        scope: 'cell',
        grid: emptyGrid(),
        revision,
        cell: { row: 0, col: 0 },
      })
      last = res.statusCode
      if (res.statusCode === 200) revision += 1
    }
    expect(revision).toBe(60)
    expect(last).toBe(429)
  })
})

describe('indices', () => {
  it('révèle une lettre, un mot et une explication, uniquement la portion demandée', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const url = `/api/v1/play-sessions/${session.id}/hints`

    const letter = await client.request('POST', url, { type: 'letter', cell: { row: 2, col: 2 } })
    expect(letter.json<{ revealed: unknown }>().revealed).toEqual([{ row: 2, col: 2, letter: 'L' }])

    const word = await client.request('POST', url, {
      type: 'word',
      word: { direction: 'down', number: 3 },
    })
    const wordBody = word.json<{ revealed: { letter: string }[]; session: SessionBody }>()
    expect(wordBody.revealed.map((c) => c.letter).join('')).toBe('ELEVE')
    expect(wordBody.session.hints).toMatchObject({ lettersRevealed: 1, wordsRevealed: 1 })
    expect(wordBody.session.grid.map((line) => line[4]).join('')).toBe('ELEVE')
    expect(wordBody.session.grid[0]?.[0]).toBeNull()

    const explain = await client.request('POST', url, {
      type: 'explain',
      word: { direction: 'down', number: 2 },
    })
    expect(explain.json<{ explanation: string }>().explanation).toContain('battage')
  })

  it('exige une confirmation explicite pour la solution complète, qui donne un score nul', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const url = `/api/v1/play-sessions/${session.id}/hints`
    expect((await client.request('POST', url, { type: 'solution' })).statusCode).toBe(400)
    expect(
      (await client.request('POST', url, { type: 'solution', confirm: false })).statusCode,
    ).toBe(400)
    const res = await client.request('POST', url, { type: 'solution', confirm: true })
    expect(res.json<{ session: SessionBody }>().session).toMatchObject({
      status: 'completed',
      score: 0,
    })
  })
})

describe('fin de partie (SOL-04, SOL-05)', () => {
  it('termine la partie quand la grille est juste et calcule durée et score côté serveur', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    ctx.clock = new Date('2026-10-17T10:02:00Z')
    const res = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: solvedGrid('la-table'),
      revision: 0,
    })
    const body = res.json<SessionBody>()
    expect(body.status).toBe('completed')
    expect(body.durationMs).toBe(120_000)
    // 1000 + bonus de rapidité : 500 × (1 − 120 s / (3 × 180 s)) = 389 (arrondi).
    expect(body.score).toBe(1389)

    const locked = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: emptyGrid(),
      revision: 1,
    })
    expect(locked.statusCode).toBe(409)

    const history = (await client.request('GET', '/api/v1/me/history')).json<{
      items: { score: number }[]
    }>()
    expect(history.items[0]?.score).toBe(1389)
  })

  it('ne termine pas une grille incomplète ou fausse', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    const wrong = solvedGrid('la-table')
    wrong[0] = ['T', 'A', 'B', 'L', 'A']
    const res = await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: wrong,
      revision: 0,
    })
    expect(res.json<SessionBody>().status).toBe('in_progress')
  })

  it('après la fin, une nouvelle partie du même puzzle peut commencer', async () => {
    const client = await new Client(ctx.app).guest()
    const session = await start(client)
    await client.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: solvedGrid('la-table'),
      revision: 0,
    })
    const again = await client.request('POST', '/api/v1/play-sessions', { puzzleId: tableId })
    expect(again.statusCode).toBe(201)
  })
})
