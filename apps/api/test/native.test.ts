import {
  NATIVE_CLIENT_HEADER,
  NATIVE_CLIENT_VALUE,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@crossverse/contracts'
import type { LightMyRequestResponse } from 'fastify'
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  Client,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  type TestContext,
} from './helpers.ts'

/**
 * Clients natifs (app mobile) : jeton porteur au lieu du cookie, sans en-tête Origin.
 * Cf. docs/proposals/mobile-native-auth.md.
 */

let ctx: TestContext
let url: string
let puzzleId: string
const sockets: Socket<ServerToClientEvents, ClientToServerEvents>[] = []

beforeAll(async () => {
  ctx = await createTestContext({ realClock: true })
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
  ctx.mailer.sent.length = 0
  const ids = await seedPuzzles(ctx.db)
  puzzleId = ids['la-table'] ?? ''
})

const PASSWORD = 'correct horse battery staple'
let nextIp = 1

function lastEmailToken(): string {
  const match = /token=([\w-]{43})/.exec(ctx.mailer.sent.at(-1)?.text ?? '')
  if (!match?.[1]) throw new Error('aucun jeton dans le dernier e-mail')
  return match[1]
}

/** Client natif : jamais d'Origin ni de cookie, jeton gardé comme dans le coffre du téléphone. */
class NativeClient {
  token: string | null = null
  csrf: string | null = null
  readonly ip = `10.9.0.${nextIp++}`

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    const res = await ctx.app.inject({
      method,
      url: `/api/v1${path}`,
      remoteAddress: this.ip,
      headers: {
        [NATIVE_CLIENT_HEADER]: NATIVE_CLIENT_VALUE,
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(this.csrf && method !== 'GET' ? { 'x-csrf-token': this.csrf } : {}),
        ...headers,
      },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    })
    if (res.statusCode < 300 && res.headers['content-type']?.toString().includes('json')) {
      const body = res.json<{ csrfToken?: unknown; sessionToken?: unknown }>()
      if (typeof body.csrfToken === 'string') this.csrf = body.csrfToken
      if (typeof body.sessionToken === 'string') this.token = body.sessionToken
    }
    return res
  }

  async guest(): Promise<this> {
    const res = await this.request('POST', '/session/guest')
    expect(res.statusCode).toBe(201)
    return this
  }

  /** Compte confirmé, la session native devenant celle du compte. */
  async verifiedAccount(name: string): Promise<this> {
    await this.guest()
    const res = await this.request('POST', '/auth/register', {
      email: `${name}@example.com`,
      username: name,
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(202)
    const verified = await this.request('POST', '/auth/verify-email', { token: lastEmailToken() })
    expect(verified.statusCode).toBe(200)
    return this
  }
}

describe('HTTP — client natif', () => {
  it('ouvre une session invitée sans Origin et reçoit le jeton dans le corps, sans cookie', async () => {
    const client = new NativeClient()
    const res = await client.request('POST', '/session/guest')

    expect(res.statusCode).toBe(201)
    expect(res.json<{ sessionToken: string }>().sessionToken).toMatch(/^[\w-]{43}$/)
    expect(res.headers['set-cookie']).toBeUndefined()
    const session = await client.request('GET', '/session')
    expect(session.json<{ user: { isGuest: boolean } }>().user.isGuest).toBe(true)
  })

  it('ne remet jamais le jeton brut à un navigateur', async () => {
    const browser = new Client(ctx.app)
    const res = await browser.request('POST', '/api/v1/session/guest')
    expect(res.statusCode).toBe(201)
    expect(res.json()).not.toHaveProperty('sessionToken')
    expect(browser.cookie).not.toBeNull()
  })

  it('exige toujours le jeton CSRF sur une requête mutante authentifiée', async () => {
    const client = await new NativeClient().guest()
    const csrf = client.csrf
    client.csrf = null
    const refused = await client.request('POST', '/play-sessions', { puzzleId })
    expect(refused.statusCode).toBe(403)
    expect(refused.json<{ error: { code: string } }>().error.code).toBe('csrf_rejected')

    client.csrf = csrf
    const accepted = await client.request('POST', '/play-sessions', { puzzleId })
    expect(accepted.statusCode).toBe(201)
  })

  it('ignore le cookie en mode natif : seule l’en-tête Authorization compte', async () => {
    const browser = await new Client(ctx.app).guest()
    const native = new NativeClient()
    const res = await native.request('GET', '/session', undefined, { cookie: browser.cookie ?? '' })
    expect(res.json<{ user: unknown }>().user).toBeNull()
  })

  it('refuse un en-tête Authorization mal formé ou un jeton inconnu', async () => {
    const native = new NativeClient()
    for (const authorization of ['Bearer court', 'Basic abc', `Bearer ${'a'.repeat(43)} x`]) {
      const res = await native.request('GET', '/session', undefined, { authorization })
      expect(res.statusCode).toBe(401)
    }
    const unknown = await native.request('GET', '/session', undefined, {
      authorization: `Bearer ${'a'.repeat(43)}`,
    })
    expect(unknown.json<{ user: unknown }>().user).toBeNull()
  })

  it('n’accepte pas de jeton porteur sans l’en-tête natif (navigateur)', async () => {
    const native = await new NativeClient().guest()
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers: { authorization: `Bearer ${native.token ?? ''}` },
    })
    expect(res.json<{ user: unknown }>().user).toBeNull()

    // Sans l'en-tête natif, une requête mutante sans Origin reste refusée.
    const mutating = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/play-sessions',
      headers: { authorization: `Bearer ${native.token ?? ''}`, 'x-csrf-token': native.csrf ?? '' },
      payload: { puzzleId },
    })
    expect(mutating.statusCode).toBe(403)
  })

  it('renouvelle le jeton à la confirmation puis à la connexion, et révoque l’ancien', async () => {
    const client = await new NativeClient().verifiedAccount('nina')
    const afterVerify = client.token

    const relogin = new NativeClient()
    relogin.token = afterVerify
    relogin.csrf = client.csrf
    const res = await relogin.request('POST', '/auth/login', {
      email: 'nina@example.com',
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(200)
    expect(relogin.token).not.toBe(afterVerify)

    const stale = new NativeClient()
    stale.token = afterVerify
    const session = await stale.request('GET', '/session')
    expect(session.json<{ user: unknown }>().user).toBeNull()
  })

  it('révoque le jeton à la déconnexion', async () => {
    const client = await new NativeClient().verifiedAccount('omar')
    const res = await client.request('POST', '/auth/logout')
    expect(res.statusCode).toBe(204)
    expect(res.headers['set-cookie']).toBeUndefined()
    const session = await client.request('GET', '/session')
    expect(session.json<{ user: unknown }>().user).toBeNull()
  })

  it('supprime le compte depuis l’app (exigence App Store) et révoque le jeton', async () => {
    const client = await new NativeClient().verifiedAccount('sami')
    const res = await client.request('DELETE', '/auth/account', { password: PASSWORD })
    expect(res.statusCode).toBe(204)
    expect(res.headers['set-cookie']).toBeUndefined()
    const session = await client.request('GET', '/session')
    expect(session.json<{ user: unknown }>().user).toBeNull()
    expect(await ctx.db.user.count({ where: { email: 'sami@example.com' } })).toBe(0)
  })
})

describe('temps réel — client natif', () => {
  function connect(options: {
    token?: string | null
    native?: boolean
    headers?: Record<string, string>
  }): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, {
      path: '/ws',
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        ...(options.native === false ? {} : { [NATIVE_CLIENT_HEADER]: NATIVE_CLIENT_VALUE }),
        ...options.headers,
      },
      ...(options.token === undefined ? {} : { auth: { token: options.token } }),
    })
    sockets.push(socket)
    return new Promise((resolve, reject) => {
      socket.once('connect', () => {
        resolve(socket)
      })
      socket.once('connect_error', reject)
    })
  }

  it('authentifie un compte confirmé par le jeton de la poignée de main, sans Origin', async () => {
    const client = await new NativeClient().verifiedAccount('paul')
    const socket = await connect({ token: client.token })
    expect(socket.connected).toBe(true)
  })

  it('refuse un jeton absent, mal formé ou inconnu', async () => {
    for (const token of [null, 'court', 'a'.repeat(43)]) {
      await expect(connect({ token })).rejects.toThrow('unauthenticated')
    }
  })

  it('exige un compte confirmé, comme pour un navigateur', async () => {
    const guest = await new NativeClient().guest()
    await expect(connect({ token: guest.token })).rejects.toThrow('account_required')
  })

  it('ignore le cookie en mode natif', async () => {
    const browser = new Client(ctx.app)
    await browser.guest()
    await expect(
      connect({ token: null, headers: { cookie: browser.cookie ?? '' } }),
    ).rejects.toThrow('unauthenticated')
  })

  it('n’accepte pas le jeton d’un client qui ne s’annonce pas natif', async () => {
    const client = await new NativeClient().verifiedAccount('rita')
    await expect(
      connect({ token: client.token, native: false, headers: { origin: 'https://evil.example' } }),
    ).rejects.toThrow()
    await expect(connect({ token: client.token, native: false })).rejects.toThrow('unauthenticated')
  })
})
