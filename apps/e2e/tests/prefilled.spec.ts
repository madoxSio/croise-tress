import { expect, test, type Page } from '@playwright/test'

interface Hit {
  answer: string
  start: { row: number; col: number }
  end: { row: number; col: number }
}

/** Emplacement d'un mot, demandé à l'API comme le ferait « Où est-il ? » (sans toucher l'écran). */
async function locate(page: Page, puzzleId: string, index: number): Promise<Hit> {
  return page.evaluate(
    async ({ puzzleId, index }) => {
      const session = (await (await fetch('/api/v1/session')).json()) as { csrfToken: string }
      const saved = JSON.parse(
        localStorage.getItem(`crossverse:pre-remplie:${puzzleId}`) ?? '{}',
      ) as {
        seed: number
      }
      const search = (await (
        await fetch(`/api/v1/puzzles/${puzzleId}/word-search?seed=${String(saved.seed)}`)
      ).json()) as { clues: { direction: string; number: number }[] }
      const clue = search.clues[index]
      const res = await fetch(`/api/v1/puzzles/${puzzleId}/word-search/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
        body: JSON.stringify({
          seed: saved.seed,
          direction: clue?.direction,
          number: clue?.number,
        }),
      })
      return (await res.json()) as Hit
    },
    { puzzleId, index },
  )
}

const cell = (page: Page, p: { row: number; col: number }) =>
  page.locator(`[data-row="${String(p.row)}"][data-col="${String(p.col)}"]`)

test('grille pré-remplie : choix du mode, glisser, clavier et fin de partie', async ({ page }) => {
  await page.goto('/puzzles')
  await page.getByText('Grille pré-remplie', { exact: true }).click()
  await page.locator('a[href^="/pre-remplie/"]').first().click()
  await page.waitForURL(/\/pre-remplie\/[0-9a-f-]{36}$/)
  const puzzleId = page.url().split('/').at(-1) ?? ''
  await expect(page.getByRole('grid')).toBeVisible()

  // Premier mot : glisser de la première à la dernière lettre.
  const first = await locate(page, puzzleId, 0)
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
  const second = await locate(page, puzzleId, 1)
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
})
