import { expect, test } from '@playwright/test'
import { clueButton, fillAll, typeInSlot } from '../support/grid.ts'
import { displayedPuzzleTitle, seedPuzzleByTitle, slotsOf } from '../support/puzzles.ts'

test('solo : défi du jour, vérification, indice, fin de partie et historique', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bonjour, prêt à jouer ?' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Jouer le défi' }).click()
  await page.waitForURL(/\/play\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('grid')).toBeVisible()

  const title = await displayedPuzzleTitle(page)
  const slots = slotsOf(seedPuzzleByTitle(title))
  const first = slots.find((s) => s.direction === 'across')
  const second = slots.find((s) => s.direction === 'across' && s !== first)
  if (!first || !second) throw new Error('grille sans deux mots horizontaux')

  // Saisie avec une dernière lettre fausse, puis « Vérifier le mot ».
  const wrongLast = first.answer.endsWith('Z') ? 'Y' : 'Z'
  await typeInSlot(page, first, first.answer.slice(0, -1) + wrongLast)
  await clueButton(page, first).click()
  await page.getByRole('button', { name: 'Vérifier', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Vérifier le mot/ }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 lettre fausse.' })).toBeVisible()

  // Correction : le mot plein se ressaisit depuis sa première case.
  await typeInSlot(page, first, first.answer)
  const filled = new Set(first.cells.map((c) => `${c.row}:${c.col}`))

  // Indice : révèle la première case du deuxième mot horizontal.
  await clueButton(page, second).click()
  await page.getByRole('button', { name: 'Indice', exact: true }).click()
  await page.getByRole('menuitem', { name: /Révéler une lettre/ }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Une lettre a été révélée.' }),
  ).toBeVisible()
  const revealed = second.cells[0]
  if (revealed) filled.add(`${revealed.row}:${revealed.col}`)

  // Le reste de la grille : la sauvegarde automatique termine la partie côté serveur.
  await fillAll(page, slots, filled)
  await expect(page.getByRole('heading', { name: 'Grille terminée !' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Aides utilisées : 1 lettre(s), 0 mot(s).')).toBeVisible()

  await page.goto('/history')
  await expect(page.getByRole('heading', { level: 1, name: 'Mes parties terminées' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: title })).toBeVisible()
})
