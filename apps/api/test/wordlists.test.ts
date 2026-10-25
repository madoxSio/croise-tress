import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SEED_THEMES } from '../prisma/seed/themes.ts'
import { syncCatalog } from '../prisma/seed/sync.ts'
import {
  SEED_WORD_LISTS,
  syncWordLists,
  wordListProblems,
  type SeedWordList,
} from '../prisma/seed/word-lists.ts'
import { Client, createTestContext, resetDatabase, type TestContext } from './helpers.ts'

interface Summary {
  id: string
  slug: string
  difficulty: string
  themeSlug: string
  size: number
  wordCount: number
}
interface Detail extends Summary {
  rows: string[]
  words: string[]
  directions: { diagonals: boolean; reversed: boolean }
  mysteryLength: number
  mysteryClue: string
}

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
  await syncCatalog(ctx.db, SEED_THEMES, [])
  await syncWordLists(ctx.db, SEED_WORD_LISTS)
})

function seedWhere(predicate: (seed: SeedWordList) => boolean): SeedWordList {
  const found = SEED_WORD_LISTS.find(predicate)
  if (!found) throw new Error('grille de mots mêlés introuvable dans le seed')
  return found
}

const list = async (query = ''): Promise<{ items: Summary[]; nextCursor: string | null }> =>
  (await new Client(ctx.app).request('GET', `/api/v1/word-lists${query}`)).json()

describe('grilles de mots mêlés du catalogue', () => {
  it('sont toutes valides : chaque mot une seule fois, lettres restantes = mot mystère', () => {
    expect(SEED_WORD_LISTS.length).toBeGreaterThanOrEqual(8)
    for (const seed of SEED_WORD_LISTS) expect(wordListProblems(seed), seed.slug).toEqual([])
  })

  it('refusent au chargement une grille dont le mot mystère ne correspond pas', async () => {
    const first = seedWhere(() => true)
    const broken = { ...first, slug: 'cassee', mystery: 'FAUX' }
    await expect(syncWordLists(ctx.db, [broken])).rejects.toThrow(/cassee.*Lettres restantes/)
  })

  it('ne réécrivent jamais une grille existante (synchronisation idempotente)', async () => {
    expect(await syncWordLists(ctx.db, SEED_WORD_LISTS)).toBe(0)
  })
})

describe('GET /word-lists', () => {
  it('liste les grilles publiées, avec pagination et filtres', async () => {
    const all = await list('?limit=50')
    expect(all.items).toHaveLength(SEED_WORD_LISTS.length)
    const page = await list('?limit=3')
    expect(page.items).toHaveLength(3)
    const next = await list(`?limit=50&cursor=${page.nextCursor ?? ''}`)
    expect(next.items).toHaveLength(SEED_WORD_LISTS.length - 3)

    const easy = await list('?difficulty=easy')
    expect(easy.items.length).toBeGreaterThan(0)
    expect(easy.items.every((item) => item.difficulty === 'easy')).toBe(true)
    const football = await list('?theme=football')
    expect(football.items.map((item) => item.themeSlug)).toEqual(['football'])
    expect((await list('?theme=inconnu')).items).toEqual([])
  })

  it('ignore les grilles en brouillon et rejette les paramètres inconnus', async () => {
    await ctx.db.wordList.updateMany({ where: { difficulty: 'easy' }, data: { status: 'draft' } })
    expect((await list('?difficulty=easy')).items).toEqual([])
    const bad = await new Client(ctx.app).request('GET', '/api/v1/word-lists?admin=1')
    expect(bad.statusCode).toBe(400)
  })
})

describe('GET /word-lists/:id', () => {
  it('renvoie la grille et les mots triés, sans le mot mystère', async () => {
    const seed = seedWhere((s) => s.difficulty === 'hard')
    const row = await ctx.db.wordList.findUniqueOrThrow({ where: { slug: seed.slug } })
    const res = await new Client(ctx.app).request('GET', `/api/v1/word-lists/${row.id}`)
    expect(res.statusCode).toBe(200)
    const body = res.json<Detail>()
    expect(body.rows).toEqual(seed.rows)
    expect(body.words).toEqual([...seed.words].sort((a, b) => a.localeCompare(b, 'fr')))
    expect(body.directions).toEqual({ diagonals: true, reversed: true })
    expect(body.mysteryLength).toBe(seed.mystery.length)
    expect(body.mysteryClue).toBe(seed.mysteryClue)
    expect(res.body).not.toContain(`"${seed.mystery}"`)
    expect(res.body).not.toMatch(/"mystery"/)
  })

  it('répond 404 pour une grille inconnue ou en brouillon, 400 pour un identifiant invalide', async () => {
    const client = new Client(ctx.app)
    const row = await ctx.db.wordList.findFirstOrThrow({ select: { id: true } })
    await ctx.db.wordList.update({ where: { id: row.id }, data: { status: 'draft' } })
    expect((await client.request('GET', `/api/v1/word-lists/${row.id}`)).statusCode).toBe(404)
    const unknown = '00000000-0000-4000-8000-000000000000'
    expect((await client.request('GET', `/api/v1/word-lists/${unknown}`)).statusCode).toBe(404)
    expect((await client.request('GET', '/api/v1/word-lists/abc')).statusCode).toBe(400)
  })
})
