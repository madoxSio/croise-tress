import type { ClientToServerEvents, MatchState, ServerToClientEvents } from '@crossverse/contracts'
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { createAccount } from '../src/modules/admin/accounts.ts'
import { MatchService } from '../src/modules/match/service.ts'
import { PuzzleRepository } from '../src/modules/puzzles/repository.ts'
import { generateToken, hashToken } from '../src/modules/session/tokens.ts'
import { SEED_PUZZLES } from '../prisma/seed/puzzles.ts'
import {
  Client,
  ORIGIN,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  testDatabaseUrl,
  type TestContext,
} from './helpers.ts'

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>
type AckResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

const GRACE_MS = 400
let ctx: TestContext
let url: string
const sockets: ClientSocket[] = []

beforeAll(async () => {
  ctx = await createTestContext({ realClock: true, reconnectGraceMs: GRACE_MS })
  await ctx.app.listen({ host: '127.0.0.1', port: 0 })
  url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`
})
afterAll(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect()
  await ctx.app.close()
  await ctx.db.$disconnect()
})
beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect()
  await resetDatabase(ctx.db)
  // Un seul puzzle publié : la grille des matchs est connue du test.
  await seedPuzzles(ctx.db)
  await ctx.db.puzzle.updateMany({
    where: { slug: { not: 'la-table' } },
    data: { status: 'draft' },
  })
})

let counter = 0
async function account(
  options: { verified?: boolean; guest?: boolean } = {},
): Promise<{ id: string; cookie: string }> {
  counter += 1
  const user = await ctx.db.user.create({
    data: options.guest
      ? {}
      : {
          email: `p${counter}@example.com`,
          username: `player${counter}`,
          passwordHash: 'non-utilisé-dans-ce-test',
          emailVerifiedAt: options.verified === false ? null : new Date(),
        },
  })
  const token = generateToken()
  await ctx.db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      csrfSecret: generateToken(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  })
  return { id: user.id, cookie: `cv_session=${token}` }
}

function connect(
  cookie: string | null,
  origin: string | null = ORIGIN,
  options: { polling?: boolean; headers?: Record<string, string> } = {},
): Promise<ClientSocket> {
  const socket: ClientSocket = io(url, {
    path: '/ws',
    transports: options.polling ? ['polling'] : ['websocket'],
    reconnection: false,
    extraHeaders: {
      ...(origin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
  })
  sockets.push(socket)
  return new Promise((resolve, reject) => {
    socket.once('connect', () => {
      resolve(socket)
    })
    socket.once('connect_error', (error) => {
      reject(error)
    })
  })
}

function emit<T>(socket: ClientSocket, event: string, payload: unknown): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    ;(
      socket as unknown as { emit: (e: string, p: unknown, ack: (r: AckResult<T>) => void) => void }
    ).emit(event, payload, resolve)
  })
}

function nextState(
  socket: ClientSocket,
  predicate: (state: MatchState) => boolean,
): Promise<MatchState> {
  return new Promise((resolve) => {
    const listener = (state: MatchState): void => {
      if (predicate(state)) {
        socket.off('match:state', listener)
        resolve(state)
      }
    }
    socket.on('match:state', listener)
  })
}

const id = (): string => `evt-${generateToken().slice(0, 16)}`
const TABLE = SEED_PUZZLES.find((p) => p.slug === 'la-table')
if (!TABLE) throw new Error('la-table')
const ANSWERS: ['across' | 'down', number, string][] = [
  ['across', 1, 'TABLE'],
  ['across', 4, 'BALLE'],
  ['across', 5, 'élève'],
  ['down', 1, 'table'],
  ['down', 2, 'BALLE'],
  ['down', 3, 'ELEVE'],
]

async function privateMatch(): Promise<{
  a: ClientSocket
  b: ClientSocket
  matchId: string
  aId: string
  bId: string
}> {
  const alice = await account()
  const bob = await account()
  const a = await connect(alice.cookie)
  const b = await connect(bob.cookie)
  const created = await emit<MatchState>(a, 'invite:create', { clientEventId: id() })
  if (!created.ok) throw new Error(created.error.message)
  expect(created.data.status).toBe('waiting')
  expect(created.data.puzzle).toBeNull()
  const started = nextState(a, (s) => s.status === 'active')
  const accepted = await emit<MatchState>(b, 'invite:accept', {
    clientEventId: id(),
    code: created.data.inviteCode,
  })
  if (!accepted.ok) throw new Error(accepted.error.message)
  await started
  return { a, b, matchId: created.data.id, aId: alice.id, bId: bob.id }
}

describe('connexion temps réel (WS-01)', () => {
  it('refuse sans session, pour un invité, un compte non confirmé ou une origine étrangère', async () => {
    await expect(connect(null)).rejects.toThrow('unauthenticated')
    await expect(connect((await account({ guest: true })).cookie)).rejects.toThrow(
      'account_required',
    )
    await expect(connect((await account({ verified: false })).cookie)).rejects.toThrow(
      'account_required',
    )
    await expect(connect((await account()).cookie, 'https://evil.example')).rejects.toThrow()
  })

  it('accepte le long polling de même origine sans en-tête Origin, refuse l’inter-sites', async () => {
    const { cookie } = await account()
    const sameOrigin = { 'sec-fetch-site': 'same-origin' }
    await expect(
      connect(cookie, null, { polling: true, headers: sameOrigin }),
    ).resolves.toBeTruthy()
    await expect(
      connect(cookie, null, { polling: true, headers: { 'sec-fetch-site': 'cross-site' } }),
    ).rejects.toThrow()
    await expect(
      connect(cookie, 'https://evil.example', { polling: true, headers: sameOrigin }),
    ).rejects.toThrow()
  })

  it('refuse un message non conforme au schéma (champs forgés)', async () => {
    const socket = await connect((await account()).cookie)
    const res = await emit(socket, 'queue:join', {
      clientEventId: id(),
      mode: 'ranked',
      score: 9999,
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'validation_error' } })
  })
})

describe('limites temps réel (VAL-01, WS-10)', () => {
  it('coupe la connexion sur un message trop volumineux', async () => {
    const socket = await connect((await account()).cookie)
    const closed = new Promise((resolve) => socket.once('disconnect', resolve))
    socket.emit('queue:join', { clientEventId: 'x'.repeat(10_000) }, () => undefined)
    await closed
    expect(socket.connected).toBe(false)
  })

  it('limite le débit des événements', async () => {
    const socket = await connect((await account()).cookie)
    const results = await Promise.all(
      Array.from({ length: 15 }, () => emit(socket, 'queue:leave', {})),
    )
    expect(
      results.filter((r) => !r.ok && r.error.code === 'rate_limited').length,
    ).toBeGreaterThanOrEqual(4)
  })
})

describe('match privé', () => {
  it('donne la même grille aux deux joueurs, sans aucune lettre', async () => {
    const { a, b, matchId } = await privateMatch()
    const stateA = await emit<MatchState>(a, 'match:resync', { clientEventId: id(), matchId })
    const stateB = await emit<MatchState>(b, 'match:resync', { clientEventId: id(), matchId })
    if (!stateA.ok || !stateB.ok) throw new Error('resync')
    expect(stateA.data.puzzle).toEqual(stateB.data.puzzle)
    expect(stateA.data.totalWords).toBe(6)
    expect(JSON.stringify(stateA.data.puzzle)).not.toMatch(/"[A-Z]"|TABLE|BALLE|ELEVE/)
    expect(stateA.data.inviteCode).toBeNull()
  })

  it('valide les mots côté serveur et ne diffuse à l’adversaire que le nombre de mots trouvés (WS-09)', async () => {
    const { a, b, matchId, aId } = await privateMatch()
    const wrong = await emit<{ correct: boolean }>(a, 'match:submit-word', {
      clientEventId: id(),
      matchId,
      direction: 'across',
      number: 1,
      answer: 'TABLO',
    })
    expect(wrong).toMatchObject({ ok: true, data: { correct: false } })

    const bobSees = nextState(b, (s) =>
      s.participants.some((p) => p.userId === aId && p.solvedCount === 1),
    )
    const right = await emit<{ correct: boolean; state: MatchState }>(a, 'match:submit-word', {
      clientEventId: id(),
      matchId,
      direction: 'across',
      number: 1,
      answer: 'table',
    })
    expect(right).toMatchObject({ ok: true, data: { correct: true } })
    if (right.ok)
      expect(right.data.state.me.solvedWords).toEqual([
        { direction: 'across', number: 1, answer: 'TABLE' },
      ])
    const seen = await bobSees
    expect(seen.me.solvedWords).toEqual([])
    expect(JSON.stringify(seen)).not.toContain('TABLE')
  })

  it('une même action rejouée n’a qu’un effet (WS-04)', async () => {
    const { a, matchId } = await privateMatch()
    const payload = { clientEventId: id(), matchId, direction: 'down', number: 2, answer: 'BALLE' }
    await Promise.all([
      emit(a, 'match:submit-word', payload),
      emit(a, 'match:submit-word', payload),
      emit(a, 'match:submit-word', payload),
    ])
    const participant = await ctx.db.matchParticipant.findFirstOrThrow({
      where: { matchId, slot: 0 },
    })
    expect(participant.solvedWords).toEqual(['2-down'])
    expect(await ctx.db.matchEvent.count()).toBe(1)
  })

  it('le premier à tout trouver gagne ; le serveur décide et fige le résultat (WS-03, WS-06)', async () => {
    const { a, b, matchId, aId } = await privateMatch()
    const bobEnd = nextState(b, (s) => s.status === 'finished')
    for (const [direction, number, answer] of ANSWERS) {
      await emit(a, 'match:submit-word', {
        clientEventId: id(),
        matchId,
        direction,
        number,
        answer,
      })
    }
    const end = await bobEnd
    expect(end).toMatchObject({ status: 'finished', winnerId: aId, endReason: 'completed' })
    expect(end.participants.map((p) => p.result).sort()).toEqual(['loss', 'win'])

    const late = await emit(b, 'match:submit-word', {
      clientEventId: id(),
      matchId,
      direction: 'across',
      number: 1,
      answer: 'TABLE',
    })
    expect(late).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(await ctx.db.matchParticipant.count({ where: { active: true } })).toBe(0)
  })

  it('un non-participant ne peut ni lire ni agir sur le match (WS-02)', async () => {
    const { matchId } = await privateMatch()
    const intruder = await connect((await account()).cookie)
    expect(await emit(intruder, 'match:resync', { clientEventId: id(), matchId })).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    })
    expect(
      await emit(intruder, 'match:submit-word', {
        clientEventId: id(),
        matchId,
        direction: 'across',
        number: 1,
        answer: 'TABLE',
      }),
    ).toMatchObject({ ok: false, error: { code: 'not_found' } })
    expect(await emit(intruder, 'match:forfeit', { clientEventId: id(), matchId })).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    })
  })

  it('abandon : l’adversaire gagne', async () => {
    const { a, b, matchId, bId } = await privateMatch()
    const bobEnd = nextState(b, (s) => s.status === 'finished')
    await emit(a, 'match:forfeit', { clientEventId: id(), matchId })
    expect(await bobEnd).toMatchObject({ winnerId: bId, endReason: 'forfeit' })
  })

  it('on ne peut pas accepter sa propre invitation ni être dans deux matchs', async () => {
    const alice = await account()
    const a = await connect(alice.cookie)
    const created = await emit<MatchState>(a, 'invite:create', { clientEventId: id() })
    if (!created.ok) throw new Error('create')
    expect(
      await emit(a, 'invite:accept', { clientEventId: id(), code: created.data.inviteCode }),
    ).toMatchObject({ ok: false })
    expect(await emit(a, 'invite:create', { clientEventId: id() })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    })
    expect(await emit(a, 'queue:join', { clientEventId: id() })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    })
  })
})

describe('matchmaking rapide (WS-05)', () => {
  it('apparie 10 joueurs simultanés en 5 matchs sans double affectation', async () => {
    const players = await Promise.all(Array.from({ length: 10 }, () => account()))
    const clients = await Promise.all(players.map((p) => connect(p.cookie)))
    const results = await Promise.all(
      clients.map((socket) => emit(socket, 'queue:join', { clientEventId: id() })),
    )
    expect(results.every((r) => r.ok)).toBe(true)
    const participants = await ctx.db.matchParticipant.findMany({ where: { active: true } })
    expect(new Set(participants.map((p) => p.userId)).size).toBe(participants.length)
    expect(await ctx.db.match.count({ where: { status: 'active' } })).toBe(participants.length / 2)
    expect(participants).toHaveLength(10)
    expect(await ctx.db.matchQueueEntry.count()).toBe(0)
  })
})

describe('classement', () => {
  it('met à jour le classement Elo une seule fois, uniquement pour les matchs rapides', async () => {
    const p1 = await account()
    const p2 = await account()
    const [s1, s2] = await Promise.all([connect(p1.cookie), connect(p2.cookie)])
    await emit(s1, 'queue:join', { clientEventId: id() })
    const matched = nextState(s1, (s) => s.status === 'active')
    await emit(s2, 'queue:join', { clientEventId: id() })
    const state = await matched
    await emit(s2, 'match:forfeit', { clientEventId: id(), matchId: state.id })
    await emit(s2, 'match:forfeit', { clientEventId: id(), matchId: state.id })
    const ratings = await ctx.db.rating.findMany({ orderBy: { rating: 'desc' } })
    expect(ratings.map((r) => [r.userId, r.rating, r.gamesPlayed])).toEqual([
      [p1.id, 1216, 1],
      [p2.id, 1184, 1],
    ])
    const board = await ctx.app.inject({ method: 'GET', url: '/api/v1/leaderboard' })
    expect(
      board.json<{ items: { rank: number; rating: number }[] }>().items.map((i) => i.rating),
    ).toEqual([1216, 1184])
  })

  it('un match privé ne modifie pas le classement', async () => {
    const { a, matchId } = await privateMatch()
    await emit(a, 'match:forfeit', { clientEventId: id(), matchId })
    expect(await ctx.db.rating.count()).toBe(0)
  })
})

describe('déconnexion et reprise (WS-07, WS-08)', () => {
  it('une reconnexion dans le délai de grâce reprend le match', async () => {
    const { a, matchId } = await privateMatch()
    const alice = await ctx.db.matchParticipant.findFirstOrThrow({ where: { matchId, slot: 0 } })
    const session = await ctx.db.session.findFirstOrThrow({ where: { userId: alice.userId } })
    a.disconnect()
    await new Promise((r) => setTimeout(r, GRACE_MS / 4))
    // Recréer un cookie valide pour la même utilisatrice (nouvelle session, même compte).
    const token = generateToken()
    await ctx.db.session.create({
      data: {
        userId: session.userId,
        tokenHash: hashToken(token),
        csrfSecret: generateToken(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })
    const back = await connect(`cv_session=${token}`)
    await new Promise((r) => setTimeout(r, GRACE_MS * 2))
    const state = await emit<MatchState>(back, 'match:resync', { clientEventId: id(), matchId })
    expect(state).toMatchObject({ ok: true, data: { status: 'active' } })
  })

  it('au-delà du délai de grâce, le joueur déconnecté perd par abandon', async () => {
    const { a, b, bId } = await privateMatch()
    const bobEnd = nextState(b, (s) => s.status === 'finished')
    a.disconnect()
    expect(await bobEnd).toMatchObject({ winnerId: bId, endReason: 'disconnect' })
  })

  it('après un redémarrage de l’API, l’état du match est intact', async () => {
    const { a, matchId } = await privateMatch()
    await emit(a, 'match:submit-word', {
      clientEventId: id(),
      matchId,
      direction: 'across',
      number: 1,
      answer: 'TABLE',
    })
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      WEB_ORIGINS: ORIGIN,
      LOG_LEVEL: 'silent',
    })
    const restarted = await buildApp({ config, db: ctx.db, reconnectGraceMs: 60_000 })
    await restarted.ready()
    const match = await ctx.db.match.findUniqueOrThrow({
      where: { id: matchId },
      include: { participants: true },
    })
    expect(match.status).toBe('active')
    expect(match.participants.find((p) => p.slot === 0)?.solvedWords).toEqual(['1-across'])
    await restarted.close()
  })
})

describe('échéance', () => {
  it('départage par le nombre de mots puis par l’heure du dernier mot', async () => {
    const { a, b, matchId, aId } = await privateMatch()
    await emit(a, 'match:submit-word', {
      clientEventId: id(),
      matchId,
      direction: 'across',
      number: 1,
      answer: 'TABLE',
    })
    await emit(b, 'match:submit-word', {
      clientEventId: id(),
      matchId,
      direction: 'across',
      number: 1,
      answer: 'TABLE',
    })
    await ctx.db.match.update({
      where: { id: matchId },
      data: { deadlineAt: new Date(Date.now() - 1000) },
    })
    const service = new MatchService(ctx.db, new PuzzleRepository(ctx.db), () => new Date())
    const late = await emit(b, 'match:submit-word', {
      clientEventId: id(),
      matchId,
      direction: 'across',
      number: 4,
      answer: 'BALLE',
    })
    expect(late).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(await service.expire(matchId)).not.toBeNull()
    expect(await service.expire(matchId)).toBeNull()
    const match = await ctx.db.match.findUniqueOrThrow({ where: { id: matchId } })
    expect(match).toMatchObject({ status: 'finished', winnerId: aId, endReason: 'deadline' })
  })
})

describe('suspension par un administrateur', () => {
  it('coupe la connexion temps réel du joueur et refuse sa reconnexion', async () => {
    const player = await account()
    const socket = await connect(player.cookie)
    const disconnected = new Promise<string>((resolve) => {
      socket.once('disconnect', resolve)
    })

    const password = 'correct horse battery staple'
    await createAccount(ctx.db, {
      email: 'admin@example.com',
      username: 'madmin',
      password,
      admin: true,
    })
    const admin = await new Client(ctx.app).guest()
    await admin.request('POST', '/api/v1/auth/login', { email: 'admin@example.com', password })
    const res = await admin.request('POST', `/api/v1/admin/users/${player.id}/suspend`, {})
    expect(res.statusCode).toBe(204)

    expect(await disconnected).toBe('io server disconnect')
    await expect(connect(player.cookie)).rejects.toThrow()
  })
})
