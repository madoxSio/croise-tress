import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { createDb, type Db } from '../src/db.ts'
import { MemoryMailer } from '../src/modules/mail/mailer.ts'
import { testDatabaseUrl } from './helpers.ts'

const ORIGIN = 'https://crossverse.example'
const productionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: testDatabaseUrl(),
  WEB_ORIGINS: ORIGIN,
  WEB_BASE_URL: ORIGIN,
  LOG_LEVEL: 'silent',
}

describe('configuration de production (CFG-03)', () => {
  it('refuse de démarrer avec une origine ou une URL publique en HTTP', () => {
    expect(() =>
      loadConfig({ ...productionEnv, WEB_ORIGINS: 'http://crossverse.example' }),
    ).toThrow('HTTPS obligatoire')
    expect(() => loadConfig({ ...productionEnv, WEB_BASE_URL: undefined })).toThrow(
      'HTTPS obligatoire',
    )
    expect(loadConfig(productionEnv).sessionCookieName).toBe('__Host-cv_session')
  })
})

describe('cookie et en-têtes en production (SESS-01, CFG-02)', () => {
  let app: FastifyInstance
  let db: Db
  beforeAll(async () => {
    const config = loadConfig(productionEnv)
    db = createDb(config.databaseUrl)
    app = await buildApp({ config, db, mailer: new MemoryMailer() })
  })
  afterAll(async () => {
    await app.close()
    await db.$disconnect()
  })

  it('pose un cookie __Host- HttpOnly, Secure, SameSite=Lax et active HSTS', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/session/guest',
      headers: { origin: ORIGIN },
      remoteAddress: '10.9.9.9',
    })
    expect(res.statusCode).toBe(201)
    const cookie = res.cookies.find((c) => c.name === '__Host-cv_session')
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
    expect(cookie).not.toHaveProperty('domain')
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/)
    await db.user.deleteMany({ where: { sessions: { some: {} }, passwordHash: null } })
  })
})

describe('IP cliente derrière un proxy (TRUST_PROXY)', () => {
  it('ne fait confiance qu’au nombre de sauts configuré : un X-Forwarded-For forgé est ignoré', async () => {
    const config = loadConfig({ ...productionEnv, TRUST_PROXY: '1' })
    expect(config.trustProxy).toBe(1)
    expect(() => loadConfig({ ...productionEnv, TRUST_PROXY: 'beaucoup' })).toThrow('TRUST_PROXY')
    const db = createDb(config.databaseUrl)
    const app = await buildApp({ config, db, mailer: new MemoryMailer() })
    app.get('/ip-de-test', (request) => ({ ip: request.ip }))
    try {
      // Le client forge « 1.2.3.4 » ; Caddy ajoute l'IP réelle 203.0.113.7 à droite.
      const res = await app.inject({
        method: 'GET',
        url: '/ip-de-test',
        remoteAddress: '10.0.0.2',
        headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' },
      })
      expect(res.json()).toEqual({ ip: '203.0.113.7' })
    } finally {
      await app.close()
      await db.$disconnect()
    }
  })
})

describe('limite globale de débit (RATE_LIMIT_MAX)', () => {
  it('vaut 300 requêtes/min par défaut, se règle et refuse une valeur absurde', async () => {
    expect(loadConfig(productionEnv).rateLimitMax).toBe(300)
    expect(() => loadConfig({ ...productionEnv, RATE_LIMIT_MAX: '0' })).toThrow('RATE_LIMIT_MAX')
    const config = loadConfig({ ...productionEnv, RATE_LIMIT_MAX: '2' })
    const db = createDb(config.databaseUrl)
    const app = await buildApp({ config, db, mailer: new MemoryMailer() })
    try {
      const hit = () =>
        app.inject({ method: 'GET', url: '/api/v1/health', remoteAddress: '10.7.7.7' })
      expect((await hit()).statusCode).toBe(200)
      expect((await hit()).statusCode).toBe(200)
      expect((await hit()).statusCode).toBe(429)
    } finally {
      await app.close()
      await db.$disconnect()
    }
  })
})
