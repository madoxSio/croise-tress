import { SEED_PUZZLES } from '../prisma/seed/puzzles.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AccountError, createAccount, setRole } from '../src/modules/admin/accounts.ts'
import {
  Client,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  solvedGrid,
  type TestContext,
} from './helpers.ts'

let ctx: TestContext
let puzzleIds: Record<string, string>
beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await ctx.app.close()
  await ctx.db.$disconnect()
})
beforeEach(async () => {
  await resetDatabase(ctx.db)
  puzzleIds = await seedPuzzles(ctx.db)
})

const PASSWORD = 'correct horse battery staple'

async function login(email: string): Promise<Client> {
  const client = await new Client(ctx.app).guest()
  const res = await client.request('POST', '/api/v1/auth/login', { email, password: PASSWORD })
  expect(res.statusCode).toBe(200)
  return client
}

async function adminClient(): Promise<Client> {
  await createAccount(ctx.db, {
    email: 'admin@example.com',
    username: 'madmin',
    password: PASSWORD,
    admin: true,
  })
  return login('admin@example.com')
}

async function playerClient(email = 'bob@example.com', username = 'bob'): Promise<Client> {
  await createAccount(ctx.db, { email, username, password: PASSWORD, admin: false })
  return login(email)
}

const newPuzzle = {
  slug: 'le-port',
  title: 'Le port',
  theme: 'mer',
  difficulty: 'easy',
  estimatedMinutes: 4,
  grid: ['TABLE', 'A#A#L', 'BALLE', 'L#L#V', 'ELEVE'],
  clues: SEED_PUZZLES[0]?.clues.map((clue) => ({ ...clue })) ?? [],
}

describe('garde de rôle (AUTHZ-03)', () => {
  const routes = [
    ['GET', '/api/v1/admin/me'],
    ['GET', '/api/v1/admin/overview'],
    ['GET', '/api/v1/admin/users'],
    ['GET', '/api/v1/admin/puzzles'],
    ['GET', '/api/v1/admin/audit'],
    ['POST', '/api/v1/admin/puzzles'],
  ] as const

  it('répond 404 à un invité, à un joueur et sans session', async () => {
    const guest = await new Client(ctx.app).guest()
    const player = await playerClient()
    const anonymous = new Client(ctx.app)
    for (const client of [guest, player, anonymous]) {
      for (const [method, url] of routes) {
        const res = await client.request(method, url, method === 'POST' ? newPuzzle : undefined)
        // Sans session, une requête mutante est d'abord refusée par le contrôle CSRF.
        expect([403, 404]).toContain(res.statusCode)
        if (client !== anonymous || method === 'GET') expect(res.statusCode).toBe(404)
      }
    }
    expect(await ctx.db.puzzle.count({ where: { slug: 'le-port' } })).toBe(0)
  })

  it('suit le rôle en base : un rôle retiré coupe l’accès et ferme les sessions', async () => {
    const admin = await adminClient()
    expect((await admin.request('GET', '/api/v1/admin/me')).json()).toEqual({ isAdmin: true })
    await setRole(ctx.db, 'admin@example.com', false)
    expect((await admin.request('GET', '/api/v1/admin/me')).statusCode).toBe(404)
    expect((await admin.request('GET', '/api/v1/session')).json()).toMatchObject({ user: null })
  })

  it('ne laisse pas un joueur se donner le rôle par l’API publique', async () => {
    const player = await playerClient()
    const res = await player.request('PUT', '/api/v1/me/preferences', { role: 'admin' })
    expect(res.statusCode).toBe(400)
    expect((await ctx.db.user.findFirstOrThrow({ where: { username: 'bob' } })).role).toBe('player')
  })
})

describe('indicateurs et parcours', () => {
  it('compte les joueurs et les parties, sans les invités dans la liste par défaut', async () => {
    const admin = await adminClient()
    const player = await playerClient()
    await new Client(ctx.app).guest()
    const started = await player.request('POST', '/api/v1/play-sessions', {
      puzzleId: puzzleIds['la-table'],
    })
    const sessionId = started.json<{ id: string }>().id
    const saved = await player.request('PUT', `/api/v1/play-sessions/${sessionId}/grid`, {
      grid: solvedGrid('la-table'),
      revision: 0,
    })
    expect(saved.json()).toMatchObject({ status: 'completed' })

    const overview = (await admin.request('GET', '/api/v1/admin/overview')).json<{
      users: Record<string, number>
      plays: Record<string, number>
      puzzles: Record<string, number>
      daily: { date: string; completions: number; registrations: number }[]
    }>()
    expect(overview.users).toMatchObject({ registered: 2, verified: 2, admins: 1 })
    expect(overview.users['guests']).toBeGreaterThanOrEqual(1)
    expect(overview.plays).toMatchObject({ started: 1, completed: 1 })
    expect(overview.puzzles).toMatchObject({ published: SEED_PUZZLES.length, draft: 0 })
    expect(overview.daily).toHaveLength(30)

    const list = (await admin.request('GET', '/api/v1/admin/users?search=BO')).json<{
      items: { id: string; username: string; isGuest: boolean; playsCompleted: number }[]
    }>()
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({ username: 'bob', isGuest: false, playsCompleted: 1 })

    const detail = await admin.request('GET', `/api/v1/admin/users/${list.items[0]?.id ?? ''}`)
    expect(detail.statusCode).toBe(200)
    const body = detail.json<{ journey: { type: string }[]; stats: { playsCompleted: number } }>()
    expect(body.stats.playsCompleted).toBe(1)
    expect(body.journey.map((event) => event.type)).toEqual(
      expect.arrayContaining(['account_created', 'play_started', 'play_completed', 'achievement']),
    )
    // Les secrets du compte ne sortent jamais, même vers un administrateur.
    expect(detail.body).not.toMatch(/argon2|passwordHash|tokenHash/)

    const audit = (await admin.request('GET', '/api/v1/admin/audit')).json<{
      items: { action: string; actor: string | null; target: string | null }[]
    }>()
    expect(audit.items[0]).toMatchObject({ action: 'user.view', actor: 'madmin' })
  })

  it('valide la pagination et les filtres', async () => {
    const admin = await adminClient()
    expect((await admin.request('GET', '/api/v1/admin/users?limit=500')).statusCode).toBe(400)
    expect((await admin.request('GET', '/api/v1/admin/users?role=admin')).statusCode).toBe(400)
    expect((await admin.request('GET', '/api/v1/admin/users/not-a-uuid')).statusCode).toBe(400)
  })
})

describe('gestion des grilles', () => {
  it('crée en brouillon, publie, puis la grille apparaît au catalogue', async () => {
    const admin = await adminClient()
    const created = await admin.request('POST', '/api/v1/admin/puzzles', newPuzzle)
    expect(created.statusCode).toBe(201)
    const puzzle = created.json<{ id: string; status: string; locked: boolean; grid: string[] }>()
    expect(puzzle).toMatchObject({ status: 'draft', locked: false, grid: newPuzzle.grid })
    expect((await admin.request('GET', `/api/v1/puzzles/${puzzle.id}`)).statusCode).toBe(404)

    const published = await admin.request('PUT', `/api/v1/admin/puzzles/${puzzle.id}/status`, {
      status: 'published',
    })
    expect(published.json()).toMatchObject({ status: 'published' })
    const pub = await admin.request('GET', `/api/v1/puzzles/${puzzle.id}`)
    expect(pub.statusCode).toBe(200)
    // La route publique ne divulgue toujours pas la solution.
    expect(pub.body).not.toContain('TABLE')

    const audit = await ctx.db.auditLog.findMany({ orderBy: { id: 'asc' } })
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['puzzle.create', 'puzzle.publish']),
    )
  })

  it('refuse une grille incohérente, un slug pris et les propriétés inconnues', async () => {
    const admin = await adminClient()
    const broken = await admin.request('POST', '/api/v1/admin/puzzles', {
      ...newPuzzle,
      clues: newPuzzle.clues.slice(1),
    })
    expect(broken.statusCode).toBe(400)
    expect(broken.json<{ error: { message: string } }>().error.message).toMatch(/Grille invalide/)

    const taken = await admin.request('POST', '/api/v1/admin/puzzles', {
      ...newPuzzle,
      slug: 'la-table',
    })
    expect(taken.statusCode).toBe(409)

    const extra = await admin.request('POST', '/api/v1/admin/puzzles', {
      ...newPuzzle,
      status: 'published',
    })
    expect(extra.statusCode).toBe(400)
  })

  it('fige les lettres d’une grille déjà jouée mais laisse corriger les définitions', async () => {
    const admin = await adminClient()
    const player = await playerClient()
    const id = puzzleIds['la-table'] ?? ''
    await player.request('POST', '/api/v1/play-sessions', { puzzleId: id })
    const current = (await admin.request('GET', `/api/v1/admin/puzzles/${id}`)).json<{
      slug: string
      title: string
      theme: string
      difficulty: string
      estimatedMinutes: number
      grid: string[]
      clues: { text: string }[]
      locked: boolean
    }>()
    expect(current.locked).toBe(true)
    const body = {
      slug: current.slug,
      title: current.title,
      theme: current.theme,
      difficulty: current.difficulty,
      estimatedMinutes: current.estimatedMinutes,
      grid: current.grid,
      clues: current.clues,
    }
    const changedGrid = await admin.request('PUT', `/api/v1/admin/puzzles/${id}`, {
      ...body,
      grid: ['SALON', 'A#A#A', 'LAPIN', 'O#I#T', 'NANTI'],
    })
    expect(changedGrid.statusCode).toBe(409)

    const clues = current.clues.map((clue, index) =>
      index === 0 ? { ...clue, text: 'Meuble de salle à manger' } : clue,
    )
    const fixed = await admin.request('PUT', `/api/v1/admin/puzzles/${id}`, { ...body, clues })
    expect(fixed.statusCode).toBe(200)
    expect(fixed.json<{ clues: { text: string }[] }>().clues[0]?.text).toBe(
      'Meuble de salle à manger',
    )
  })
})

describe('comptes en ligne de commande', () => {
  it('crée un compte confirmé utilisable, haché en Argon2id', async () => {
    const account = await createAccount(ctx.db, {
      email: 'test@example.com',
      username: 'testeur',
      password: PASSWORD,
      admin: false,
    })
    expect(account.role).toBe('player')
    const row = await ctx.db.user.findUniqueOrThrow({ where: { id: account.id } })
    expect(row.passwordHash).toMatch(/^\$argon2id\$/)
    expect(row.emailVerifiedAt).not.toBeNull()
    const client = await login('test@example.com')
    expect((await client.request('GET', '/api/v1/session')).json()).toMatchObject({
      user: { username: 'testeur', emailVerified: true, isGuest: false },
    })
  })

  it('refuse un mot de passe faible, un doublon et la promotion d’un compte inconnu', async () => {
    await expect(
      createAccount(ctx.db, {
        email: 'a@example.com',
        username: 'aaa',
        password: 'admin1234567',
        admin: true,
      }),
    ).rejects.toThrow(AccountError)
    await createAccount(ctx.db, {
      email: 'a@example.com',
      username: 'aaa',
      password: PASSWORD,
      admin: false,
    })
    await expect(
      createAccount(ctx.db, {
        email: 'A@example.com',
        username: 'other',
        password: PASSWORD,
        admin: false,
      }),
    ).rejects.toThrow(/déjà utilisé/)
    await expect(setRole(ctx.db, 'nobody@example.com', true)).rejects.toThrow(AccountError)
  })
})
