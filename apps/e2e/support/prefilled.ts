/**
 * Partie en grille pré-remplie, jouée à la suite du parcours solo dans le même contexte : elle
 * réutilise la session invitée déjà ouverte. Les sessions invitées sont limitées à 30 par heure
 * et par IP, et tous les E2E passent par la même IP : un test de plus en créerait une de plus.
 */
import { expect, type Page } from '@playwright/test'

interface Hit {
  answer: string
  start: { row: number; col: number }
  end: { row: number; col: number }
}

/**
 * Emplacements des deux premiers mots, demandés à l'API comme le ferait « Où est-il ? » (sans
 * toucher l'écran). Un seul aller-retour groupé : la suite entière frôle la limite globale de
 * 300 requêtes par minute et par IP, chaque requête évitée compte.
 */
async function locateFirstTwo(page: Page, puzzleId: string): Promise<[Hit, Hit]> {
  const labels = await page
    .getByRole('button', { name: /^Où est le mot/ })
    .evaluateAll((buttons) => buttons.slice(0, 2).map((b) => b.getAttribute('aria-label') ?? ''))
  const clues = labels.map((label) => {
    const [, number, way] = /(\d+) (horizontal|vertical)/.exec(label) ?? []
    return { number: Number(number), direction: way === 'horizontal' ? 'across' : 'down' }
  })
  return page.evaluate(
    async ({ puzzleId, clues }) => {
      const session = (await (await fetch('/api/v1/session')).json()) as { csrfToken: string }
      const saved = JSON.parse(
        localStorage.getItem(`crossverse:pre-remplie:${puzzleId}`) ?? '{}',
      ) as { seed: number }
      const reveal = async (clue: { direction: string; number: number } | undefined) => {
        const res = await fetch(`/api/v1/puzzles/${puzzleId}/word-search/reveal`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
          body: JSON.stringify({ seed: saved.seed, ...clue }),
        })
        return (await res.json()) as Hit
      }
      return [await reveal(clues[0]), await reveal(clues[1])] as [Hit, Hit]
    },
    { puzzleId, clues },
  )
}

const cell = (page: Page, p: { row: number; col: number }) =>
  page.locator(`[data-row="${String(p.row)}"][data-col="${String(p.col)}"]`)

/** Choix du mode dans la liste, mot surligné au glisser puis au clavier, « Où est-il ? », fin. */
export async function playPrefilled(page: Page): Promise<void> {
  await page.goto('/puzzles')
  await page.getByText('Grille pré-remplie', { exact: true }).click()
  await page.locator('a[href^="/pre-remplie/"]').first().click()
  await page.waitForURL(/\/pre-remplie\/[0-9a-f-]{36}$/)
  const puzzleId = page.url().split('/').at(-1) ?? ''
  await expect(page.getByRole('grid')).toBeVisible()

  // Premier mot : glisser de la première à la dernière lettre.
  const [first, second] = await locateFirstTwo(page, puzzleId)
  const from = await cell(page, first.start).boundingBox()
  const to = await cell(page, first.end).boundingBox()
  if (!from || !to) throw new Error('cases introuvables')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(
    page.getByRole('status').filter({ hasText: `Trouvé : ${first.answer}` }),
  ).toBeVisible()

  // Deuxième mot : au clavier (flèches, Entrée sur la première puis sur la dernière lettre).
  const grid = page.getByRole('grid')
  await grid.focus()
  const go = async (
    target: { row: number; col: number },
    current: { row: number; col: number },
  ) => {
    for (let i = current.row; i < target.row; i++) await page.keyboard.press('ArrowDown')
    for (let i = current.row; i > target.row; i--) await page.keyboard.press('ArrowUp')
    for (let i = current.col; i < target.col; i++) await page.keyboard.press('ArrowRight')
    for (let i = current.col; i > target.col; i--) await page.keyboard.press('ArrowLeft')
  }
  // Retour au coin supérieur gauche (le curseur est resté sur la case touchée), puis le mot.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowLeft')
  }
  await go(second.start, { row: 0, col: 0 })
  await page.keyboard.press('Enter')
  await go(second.end, second.start)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('status').filter({ hasText: `Trouvé : ${second.answer}` }),
  ).toBeVisible()

  // Le reste avec « Où est-il ? » : la partie se termine et récapitule les mots appris.
  const where = page.getByRole('button', { name: /^Où est le mot/ })
  while ((await where.count()) > 0) {
    await where.first().click()
    await expect(page.getByRole('status').filter({ hasText: 'Le mot était' })).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Tous les mots trouvés !' })).toBeVisible()
  await expect(page.getByText('Mots appris dans cette grille')).toBeVisible()
}
