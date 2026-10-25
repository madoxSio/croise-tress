import { catalogSchema, puzzleListSchema, quickPlaySchema } from '@crossverse/contracts'
import { parsePuzzle } from '@crossverse/crossword-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_PUZZLES } from '../prisma/seed/catalog-puzzles.ts'
import { CLASSIC_PUZZLES, classicPuzzle } from '../prisma/seed/classic-puzzles.ts'
import { SEED_PUZZLES } from '../prisma/seed/puzzles.ts'
import { syncCatalog } from '../prisma/seed/sync.ts'
import { SEED_THEMES } from '../prisma/seed/themes.ts'
import { createAccount } from '../src/modules/admin/accounts.ts'
import {
  Client,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  type TestContext,
} from './helpers.ts'

const ALL_PUZZLES = [...SEED_PUZZLES, ...CATALOG_PUZZLES, ...CLASSIC_PUZZLES]

describe('contenu éditorial du catalogue', () => {
  it('les mots croisés classiques sont denses et rangés ligne par ligne', () => {
    expect(CLASSIC_PUZZLES.length).toBeGreaterThanOrEqual(6)
    for (const seed of CLASSIC_PUZZLES) {
      expect(seed.format, seed.slug).toBe('classic')
      const cells = seed.grid.join('')
      const blocks = cells.replaceAll(/[^#]/g, '').length
      // Grille « de journal » : au plus un quart de cases noires (les grilles en croix en ont plus).
      expect(blocks / cells.length, seed.slug).toBeLessThanOrEqual(0.25)
    }
    expect(new Set(CLASSIC_PUZZLES.map((p) => p.difficulty))).toEqual(
      new Set(['easy', 'intermediate', 'hard']),
    )
  })

  it('classicPuzzle refuse une ligne dont le nombre de définitions ne correspond pas', () => {
    expect(() =>
      classicPuzzle({
        slug: 'decalee',
        title: 'Décalée',
        theme: 'mots-croises',
        difficulty: 'easy',
        estimatedMinutes: 1,
        grid: ['ET#', 'TA#', '###'],
        across: [['Conjonction', 'En trop'], ['Possessif'], []],
        down: [['Saison'], ['Article'], []],
      }),
    ).toThrow(/2 définition/)
  })

  it('chaque grille est valide pour le moteur et rangée dans un thème connu', () => {
    const slugs = new Set(SEED_THEMES.map((theme) => theme.slug))
    for (const seed of ALL_PUZZLES) {
      const parsed = parsePuzzle({
        id: seed.slug,
        title: seed.title,
        grid: seed.grid,
        clues: seed.clues,
      })
      expect(parsed.ok, seed.slug).toBe(true)
      expect(slugs.has(seed.theme), `${seed.slug} → ${seed.theme}`).toBe(true)
      for (const clue of seed.clues) expect(clue.text.trim(), seed.slug).not.toBe('')
    }
  })

  it('slugs uniques, deux niveaux de thèmes au plus, parents déclarés avant leurs enfants', () => {
    expect(new Set(ALL_PUZZLES.map((p) => p.slug)).size).toBe(ALL_PUZZLES.length)
    expect(new Set(SEED_THEMES.map((t) => t.slug)).size).toBe(SEED_THEMES.length)
    const seen = new Map<string, string | undefined>()
    for (const theme of SEED_THEMES) {
      if (theme.parent !== undefined) {
        expect(seen.has(theme.parent), theme.slug).toBe(true)
        expect(seen.get(theme.parent), `${theme.slug} : petit-enfant interdit`).toBeUndefined()
      }
      seen.set(theme.slug, theme.parent)
    }
  })

  it('couvre chaque thème et les trois niveaux simple / intermédiaire / compliqué', () => {
    const levels = new Set(CATALOG_PUZZLES.map((p) => p.difficulty))
    expect([...levels].sort()).toEqual(['easy', 'hard', 'intermediate'])
    const parentOf = new Map(SEED_THEMES.map((t) => [t.slug, t.parent ?? t.slug]))
    const covered = new Set(ALL_PUZZLES.map((p) => parentOf.get(p.theme)))
    for (const root of SEED_THEMES.filter((t) => t.parent === undefined)) {
      expect(covered.has(root.slug), root.slug).toBe(true)
    }
  })
})

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
})

describe('chargement du catalogue (syncCatalog)', () => {
  it('insère thèmes et grilles une seule fois, sans écraser une modification', async () => {
    const first = await syncCatalog(ctx.db, SEED_THEMES, ALL_PUZZLES)
    expect(first).toEqual({
      themesCreated: SEED_THEMES.length,
      puzzlesCreated: ALL_PUZZLES.length,
      puzzlesReclassified: 0,
    })
    await ctx.db.puzzle.update({ where: { slug: 'les-bleus' }, data: { title: 'Retouché' } })

    const second = await syncCatalog(ctx.db, SEED_THEMES, ALL_PUZZLES)
    expect(second).toEqual({ themesCreated: 0, puzzlesCreated: 0, puzzlesReclassified: 0 })
    const kept = await ctx.db.puzzle.findUniqueOrThrow({ where: { slug: 'les-bleus' } })
    expect(kept.title).toBe('Retouché')
    expect(await ctx.db.puzzle.count({ where: { status: 'published' } })).toBe(ALL_PUZZLES.length)
  })

  it('reclasse une grille restée dans un sous-thème « Divers » issu de la migration', async () => {
    const divers = await ctx.db.theme.create({ data: { slug: 'divers', name: 'Divers' } })
    const legacy = await ctx.db.theme.create({
      data: { slug: 'divers-1f2e0146', name: 'maison', parentId: divers.id },
    })
    const seed = SEED_PUZZLES[0]
    if (!seed) throw new Error('seed vide')
    await ctx.db.puzzle.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        themeId: legacy.id,
        difficulty: seed.difficulty,
        status: 'published',
        width: 5,
        height: 5,
        grid: [...seed.grid],
        clues: seed.clues.map((clue) => ({ ...clue })),
        estimatedMinutes: seed.estimatedMinutes,
      },
    })
    const report = await syncCatalog(ctx.db, SEED_THEMES, [seed])
    expect(report.puzzlesReclassified).toBe(1)
    const moved = await ctx.db.puzzle.findUniqueOrThrow({
      where: { slug: seed.slug },
      select: { theme: { select: { slug: true } } },
    })
    expect(moved.theme.slug).toBe(seed.theme)
  })

  it('refuse une grille invalide ou un thème inconnu', async () => {
    const seed = SEED_PUZZLES[0]
    if (!seed) throw new Error('seed vide')
    await expect(
      syncCatalog(ctx.db, SEED_THEMES, [{ ...seed, grid: ['AB', 'CD'] }]),
    ).rejects.toThrow(/invalide/)
    await expect(syncCatalog(ctx.db, SEED_THEMES, [{ ...seed, theme: 'inconnu' }])).rejects.toThrow(
      /inconnu/,
    )
  })
})

describe('GET /catalog', () => {
  it('renvoie l’arbre des thèmes publiés avec les comptes par niveau et le style hérité', async () => {
    await seedPuzzles(ctx.db)
    const res = await new Client(ctx.app).request('GET', '/api/v1/catalog')
    expect(res.statusCode).toBe(200)
    const catalog = catalogSchema.parse(res.json())
    // Seules les grilles de découverte sont publiées : un seul thème, les autres sont masqués.
    expect(catalog.themes.map((t) => t.slug)).toEqual(['vie-quotidienne'])
    const [root] = catalog.themes
    expect(root?.puzzleCount).toBe(6)
    expect(root?.counts).toEqual({ discovery: 2, easy: 3, intermediate: 1, hard: 0, expert: 0 })
    expect(root?.children.map((c) => [c.slug, c.puzzleCount])).toEqual([
      ['maison', 2],
      ['nature', 2],
      ['voyages', 2],
    ])
    expect(root?.children[0]).toMatchObject({
      icon: '🛋️',
      skin: 'nature',
      accent: root?.accent,
      accentAlt: root?.accentAlt,
    })
  })

  it('ignore les brouillons et ordonne les thèmes de façon éditoriale', async () => {
    await syncCatalog(ctx.db, SEED_THEMES, ALL_PUZZLES)
    await ctx.db.puzzle.updateMany({
      where: { theme: { slug: 'naruto' } },
      data: { status: 'draft' },
    })
    const catalog = catalogSchema.parse(
      (await new Client(ctx.app).request('GET', '/api/v1/catalog')).json(),
    )
    expect(catalog.themes.map((t) => t.slug)).toEqual([
      'culture',
      'histoire',
      'football',
      'manga',
      'art',
      'musique',
      'vie-quotidienne',
    ])
    const manga = catalog.themes.find((t) => t.slug === 'manga')
    expect(manga?.children.map((c) => c.slug)).toEqual(['one-piece', 'dragon-ball'])
    const football = catalog.themes.find((t) => t.slug === 'football')
    expect(football?.children.find((c) => c.slug === 'ligue-des-champions')?.skin).toBe('champions')
  })
})

describe('GET /puzzles par thème', () => {
  beforeEach(async () => {
    await syncCatalog(ctx.db, SEED_THEMES, ALL_PUZZLES)
  })

  it('un thème inclut ses sous-thèmes ; un sous-thème se filtre seul', async () => {
    const client = new Client(ctx.app)
    const manga = puzzleListSchema.parse(
      (await client.request('GET', '/api/v1/puzzles?theme=manga&limit=50')).json(),
    )
    expect(manga.items.length).toBe(
      CATALOG_PUZZLES.filter((p) => ['naruto', 'one-piece', 'dragon-ball'].includes(p.theme))
        .length,
    )
    expect(new Set(manga.items.map((p) => p.parentThemeSlug))).toEqual(new Set(['manga']))
    expect(new Set(manga.items.map((p) => p.skin))).toEqual(new Set(['manga']))

    const naruto = puzzleListSchema.parse(
      (await client.request('GET', '/api/v1/puzzles?theme=naruto&difficulty=hard')).json(),
    )
    expect(naruto.items.map((p) => [p.slug, p.theme, p.themeSlug])).toEqual([
      ['naruto-techniques-et-clans', 'Naruto', 'naruto'],
    ])
  })

  it('filtre par type de grille : mots croisés classiques ou grilles en croix', async () => {
    const client = new Client(ctx.app)
    const classic = puzzleListSchema.parse(
      (await client.request('GET', '/api/v1/puzzles?format=classic&limit=50')).json(),
    )
    expect(classic.items.map((p) => p.slug).sort()).toEqual(
      CLASSIC_PUZZLES.map((p) => p.slug).sort(),
    )
    expect(new Set(classic.items.map((p) => p.format))).toEqual(new Set(['classic']))

    const freeform = puzzleListSchema.parse(
      (
        await client.request('GET', '/api/v1/puzzles?format=freeform&theme=culture&limit=50')
      ).json(),
    )
    expect(freeform.items.length).toBeGreaterThan(0)
    expect(new Set(freeform.items.map((p) => p.format))).toEqual(new Set(['freeform']))
    expect((await client.request('GET', '/api/v1/puzzles?format=fleche')).statusCode).toBe(400)
  })

  it('un slug inconnu renvoie une liste vide', async () => {
    const res = await new Client(ctx.app).request('GET', '/api/v1/puzzles?theme=inconnu')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [], nextCursor: null })
  })

  it('le puzzle public porte son thème et son habillage, jamais la solution', async () => {
    const row = await ctx.db.puzzle.findUniqueOrThrow({
      where: { slug: 'nuits-de-ligue-des-champions' },
    })
    const res = await new Client(ctx.app).request('GET', `/api/v1/puzzles/${row.id}`)
    expect(res.json()).toMatchObject({
      theme: 'Ligue des champions',
      themeSlug: 'ligue-des-champions',
      parentThemeSlug: 'football',
      skin: 'champions',
    })
    expect(res.body).not.toMatch(/MARSEILLE|ISTANBUL/)
  })
})

describe('GET /quick-play', () => {
  beforeEach(async () => {
    await syncCatalog(ctx.db, SEED_THEMES, ALL_PUZZLES)
  })

  it('propose une grille simple publiée, sans compte', async () => {
    const client = new Client(ctx.app)
    for (let i = 0; i < 5; i++) {
      const res = await client.request('GET', '/api/v1/quick-play')
      expect(res.statusCode).toBe(200)
      const { puzzle } = quickPlaySchema.parse(res.json())
      expect(['discovery', 'easy']).toContain(puzzle.difficulty)
    }
  })

  it('reste dans le thème demandé, et se rabat sur un autre niveau s’il n’y a pas de grille simple', async () => {
    const client = new Client(ctx.app)
    const football = quickPlaySchema.parse(
      (await client.request('GET', '/api/v1/quick-play?theme=football')).json(),
    )
    expect(football.puzzle.parentThemeSlug).toBe('football')
    expect(football.puzzle.difficulty).toBe('easy')

    const dragonBall = quickPlaySchema.parse(
      (await client.request('GET', '/api/v1/quick-play?theme=dragon-ball')).json(),
    )
    expect(dragonBall.puzzle.slug).toBe('dragon-ball-guerriers-z')
  })

  it('respecte le type de grille demandé', async () => {
    const client = new Client(ctx.app)
    for (let i = 0; i < 3; i++) {
      const { puzzle } = quickPlaySchema.parse(
        (await client.request('GET', '/api/v1/quick-play?format=classic')).json(),
      )
      expect(puzzle.format).toBe('classic')
      expect(['discovery', 'easy']).toContain(puzzle.difficulty)
    }
    const football = await client.request('GET', '/api/v1/quick-play?theme=football&format=classic')
    expect(football.statusCode).toBe(404)
  })

  it('404 pour un thème sans grille, 400 pour un slug mal formé', async () => {
    const client = new Client(ctx.app)
    expect((await client.request('GET', '/api/v1/quick-play?theme=inconnu')).statusCode).toBe(404)
    expect((await client.request('GET', '/api/v1/quick-play?theme=A%20B')).statusCode).toBe(400)
    expect((await client.request('GET', '/api/v1/quick-play?foo=1')).statusCode).toBe(400)
  })
})

describe('administration des thèmes', () => {
  const PASSWORD = 'correct horse battery staple'

  async function login(email: string, admin: boolean): Promise<Client> {
    await createAccount(ctx.db, {
      email,
      username: email.split('@')[0] ?? 'x',
      password: PASSWORD,
      admin,
    })
    const client = await new Client(ctx.app).guest()
    const res = await client.request('POST', '/api/v1/auth/login', { email, password: PASSWORD })
    expect(res.statusCode).toBe(200)
    return client
  }

  beforeEach(async () => {
    await seedPuzzles(ctx.db)
  })

  it('crée un thème et un sous-thème, refuse un troisième niveau', async () => {
    const admin = await login('admin@example.com', true)
    const root = await admin.request('POST', '/api/v1/admin/themes', {
      slug: 'cuisine',
      name: 'Cuisine',
      skin: 'cuisine',
      icon: '🍳',
      accent: '#ff7a00',
      accentAlt: '#FFC300',
    })
    expect(root.statusCode).toBe(201)
    expect(root.json()).toMatchObject({ slug: 'cuisine', parentSlug: null, accent: '#FF7A00' })

    const child = await admin.request('POST', '/api/v1/admin/themes', {
      slug: 'patisserie',
      name: 'Pâtisserie',
      parentSlug: 'cuisine',
    })
    expect(child.statusCode).toBe(201)
    expect(child.json()).toMatchObject({ parentSlug: 'cuisine', skin: null, puzzleCount: 0 })

    const grandChild = await admin.request('POST', '/api/v1/admin/themes', {
      slug: 'macarons',
      name: 'Macarons',
      parentSlug: 'patisserie',
    })
    expect(grandChild.statusCode).toBe(409)
    expect(
      (await admin.request('POST', '/api/v1/admin/themes', { slug: 'cuisine', name: 'Doublon' }))
        .statusCode,
    ).toBe(409)

    // Un thème qui a des enfants ne peut pas devenir un sous-thème.
    const rootId = root.json<{ id: string }>().id
    const moved = await admin.request('PUT', `/api/v1/admin/themes/${rootId}`, {
      slug: 'cuisine',
      name: 'Cuisine',
      parentSlug: 'vie-quotidienne',
    })
    expect(moved.statusCode).toBe(409)

    const list = await admin.request('GET', '/api/v1/admin/themes')
    const slugs = list.json<{ items: { slug: string }[] }>().items.map((t) => t.slug)
    expect(slugs.indexOf('patisserie')).toBe(slugs.indexOf('cuisine') + 1)
    const audit = await ctx.db.auditLog.findMany({ where: { action: 'theme.create' } })
    expect(audit.map((a) => a.target).sort()).toEqual(['cuisine', 'patisserie'])
  })

  it('une grille doit référencer un thème existant', async () => {
    const admin = await login('admin@example.com', true)
    const seed = SEED_PUZZLES[0]
    if (!seed) throw new Error('seed vide')
    const body = {
      slug: 'nouvelle-grille',
      title: 'Nouvelle',
      themeSlug: 'inexistant',
      difficulty: 'easy',
      estimatedMinutes: 3,
      grid: seed.grid,
      clues: seed.clues,
    }
    expect((await admin.request('POST', '/api/v1/admin/puzzles', body)).statusCode).toBe(400)
    const created = await admin.request('POST', '/api/v1/admin/puzzles', {
      ...body,
      themeSlug: 'maison',
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ theme: 'Maison', themeSlug: 'maison', status: 'draft' })
  })

  it('reste invisible pour un joueur (404) et rejette les champs inconnus', async () => {
    const player = await login('bob@example.com', false)
    expect((await player.request('GET', '/api/v1/admin/themes')).statusCode).toBe(404)
    expect(
      (await player.request('POST', '/api/v1/admin/themes', { slug: 'x-y', name: 'X' })).statusCode,
    ).toBe(404)
    const admin = await login('admin@example.com', true)
    expect(
      (
        await admin.request('POST', '/api/v1/admin/themes', {
          slug: 'zz',
          name: 'Z',
          id: '01900000-0000-7000-8000-000000000000',
        })
      ).statusCode,
    ).toBe(400)
  })
})
