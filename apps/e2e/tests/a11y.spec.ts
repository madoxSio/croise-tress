import { expect, test } from '@playwright/test'

const PAGES = [
  '/',
  '/puzzles',
  '/duel',
  '/history',
  '/preferences',
  '/leaderboard',
  '/login',
  '/register',
  '/forgot-password',
  '/comment-jouer',
  '/mots-meles',
] as const

test('accessibilité : un seul h1, un seul main, lang="fr" sur chaque page principale', async ({
  page,
}) => {
  for (const path of PAGES) {
    await page.goto(path)
    await expect(page.locator('h1'), `h1 de ${path}`).toHaveCount(1)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('main'), `main de ${path}`).toHaveCount(1)
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  }
})
