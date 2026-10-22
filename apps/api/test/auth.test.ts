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
beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await ctx.app.close()
  await ctx.db.$disconnect()
})
beforeEach(async () => {
  await resetDatabase(ctx.db)
  ctx.mailer.sent.length = 0
})

const PASSWORD = 'correct horse battery staple'

function lastToken(): string {
  const text = ctx.mailer.sent.at(-1)?.text ?? ''
  const match = /token=([\w-]{43})/.exec(text)
  if (!match?.[1]) throw new Error(`aucun jeton dans : ${text}`)
  return match[1]
}

async function registeredAccount(email = 'alice@example.com', username = 'alice'): Promise<Client> {
  const client = await new Client(ctx.app).guest()
  const res = await client.request('POST', '/api/v1/auth/register', {
    email,
    username,
    password: PASSWORD,
  })
  expect(res.statusCode).toBe(202)
  const verified = await client.request('POST', '/api/v1/auth/verify-email', { token: lastToken() })
  expect(verified.statusCode).toBe(200)
  return client
}

describe('inscription et confirmation (AUTH-01, AUTH-02, AUTH-05)', () => {
  it('n’active le compte qu’après confirmation, avec un hash Argon2id', async () => {
    const client = await new Client(ctx.app).guest()
    const res = await client.request('POST', '/api/v1/auth/register', {
      email: 'alice@example.com',
      username: 'alice',
      password: PASSWORD,
    })
    expect(res.json()).toEqual({ status: 'accepted' })
    expect((await ctx.db.user.findFirstOrThrow()).email).toBeNull()

    const token = lastToken()
    const stored = await ctx.db.authToken.findFirstOrThrow()
    expect(stored.tokenHash).not.toContain(token)
    expect(stored.pendingPasswordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/)
    expect(stored.pendingPasswordHash).not.toContain(PASSWORD)

    const verified = await client.request('POST', '/api/v1/auth/verify-email', { token })
    expect(verified.json()).toMatchObject({
      user: { username: 'alice', isGuest: false, emailVerified: true, email: 'alice@example.com' },
    })
    const user = await ctx.db.user.findFirstOrThrow()
    expect(user.email).toBe('alice@example.com')
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('conserve la progression du compte invité qui s’inscrit', async () => {
    const client = await new Client(ctx.app).guest()
    const guestId = (await ctx.db.user.findFirstOrThrow()).id
    await client.request('POST', '/api/v1/auth/register', {
      email: 'a@example.com',
      username: 'aa1',
      password: PASSWORD,
    })
    await client.request('POST', '/api/v1/auth/verify-email', { token: lastToken() })
    expect((await ctx.db.user.findFirstOrThrow({ where: { username: 'aa1' } })).id).toBe(guestId)
  })

  it('répond de façon identique quand l’e-mail est déjà utilisé, sans créer de jeton', async () => {
    await registeredAccount()
    const other = await new Client(ctx.app).guest()
    const res = await other.request('POST', '/api/v1/auth/register', {
      email: 'ALICE@example.com',
      username: 'mallory',
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ status: 'accepted' })
    expect(ctx.mailer.sent.at(-1)?.subject).toContain('déjà un compte')
    expect(await ctx.db.authToken.count({ where: { usedAt: null } })).toBe(0)
  })

  it('refuse un pseudo pris, un mot de passe court ou courant, et des champs en trop', async () => {
    await registeredAccount()
    const client = await new Client(ctx.app).guest()
    const url = '/api/v1/auth/register'
    expect(
      (
        await client.request('POST', url, {
          email: 'b@example.com',
          username: 'Alice',
          password: PASSWORD,
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await client.request('POST', url, {
          email: 'b@example.com',
          username: 'bob',
          password: 'court',
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await client.request('POST', url, {
          email: 'b@example.com',
          username: 'bob',
          password: 'motdepasse123',
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await client.request('POST', url, {
          email: 'b@example.com',
          username: 'bob',
          password: PASSWORD,
          role: 'admin',
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await client.request('POST', url, {
          email: 'b@example.com',
          username: '<script>',
          password: PASSWORD,
        })
      ).statusCode,
    ).toBe(400)
  })

  it('refuse un jeton réutilisé, expiré ou inconnu', async () => {
    const client = await new Client(ctx.app).guest()
    await client.request('POST', '/api/v1/auth/register', {
      email: 'a@example.com',
      username: 'aa1',
      password: PASSWORD,
    })
    const token = lastToken()
    expect((await client.request('POST', '/api/v1/auth/verify-email', { token })).statusCode).toBe(
      200,
    )
    expect((await client.request('POST', '/api/v1/auth/verify-email', { token })).statusCode).toBe(
      400,
    )
    expect(
      (await client.request('POST', '/api/v1/auth/verify-email', { token: 'a'.repeat(43) }))
        .statusCode,
    ).toBe(400)

    const other = await new Client(ctx.app).guest()
    await other.request('POST', '/api/v1/auth/register', {
      email: 'b@example.com',
      username: 'bb1',
      password: PASSWORD,
    })
    await ctx.db.authToken.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(
      (await other.request('POST', '/api/v1/auth/verify-email', { token: lastToken() })).statusCode,
    ).toBe(400)
  })

  it('un nouveau jeton invalide le précédent', async () => {
    const client = await new Client(ctx.app).guest()
    await client.request('POST', '/api/v1/auth/register', {
      email: 'a@example.com',
      username: 'aa1',
      password: PASSWORD,
    })
    const first = lastToken()
    await client.request('POST', '/api/v1/auth/register', {
      email: 'a@example.com',
      username: 'aa1',
      password: PASSWORD,
    })
    expect(
      (await client.request('POST', '/api/v1/auth/verify-email', { token: first })).statusCode,
    ).toBe(400)
    expect(
      (await client.request('POST', '/api/v1/auth/verify-email', { token: lastToken() }))
        .statusCode,
    ).toBe(200)
  })

  it('un compte déjà inscrit ne peut pas se réinscrire', async () => {
    const client = await registeredAccount()
    const res = await client.request('POST', '/api/v1/auth/register', {
      email: 'x@example.com',
      username: 'xx1',
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(409)
  })
})

describe('connexion (AUTH-04, SESS-02)', () => {
  it('connecte avec un nouvel identifiant de session et révoque la précédente', async () => {
    await registeredAccount()
    const browser = await new Client(ctx.app).guest()
    const guestCookie = browser.cookie
    const res = await browser.request('POST', '/api/v1/auth/login', {
      email: 'alice@example.com',
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ user: { username: 'alice', isGuest: false } })
    expect(browser.cookie).not.toBe(guestCookie)

    const stale = new Client(ctx.app)
    stale.cookie = guestCookie
    expect((await stale.request('GET', '/api/v1/session')).json()).toEqual({
      user: null,
      csrfToken: null,
    })
  })

  it('rattache la progression de l’invité au compte, sans doublon de partie en cours', async () => {
    const ids = await seedPuzzles(ctx.db)
    const account = await registeredAccount()
    const [table, salon] = [ids['la-table'], ids['le-salon']]
    if (!table || !salon) throw new Error('puzzles')
    await account.request('POST', '/api/v1/play-sessions', { puzzleId: salon })
    await account.request('PUT', `/api/v1/me/favorites/${table}`)

    const guest = await new Client(ctx.app).guest()
    const guestId = (await guest.request('GET', '/api/v1/session')).json<{ user: { id: string } }>()
      .user.id
    const start = await guest.request('POST', '/api/v1/play-sessions', { puzzleId: table })
    const session = start.json<{ id: string; revision: number }>()
    await guest.request('PUT', `/api/v1/play-sessions/${session.id}/grid`, {
      grid: solvedGrid('la-table'),
      revision: session.revision,
    })
    await guest.request('POST', '/api/v1/play-sessions', { puzzleId: salon })
    await guest.request('PUT', `/api/v1/me/favorites/${table}`)

    const res = await guest.request('POST', '/api/v1/auth/login', {
      email: 'alice@example.com',
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(200)
    expect(await ctx.db.user.findUnique({ where: { id: guestId } })).toBeNull()
    const accountId = (await ctx.db.user.findFirstOrThrow({ where: { username: 'alice' } })).id
    const sessions = await ctx.db.playSession.findMany({
      where: { userId: accountId },
      select: { puzzleId: true, status: true },
    })
    expect(sessions.map((p) => [p.puzzleId, p.status]).sort()).toEqual(
      [
        [table, 'completed'],
        [salon, 'in_progress'],
      ].sort(),
    )
    expect(await ctx.db.favorite.count()).toBe(1)
    const achievements = (await guest.request('GET', '/api/v1/me/achievements')).json<{
      items: { code: string; unlockedAt: string | null }[]
    }>()
    expect(achievements.items.find((a) => a.code === 'first_grid')?.unlockedAt).not.toBeNull()
  })

  it('répond de la même façon pour un mot de passe faux ou un compte inconnu', async () => {
    await registeredAccount()
    const client = await new Client(ctx.app).guest()
    const wrong = await client.request('POST', '/api/v1/auth/login', {
      email: 'alice@example.com',
      password: 'mauvais mot de passe',
    })
    const unknown = await client.request('POST', '/api/v1/auth/login', {
      email: 'nobody@example.com',
      password: 'mauvais mot de passe',
    })
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.body).toBe(unknown.body)
  })

  it('bloque la 6ᵉ tentative en 15 minutes pour une même adresse et une même IP', async () => {
    await registeredAccount()
    const client = await new Client(ctx.app).guest()
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (
          await client.request('POST', '/api/v1/auth/login', {
            email: 'alice@example.com',
            password: 'x',
          })
        ).statusCode,
      )
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429])
  })

  it('limite par adresse, puis par IP au-delà de 30 adresses en 15 minutes', async () => {
    const client = await new Client(ctx.app).guest()
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) {
      const res = await client.request('POST', '/api/v1/auth/login', {
        email: `inconnu${String(i)}@example.com`,
        password: 'x',
      })
      statuses.push(res.statusCode)
    }
    expect(statuses).toEqual([...Array<number>(30).fill(401), 429])
  })

  it('déconnexion : la session est révoquée et le cookie effacé', async () => {
    const client = await registeredAccount()
    const res = await client.request('POST', '/api/v1/auth/logout')
    expect(res.statusCode).toBe(204)
    const revoked = new Client(ctx.app)
    revoked.cookie = client.cookie
    expect((await revoked.request('GET', '/api/v1/session')).json()).toEqual({
      user: null,
      csrfToken: null,
    })
  })
})

describe('mot de passe oublié (AUTH-03, AUTH-06)', () => {
  it('répond de façon identique pour une adresse inconnue, sans envoyer d’e-mail', async () => {
    const client = await new Client(ctx.app).guest()
    const res = await client.request('POST', '/api/v1/auth/password/forgot', {
      email: 'nobody@example.com',
    })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ status: 'accepted' })
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('réinitialise le mot de passe et ferme toutes les sessions', async () => {
    const alice = await registeredAccount()
    const helper = await new Client(ctx.app).guest()
    await helper.request('POST', '/api/v1/auth/password/forgot', { email: 'alice@example.com' })
    const token = lastToken()
    const res = await helper.request('POST', '/api/v1/auth/password/reset', {
      token,
      password: 'un tout nouveau secret',
    })
    expect(res.statusCode).toBe(204)

    expect((await alice.request('GET', '/api/v1/session')).json()).toEqual({
      user: null,
      csrfToken: null,
    })
    const login = await new Client(ctx.app).guest()
    expect(
      (
        await login.request('POST', '/api/v1/auth/login', {
          email: 'alice@example.com',
          password: PASSWORD,
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await login.request('POST', '/api/v1/auth/login', {
          email: 'alice@example.com',
          password: 'un tout nouveau secret',
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await helper.request('POST', '/api/v1/auth/password/reset', {
          token,
          password: 'encore un autre secret',
        })
      ).statusCode,
    ).toBe(400)
  })

  it('un jeton de réinitialisation ne sert pas à confirmer un e-mail, et inversement', async () => {
    await registeredAccount()
    const client = await new Client(ctx.app).guest()
    await client.request('POST', '/api/v1/auth/password/forgot', { email: 'alice@example.com' })
    expect(
      (await client.request('POST', '/api/v1/auth/verify-email', { token: lastToken() }))
        .statusCode,
    ).toBe(400)
  })
})

describe('gestion du compte', () => {
  it('change le mot de passe en gardant la session courante et en fermant les autres', async () => {
    const alice = await registeredAccount()
    const otherDevice = await new Client(ctx.app).guest()
    await otherDevice.request('POST', '/api/v1/auth/login', {
      email: 'alice@example.com',
      password: PASSWORD,
    })

    const wrong = await alice.request('POST', '/api/v1/auth/password/change', {
      currentPassword: 'faux',
      newPassword: 'nouveau secret solide',
    })
    expect(wrong.statusCode).toBe(403)
    const res = await alice.request('POST', '/api/v1/auth/password/change', {
      currentPassword: PASSWORD,
      newPassword: 'nouveau secret solide',
    })
    expect(res.statusCode).toBe(204)
    expect((await alice.request('GET', '/api/v1/session')).json()).toMatchObject({
      user: { username: 'alice' },
    })
    expect((await otherDevice.request('GET', '/api/v1/session')).json()).toEqual({
      user: null,
      csrfToken: null,
    })
  })

  it('change l’e-mail seulement après confirmation de la nouvelle adresse (AUTH-08)', async () => {
    const alice = await registeredAccount()
    await alice.request('POST', '/api/v1/auth/email/change', {
      password: PASSWORD,
      newEmail: 'alice@new.example',
    })
    expect((await ctx.db.user.findFirstOrThrow({ where: { username: 'alice' } })).email).toBe(
      'alice@example.com',
    )
    expect(ctx.mailer.sent.at(-1)?.to).toBe('alice@new.example')
    await alice.request('POST', '/api/v1/auth/verify-email', { token: lastToken() })
    expect((await ctx.db.user.findFirstOrThrow({ where: { username: 'alice' } })).email).toBe(
      'alice@new.example',
    )
    expect(ctx.mailer.sent.at(-1)?.to).toBe('alice@example.com')
  })

  it('liste et révoque ses propres sessions, mais pas celles d’un autre (AUTHZ-02)', async () => {
    const alice = await registeredAccount()
    const bob = await registeredAccount('bob@example.com', 'bob')
    const aliceSessions = (await alice.request('GET', '/api/v1/auth/sessions')).json<{
      items: { id: string; current: boolean }[]
    }>()
    expect(aliceSessions.items).toHaveLength(1)
    expect(aliceSessions.items[0]?.current).toBe(true)
    const aliceSessionId = aliceSessions.items[0]?.id ?? ''

    expect(
      (await bob.request('DELETE', `/api/v1/auth/sessions/${aliceSessionId}`)).statusCode,
    ).toBe(404)
    expect((await alice.request('GET', '/api/v1/session')).json()).toMatchObject({
      user: { username: 'alice' },
    })
  })

  it('les invités ne peuvent pas utiliser les actions réservées aux comptes', async () => {
    const guest = await new Client(ctx.app).guest()
    const res = await guest.request('POST', '/api/v1/auth/password/change', {
      currentPassword: 'x',
      newPassword: 'nouveau secret solide',
    })
    expect(res.statusCode).toBe(403)
  })

  it('supprime le compte et ses données après vérification du mot de passe', async () => {
    const alice = await registeredAccount()
    expect(
      (await alice.request('DELETE', '/api/v1/auth/account', { password: 'faux' })).statusCode,
    ).toBe(403)
    expect(
      (await alice.request('DELETE', '/api/v1/auth/account', { password: PASSWORD })).statusCode,
    ).toBe(204)
    expect(await ctx.db.user.count({ where: { username: 'alice' } })).toBe(0)
    expect(await ctx.db.session.count()).toBe(0)
  })
})

describe('journaux (LOG-01)', () => {
  it('les e-mails sont les seuls à contenir le jeton ; il n’apparaît dans aucune réponse', async () => {
    const client = await new Client(ctx.app).guest()
    const res = await client.request('POST', '/api/v1/auth/register', {
      email: 'a@example.com',
      username: 'aa1',
      password: PASSWORD,
    })
    expect(res.body).not.toContain(lastToken())
  })
})
