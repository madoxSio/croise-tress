import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { MatchState } from '@crossverse/contracts'
import type { SocketLike } from '../app/services/match'

const ME = '01a14a14-abfe-777e-8562-c5323b3bf9d1'
const OTHER = '01a14a15-8d17-724f-8df4-46b08f36350c'
const MATCH = '01a14a07-9cf5-704f-afa3-629f1b4992ad'

function matchState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    id: MATCH,
    mode: 'quick',
    status: 'active',
    inviteCode: null,
    puzzle: null,
    totalWords: 6,
    startedAt: '2026-10-17T12:00:00.000Z',
    deadlineAt: '2026-10-17T12:15:00.000Z',
    serverTime: '2026-10-17T12:01:00.000Z',
    endReason: null,
    winnerId: null,
    me: { userId: ME, solvedWords: [] },
    participants: [
      { userId: ME, username: 'alice', solvedCount: 0, connected: true, result: null },
      { userId: OTHER, username: 'bob', solvedCount: 0, connected: true, result: null },
    ],
    ...overrides,
  }
}

type Listener = (...args: unknown[]) => void
type Reply = (event: string, payload: unknown) => unknown

/** Faux socket : connexion pilotée par le test, accusés produits par `reply`. */
class FakeSocket implements SocketLike {
  connected = false
  active = false
  readonly sent: { event: string; payload: unknown }[] = []
  reply: Reply | null = (event) => (event === 'queue:leave' ? { ok: true } : undefined)
  private readonly listeners = new Map<string, Listener[]>()

  connect(): void {
    this.active = true
  }

  disconnect(): void {
    this.connected = false
    this.active = false
    this.fire('disconnect', 'io client disconnect')
  }

  on(event: string, listener: (...args: never[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener as Listener])
  }

  emit(event: string, payload: unknown, ack: (response: unknown) => void): void {
    this.sent.push({ event, payload })
    const response = this.reply?.(event, payload)
    if (response !== undefined)
      queueMicrotask(() => {
        ack(response)
      })
  }

  fire(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args)
  }

  /** Connexion (ou reconnexion) réussie. */
  open(): void {
    this.connected = true
    this.active = true
    this.fire('connect')
  }

  /** Coupure réseau : Socket.IO retentera seul (`active` reste vrai). */
  drop(): void {
    this.connected = false
    this.fire('disconnect', 'transport close')
  }
}

async function setup(options: { ackTimeoutMs?: number } = {}) {
  const { MatchConnection } = await import('../app/services/match')
  const socket = new FakeSocket()
  let counter = 0
  const connection = new MatchConnection({
    factory: () => socket,
    newId: () => `event-${++counter}-id`,
    ...options,
  })
  return { connection, socket }
}

describe('services/match — REST', () => {
  let calls: string[]
  let responses: Record<string, unknown>

  beforeEach(() => {
    calls = []
    responses = {}
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        calls.push(input)
        const body = responses[input]
        return Promise.resolve(
          new Response(JSON.stringify(body ?? null), { status: body === undefined ? 404 : 200 }),
        )
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lit le classement avec la limite demandée et valide la réponse', async () => {
    responses['/api/v1/leaderboard?limit=25'] = {
      items: [{ rank: 1, username: 'alice', rating: 1216, gamesPlayed: 1, wins: 1 }],
    }
    const { matchApi } = await import('../app/services/match')
    const board = await matchApi.leaderboard(25)
    expect(board.items[0]).toMatchObject({ rank: 1, rating: 1216 })
    expect(calls).toEqual(['/api/v1/leaderboard?limit=25'])
  })

  it('rejette une réponse non conforme (champ inconnu)', async () => {
    responses['/api/v1/me/rating'] = {
      rating: 1200,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      isAdmin: true,
    }
    const { matchApi } = await import('../app/services/match')
    await expect(matchApi.myRating()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('lit l’historique des duels', async () => {
    responses['/api/v1/me/matches?limit=10'] = {
      items: [
        {
          matchId: MATCH,
          mode: 'private',
          puzzleTitle: 'La table',
          opponent: 'bob',
          result: 'win',
          endReason: 'completed',
          solvedCount: 6,
          endedAt: '2026-10-17T12:05:00.000Z',
        },
      ],
    }
    const { matchApi } = await import('../app/services/match')
    const history = await matchApi.myMatches(10)
    expect(history.items).toHaveLength(1)
  })
})

describe('services/match — connexion temps réel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ajoute un clientEventId unique à chaque action et renvoie l’accusé', async () => {
    const { connection, socket } = await setup()
    socket.reply = (event) =>
      event === 'queue:join' ? { ok: true, data: { status: 'queued' } } : undefined
    connection.connect()
    socket.open()
    expect(connection.status).toBe('connected')

    const first = await connection.emit('queue:join', {})
    await connection.emit('queue:join', {})
    expect(first).toEqual({ ok: true, data: { status: 'queued' } })
    const ids = socket.sent.map((s) => (s.payload as { clientEventId: string }).clientEventId)
    expect(ids).toEqual(['event-1-id', 'event-2-id'])
  })

  it('envoie `queue:leave` sans identifiant (contrat) et accepte un accusé sans données', async () => {
    const { connection, socket } = await setup()
    connection.connect()
    socket.open()
    expect(await connection.emit('queue:leave', {})).toEqual({ ok: true, data: undefined })
    expect(socket.sent).toEqual([{ event: 'queue:leave', payload: {} }])
  })

  it('hors ligne : échec immédiat, rien n’est mis en file', async () => {
    const { connection, socket } = await setup()
    connection.connect()
    const ack = await connection.emit('match:forfeit', { matchId: MATCH })
    expect(ack).toMatchObject({ ok: false, error: { code: 'offline' } })
    expect(socket.sent).toEqual([])
  })

  it('délai dépassé sans accusé', async () => {
    vi.useFakeTimers()
    const { connection, socket } = await setup({ ackTimeoutMs: 500 })
    socket.reply = null
    connection.connect()
    socket.open()
    const pending = connection.emit('match:resync', { matchId: MATCH })
    await vi.advanceTimersByTimeAsync(500)
    expect(await pending).toMatchObject({ ok: false, error: { code: 'timeout' } })
  })

  it('rejette un accusé invalide et diffuse l’état contenu dans un accusé valide', async () => {
    const { connection, socket } = await setup()
    const seen: MatchState[] = []
    connection.onState((state) => seen.push(state))
    connection.connect()
    socket.open()

    socket.reply = () => ({ ok: true, data: { ...matchState(), solution: 'TABLE' } })
    expect(await connection.emit('match:resync', { matchId: MATCH })).toMatchObject({
      ok: false,
      error: { code: 'invalid_response' },
    })
    expect(seen).toEqual([])

    socket.reply = () => ({ ok: true, data: { correct: true, state: matchState() } })
    const ack = await connection.emit('match:submit-word', {
      matchId: MATCH,
      direction: 'across',
      number: 1,
      answer: 'TABLE',
    })
    expect(ack).toMatchObject({ ok: true, data: { correct: true } })
    expect(seen).toHaveLength(1)
    expect(connection.state?.id).toBe(MATCH)
  })

  it('valide `match:state` et ignore un état plus ancien que celui connu', async () => {
    const { connection, socket } = await setup()
    const seen: string[] = []
    connection.onState((state) => seen.push(state.serverTime))
    connection.connect()
    socket.open()
    socket.fire('match:state', { bogus: true })
    socket.fire('match:state', matchState({ serverTime: '2026-10-17T12:02:00.000Z' }))
    socket.fire('match:state', matchState({ serverTime: '2026-10-17T12:01:00.000Z' }))
    expect(seen).toEqual(['2026-10-17T12:02:00.000Z'])
  })

  it('compte requis : refus d’authentification à la connexion', async () => {
    const { connection, socket } = await setup()
    connection.connect()
    socket.active = false
    socket.fire('connect_error', new Error('account_required'))
    expect(connection.status).toBe('account_required')
  })

  it('après une reconnexion, redemande l’état du match suivi', async () => {
    const { connection, socket } = await setup()
    socket.reply = () => ({ ok: true, data: matchState() })
    const statuses: string[] = []
    connection.onStatus((status) => statuses.push(status))
    connection.connect()
    socket.open()
    socket.fire('match:state', matchState())
    expect(socket.sent).toEqual([])

    socket.drop()
    socket.fire('connect_error', new Error('websocket error'))
    socket.open()
    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting', 'connected'])
    expect(socket.sent).toEqual([
      { event: 'match:resync', payload: { matchId: MATCH, clientEventId: 'event-1-id' } },
    ])
  })

  it('une déconnexion volontaire laisse le statut au repos', async () => {
    const { connection, socket } = await setup()
    connection.connect()
    socket.open()
    connection.disconnect()
    expect(connection.status).toBe('idle')
  })
})

describe('useMatch — logique pure', () => {
  it('temps restant : échéance serveur corrigée de l’écart d’horloge, jamais négatif', async () => {
    const { matchClockOffset, matchRemainingMs } = await import('../app/composables/useMatch')
    const state = matchState()
    // Horloge locale en retard de 5 s sur le serveur.
    const received = Date.parse(state.serverTime) - 5000
    const offset = matchClockOffset(state, received)
    expect(offset).toBe(5000)
    expect(matchRemainingMs(state, offset, received)).toBe(14 * 60 * 1000)
    expect(matchRemainingMs(state, offset, received + 20 * 60 * 1000)).toBe(0)
    expect(matchRemainingMs(matchState({ status: 'finished' }), offset, received)).toBeNull()
  })

  it('distingue le joueur de son adversaire', async () => {
    const { matchSides } = await import('../app/composables/useMatch')
    const sides = matchSides(matchState())
    expect(sides.me?.username).toBe('alice')
    expect(sides.opponent?.username).toBe('bob')
    expect(matchSides(null).me).toBeUndefined()
  })

  it('normalise un code d’invitation saisi', async () => {
    const { normalizeInviteCode } = await import('../app/composables/useMatch')
    expect(normalizeInviteCode(' abc-def ')).toBe('ABCDEF')
    expect(normalizeInviteCode('ab2 3cd')).toBe('AB23CD')
    expect(normalizeInviteCode('ABCDE0')).toBeNull()
    expect(normalizeInviteCode('ABC')).toBeNull()
  })

  it('explique la fin du match du point de vue du joueur', async () => {
    const { matchEndLabel } = await import('../app/composables/useMatch')
    expect(
      matchEndLabel(matchState({ status: 'finished', endReason: 'forfeit', winnerId: ME })),
    ).toBe('Votre adversaire a abandonné.')
    expect(
      matchEndLabel(matchState({ status: 'finished', endReason: 'deadline', winnerId: null })),
    ).toContain('égalité')
    expect(matchEndLabel(matchState({ status: 'aborted' }))).toBe('Invitation annulée.')
  })
})

describe('useMatch — composable', () => {
  async function mount() {
    const { connection, socket } = await setup()
    const { useMatch } = await import('../app/composables/useMatch')
    let now = Date.parse('2026-10-17T12:01:00.000Z')
    const scope = effectScope()
    const match = scope.run(() => useMatch({ connection, clock: () => now }))
    if (!match) throw new Error('scope')
    return {
      match,
      socket,
      scope,
      advance: (ms: number) => {
        now += ms
      },
    }
  }

  it('entre en file et y revient après une reconnexion', async () => {
    const { match, socket, scope } = await mount()
    socket.reply = (event) =>
      event === 'queue:join' ? { ok: true, data: { status: 'queued' } } : undefined
    socket.open()
    await match.joinQueue()
    expect(match.queue.value).toBe('queued')

    socket.drop()
    expect(match.status.value).toBe('reconnecting')
    socket.open()
    await vi.waitFor(() => {
      expect(socket.sent.filter((s) => s.event === 'queue:join')).toHaveLength(2)
    })

    // Appariement annoncé par le serveur : la file est vidée.
    socket.fire('match:state', matchState())
    expect(match.queue.value).toBe('idle')
    expect(match.state.value?.id).toBe(MATCH)
    scope.stop()
  })

  it('affiche le délai de grâce quand l’adversaire se déconnecte', async () => {
    const { match, socket, scope, advance } = await mount()
    socket.open()
    socket.fire(
      'match:state',
      matchState({
        participants: [
          { userId: ME, username: 'alice', solvedCount: 2, connected: true, result: null },
          { userId: OTHER, username: 'bob', solvedCount: 1, connected: false, result: null },
        ],
      }),
    )
    expect(match.opponent.value?.connected).toBe(false)
    expect(match.opponentGraceMs.value).toBe(30_000)
    expect(match.remainingMs.value).toBe(14 * 60 * 1000)
    scope.stop()
    advance(0)
  })

  it('refuse un code invalide sans rien envoyer', async () => {
    const { match, socket, scope } = await mount()
    socket.open()
    expect(await match.acceptInvite('OOOOOO')).toBeNull()
    expect(match.error.value).toContain('Code invalide')
    expect(socket.sent).toEqual([])
    scope.stop()
  })

  it('soumet un mot et renvoie le verdict du serveur', async () => {
    const { match, socket, scope } = await mount()
    socket.open()
    socket.fire('match:state', matchState())
    socket.reply = () => ({
      ok: true,
      data: {
        correct: true,
        state: matchState({
          serverTime: '2026-10-17T12:02:00.000Z',
          me: { userId: ME, solvedWords: [{ direction: 'across', number: 1, answer: 'TABLE' }] },
        }),
      },
    })
    expect(await match.submitWord('across', 1, 'TABLE')).toBe(true)
    expect(match.solvedKeys.value.has('1-across')).toBe(true)
    scope.stop()
  })

  it('se détache de la connexion à la destruction du scope', async () => {
    const { match, socket, scope } = await mount()
    socket.open()
    scope.stop()
    socket.fire('match:state', matchState())
    expect(match.state.value).toBeNull()
  })
})
