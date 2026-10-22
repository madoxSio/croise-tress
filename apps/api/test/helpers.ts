import { existsSync } from 'node:fs'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { createDb, type Db } from '../src/db.ts'
import { MemoryMailer } from '../src/modules/mail/mailer.ts'
import { SEED_PUZZLES } from '../prisma/seed/puzzles.ts'

export const ORIGIN = 'http://localhost:3000'

/** Base de test : DATABASE_URL_TEST, sinon DATABASE_URL avec le suffixe `_test` (jamais la base de dev). */
export function testDatabaseUrl(): string {
  const rootEnv = new URL('../../../.env', import.meta.url)
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)
  const explicit = process.env['DATABASE_URL_TEST']
  if (explicit) return explicit
  const base = process.env['DATABASE_URL']
  if (!base)
    throw new Error('DATABASE_URL_TEST ou DATABASE_URL requis pour les tests d’intégration.')
  const url = new URL(base)
  url.pathname = `${url.pathname}_test`
  return url.toString()
}

export interface TestContext {
  readonly app: FastifyInstance
  readonly db: Db
  readonly mailer: MemoryMailer
  clock: Date
}

export async function createTestContext(
  options: { realClock?: boolean; reconnectGraceMs?: number } = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    WEB_ORIGINS: ORIGIN,
    LOG_LEVEL: 'silent',
  })
  const db = createDb(config.databaseUrl)
  const mailer = new MemoryMailer()
  const ctx = { db, mailer, clock: new Date('2026-10-17T10:00:00Z') } as TestContext
  const now = options.realClock ? () => new Date() : () => ctx.clock
  const app = await buildApp({
    config,
    db,
    mailer,
    now,
    ...(options.reconnectGraceMs === undefined
      ? {}
      : { reconnectGraceMs: options.reconnectGraceMs }),
  })
  return Object.assign(ctx, { app })
}

export async function resetDatabase(db: Db): Promise<void> {
  await db.$executeRaw`TRUNCATE "ratings", "match_events", "match_participants", "matches", "match_queue", "play_sessions", "daily_challenges", "auth_tokens", "sessions", "users", "puzzles" CASCADE`
}

/** Insère les puzzles de démonstration et renvoie leurs identifiants par slug. */
export async function seedPuzzles(db: Db): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const seed of SEED_PUZZLES) {
    const row = await db.puzzle.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        theme: seed.theme,
        difficulty: seed.difficulty,
        status: 'published',
        width: 5,
        height: 5,
        grid: [...seed.grid],
        clues: seed.clues.map((clue) => ({ ...clue })),
        estimatedMinutes: seed.estimatedMinutes,
      },
      select: { id: true },
    })
    ids[seed.slug] = row.id
  }
  return ids
}

/** Client de test qui conserve le cookie de session et le jeton CSRF, comme un navigateur. */
export class Client {
  cookie: string | null = null
  csrf: string | null = null
  private static nextIp = 1

  /** Chaque client a sa propre IP, comme des joueurs distincts (les limites de débit sont par IP). */
  constructor(
    private readonly app: FastifyInstance,
    readonly ip = `10.0.${Math.floor(Client.nextIp / 250)}.${(Client.nextIp++ % 250) + 1}`,
  ) {}

  async guest(): Promise<this> {
    const res = await this.request('POST', '/api/v1/session/guest')
    if (res.statusCode !== 201) throw new Error(`création d’invité : ${res.statusCode} ${res.body}`)
    return this
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    const res = await this.app.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: {
        origin: ORIGIN,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrf && method !== 'GET' ? { 'x-csrf-token': this.csrf } : {}),
        ...headers,
      },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    })
    const setCookie = res.cookies.find((c) => c.name === 'cv_session')
    if (setCookie) this.cookie = `cv_session=${setCookie.value}`
    if (res.statusCode < 300 && res.headers['content-type']?.toString().includes('json')) {
      const body = res.json<{ csrfToken?: unknown }>()
      if (typeof body.csrfToken === 'string') this.csrf = body.csrfToken
    }
    return res
  }
}

export function solvedGrid(slug: string): (string | null)[][] {
  const seed = SEED_PUZZLES.find((p) => p.slug === slug)
  if (!seed) throw new Error(slug)
  return seed.grid.map((line) => Array.from(line, (ch) => (ch === '#' ? null : ch)))
}

export function emptyGrid(): (string | null)[][] {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null))
}
