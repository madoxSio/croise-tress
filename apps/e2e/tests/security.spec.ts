import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { allSeedAnswers, SEED_PUZZLES } from '../support/puzzles.ts'

/** Pages publiques principales (un invité y a accès). */
const MAIN_PAGES = [
  '/',
  '/puzzles',
  '/duel',
  '/history',
  '/preferences',
  '/leaderboard',
  '/login',
  '/register',
  '/forgot-password',
] as const

test('SOL-02 : le JavaScript servi ne contient aucune réponse des grilles', async ({ page }) => {
  const scripts = new Map<string, Promise<string>>()
  page.on('response', (response) => {
    const type = response.headers()['content-type'] ?? ''
    if (response.request().resourceType() === 'script' || type.includes('javascript')) {
      scripts.set(
        response.url(),
        response.text().catch(() => ''),
      )
    }
  })
  // Toutes les routes, y compris une partie et un duel, pour charger chaque morceau du bundle.
  for (const path of MAIN_PAGES) {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
  }
  await page.goto('/')
  await page.getByRole('link', { name: 'Jouer le défi' }).click()
  await expect(page.getByRole('grid')).toBeVisible()

  const bodies = await Promise.all(scripts.values())
  expect(bodies.length).toBeGreaterThan(0)
  const bundle = bodies.join('\n')
  // Réponses en majuscules, mot entier (les gabarits contiennent « table » en minuscules).
  const leaked = allSeedAnswers().filter((answer) => new RegExp(`\\b${answer}\\b`).test(bundle))
  expect(leaked, 'réponses présentes dans le JavaScript servi').toEqual([])
  // Lignes de grille complètes (ex. « A#A#L ») : la structure avec les lettres.
  const rows = SEED_PUZZLES.flatMap((p) => p.grid.filter((row) => row.includes('#')))
  expect(rows.filter((row) => bundle.includes(row))).toEqual([])
})

/** Build statique (`pnpm --filter @crossverse/web build`), s'il existe sur cette machine. */
const BUILD_DIR = join(import.meta.dirname, '../../web/.output/public')

function jsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(entry.parentPath, entry.name))
}

test('SOL-02 : le build statique ne contient aucune réponse des grilles', () => {
  test.skip(!existsSync(BUILD_DIR), 'pas de build web local (apps/web/.output/public)')
  const files = jsFiles(BUILD_DIR)
  expect(files.length).toBeGreaterThan(0)
  const bundle = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  const leaked = allSeedAnswers().filter((answer) => new RegExp(`\\b${answer}\\b`).test(bundle))
  expect(leaked, 'réponses présentes dans le build').toEqual([])
})

test('duel : un invité voit l’avis « compte nécessaire »', async ({ page }) => {
  await page.goto('/duel')
  const notice = page.getByRole('alert').filter({ hasText: 'Un compte est nécessaire' })
  await expect(notice).toBeVisible({ timeout: 15_000 })
  await expect(notice.getByRole('link', { name: 'Se connecter' })).toBeVisible()
  await expect(notice.getByRole('link', { name: 'Créer un compte' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trouver un adversaire' })).toHaveCount(0)
})

test('pas de défilement horizontal à 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const overflowing: string[] = []
  for (const path of MAIN_PAGES) {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    if (scroll > client) overflowing.push(`${path} (${scroll} > ${client})`)
  }
  await page.goto('/')
  await page.getByRole('link', { name: 'Jouer le défi' }).click()
  await expect(page.getByRole('grid')).toBeVisible()
  const play = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (play > 0) overflowing.push(`/play (${play} px)`)
  expect(overflowing).toEqual([])
})
