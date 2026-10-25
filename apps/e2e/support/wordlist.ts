/**
 * Partie de mots mêlés, jouée à la suite du parcours solo dans le même contexte (même session
 * invitée : les sessions invitées sont limitées par heure et par IP pour toute la suite).
 * Les emplacements des mots viennent du seed de l'API : rien n'y est secret.
 */
import { wordOccurrences } from '@crossverse/crossword-core'
import { expect, type Page } from '@playwright/test'
import { SEED_WORD_LISTS } from '../../api/prisma/seed/word-lists.ts'

const cell = (page: Page, p: { row: number; col: number }) =>
  page.locator(`[data-row="${String(p.row)}"][data-col="${String(p.col)}"]`)

/** Liste des mots mêlés, mot rayé au glisser, mauvais mot mystère, « Où est ? », fin. */
export async function playWordList(page: Page): Promise<void> {
  const seed = SEED_WORD_LISTS.find((list) => list.difficulty === 'easy')
  if (!seed) throw new Error('aucune grille facile de mots mêlés dans le seed')
  await page.goto('/puzzles')
  await page.getByRole('link', { name: /Envie de mots mêlés/ }).click()
  await page.getByRole('link', { name: seed.title, exact: true }).click()
  await page.waitForURL(/\/mots-meles\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('grid')).toBeVisible()

  // Premier mot de la liste : glisser de la dernière lettre à la première (même mot).
  const word = [...seed.words].sort((a, b) => a.localeCompare(b, 'fr'))[0] ?? ''
  const hit = wordOccurrences(seed.rows, word)[0]
  if (!hit) throw new Error(`${word} introuvable dans la grille`)
  const from = await cell(page, hit.end).boundingBox()
  const to = await cell(page, hit.start).boundingBox()
  if (!from || !to) throw new Error('cases introuvables')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: `Trouvé : ${word}` })).toBeVisible()

  await page.getByLabel('Proposer le mot mystère').fill('ZZZ')
  await page.getByRole('button', { name: 'Proposer', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Ce n’est pas le mot mystère.' }),
  ).toBeVisible()

  const where = page.getByRole('button', { name: /^Où est / })
  while ((await where.count()) > 0) await where.first().click()
  await expect(
    page.getByRole('heading', { name: `Grille terminée ! Le mot mystère était ${seed.mystery}.` }),
  ).toBeVisible()
}
