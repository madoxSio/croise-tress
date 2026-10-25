import { buildWordSearch, lineCells, parsePuzzle } from '@crossverse/crossword-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_PUZZLES } from '../prisma/seed/catalog-puzzles.ts'
import { CLASSIC_PUZZLES } from '../prisma/seed/classic-puzzles.ts'
import { SEED_PUZZLES } from '../prisma/seed/puzzles.ts'
import { directionsFor } from '../src/modules/wordsearch/service.ts'
import {
  Client,
  createTestContext,
  resetDatabase,
  seedPuzzles,
  type TestContext,
} from './helpers.ts'

interface WordSearchBody {
  seed: number
  size: number
  rows: string[]
  directions: { diagonals: boolean; reversed: boolean }
  clues: { direction: string; number: number; text: string; length: number }[]
}
interface Hit {
  direction: string
  number: number
  answer: string
  start: { row: number; col: number }
  end: { row: number; col: number }
}

let ctx: TestContext
let ids: Record<string, string>
beforeAll(async () => {
  ctx = await createTestContext()
})
afterAll(async () => {
  await ctx.app.close()
  await ctx.db.$disconnect()
})
beforeEach(async () => {
  await resetDatabase(ctx.db)
  ids = await seedPuzzles(ctx.db)
})

const url = (slug: string, suffix = ''): string =>
  `/api/v1/puzzles/${ids[slug] ?? ''}/word-search${suffix}`

describe('grilles du catalogue', () => {
  it('toutes les grilles (démonstration, catalogue, classiques) se convertissent en grille pré-remplie', () => {
    for (const source of [...SEED_PUZZLES, ...CATALOG_PUZZLES, ...CLASSIC_PUZZLES]) {
      const parsed = parsePuzzle({
        id: source.slug,
        title: source.title,
        grid: source.grid,
        clues: source.clues,
      })
      if (!parsed.ok) throw new Error(`grille ${source.slug} invalide`)
      for (let seed = 0; seed < 5; seed++) {
        const search = buildWordSearch(parsed.value, { seed, ...directionsFor(source.difficulty) })
        expect(search.placements).toHaveLength(parsed.value.clues.length)
      }
    }
  })
})

describe('grille pré-remplie', () => {
  it('exige une session (invité compris)', async () => {
    const res = await new Client(ctx.app).request('GET', url('la-table'))
    expect(res.statusCode).toBe(401)
  })

  it('renvoie la grille et les définitions, jamais l’emplacement des réponses', async () => {
    const client = await new Client(ctx.app).guest()
    const res = await client.request('GET', url('la-table'))
    expect(res.statusCode).toBe(200)
    const body = res.json<WordSearchBody>()
    expect(body.rows).toHaveLength(body.size)
    expect(body.clues.length).toBeGreaterThan(0)
    expect(res.body).not.toMatch(/placements|answer|solution|explanation/)
    // Même graine, même grille : la disposition peut être restaurée après un rechargement.
    const again = await client.request('GET', url('la-table', `?seed=${String(body.seed)}`))
    expect(again.json<WordSearchBody>().rows).toEqual(body.rows)
  })

  it('indique le type de grille et la première case de chaque mot (repères « Ligne IV »)', async () => {
    await ctx.db.puzzle.update({ where: { slug: 'la-table' }, data: { format: 'classic' } })
    const client = await new Client(ctx.app).guest()
    const body = (await client.request('GET', url('la-table'))).json<
      WordSearchBody & { format: string; clues: { row: number; col: number }[] }
    >()
    expect(body.format).toBe('classic')
    const source = SEED_PUZZLES.find((p) => p.slug === 'la-table')
    const parsed = parsePuzzle({
      id: 'x',
      title: 'x',
      grid: source?.grid ?? [],
      clues: source?.clues ?? [],
    })
    if (!parsed.ok) throw new Error('grille la-table invalide')
    expect(body.clues.map(({ row, col }) => ({ row, col }))).toEqual(
      parsed.value.clues.map((clue) => clue.slot.start),
    )
  })

  it('valide un mot surligné, dans un sens comme dans l’autre, et refuse le reste', async () => {
    const client = await new Client(ctx.app).guest()
    const { seed } = (
      await client.request('GET', url('la-table', '?seed=11'))
    ).json<WordSearchBody>()
    const revealed = await client.request('POST', url('la-table', '/reveal'), {
      seed,
      direction: 'across',
      number: 4,
    })
    expect(revealed.statusCode).toBe(200)
    const balle = revealed.json<Hit>()
    expect(balle.answer).toBe('BALLE')

    const forward = await client.request('POST', url('la-table', '/check'), {
      seed,
      from: balle.start,
      to: balle.end,
    })
    expect(forward.json<{ hit: Hit | null }>().hit).toMatchObject({
      direction: 'across',
      number: 4,
    })
    const backward = await client.request('POST', url('la-table', '/check'), {
      seed,
      from: balle.end,
      to: balle.start,
    })
    expect(backward.json<{ hit: Hit | null }>().hit?.answer).toBe('BALLE')

    const miss = await client.request('POST', url('la-table', '/check'), {
      seed,
      from: { row: 0, col: 0 },
      to: { row: 0, col: 0 },
    })
    expect(miss.json<{ hit: Hit | null }>().hit).toBeNull()
  })

  it('le tracé renvoyé correspond aux lettres de la grille', async () => {
    const client = await new Client(ctx.app).guest()
    const body = (await client.request('GET', url('la-table', '?seed=5'))).json<WordSearchBody>()
    for (const clue of body.clues) {
      const hit = (
        await client.request('POST', url('la-table', '/reveal'), {
          seed: body.seed,
          direction: clue.direction,
          number: clue.number,
        })
      ).json<Hit>()
      const letters = (lineCells(hit.start, hit.end) ?? [])
        .map(({ row, col }) => body.rows[row]?.[col] ?? '')
        .join('')
      expect(letters).toBe(hit.answer)
      expect(hit.answer).toHaveLength(clue.length)
    }
  })

  it('refuse les entrées invalides (VAL-01) et les grilles inconnues', async () => {
    const client = await new Client(ctx.app).guest()
    const bad = await client.request('POST', url('la-table', '/check'), {
      seed: 1,
      from: { row: 0, col: 0 },
      to: { row: 99, col: 0 },
    })
    expect(bad.statusCode).toBe(400)
    const extra = await client.request('POST', url('la-table', '/check'), {
      seed: 1,
      from: { row: 0, col: 0 },
      to: { row: 0, col: 1 },
      admin: true,
    })
    expect(extra.statusCode).toBe(400)
    expect((await client.request('GET', url('la-table', '?seed=-3'))).statusCode).toBe(400)
    const unknown = await client.request(
      'GET',
      '/api/v1/puzzles/00000000-0000-4000-8000-000000000000/word-search',
    )
    expect(unknown.statusCode).toBe(404)
  })

  it('respecte le verrouillage des étapes de parcours (AUTHZ)', async () => {
    await ctx.db.path.create({
      data: {
        slug: 'culture-rois',
        title: 'Rois et empires',
        description: 'Parcours de test',
        theme: { connect: { slug: 'rois-de-france' } },
        status: 'published',
        steps: {
          create: ['la-table', 'le-salon'].map((slug, index) => ({
            position: index + 1,
            title: `Étape ${String(index + 1)}`,
            puzzleId: ids[slug] ?? '',
          })),
        },
      },
    })
    const guest = await new Client(ctx.app).guest()
    expect((await guest.request('GET', url('la-table'))).statusCode).toBe(200)
    const locked = await guest.request('GET', url('le-salon'))
    expect(locked.statusCode).toBe(403)
    expect(locked.json()).toMatchObject({ error: { code: 'step_locked' } })
    const reveal = await guest.request('POST', url('le-salon', '/reveal'), {
      seed: 1,
      direction: 'across',
      number: 1,
    })
    expect(reveal.statusCode).toBe(403)
  })
})
