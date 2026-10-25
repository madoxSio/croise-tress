/**
 * Duel à deux joueurs réels : A sur bureau (page du test), B dans un contexte mobile. Joué
 * uniquement par le projet « desktop » (voir playwright.config.ts).
 */
import { devices, expect, test, type Page } from '@playwright/test'
import { deleteAccount, newAccount, registerAndVerify } from '../support/accounts.ts'
import { typeInSlot } from '../support/grid.ts'
import { displayedPuzzleTitle, seedPuzzleByTitle, slotsOf } from '../support/puzzles.ts'

const MATCH_URL = /\/duel\/[0-9a-f-]{36}$/

async function forfeit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Abandonner' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Abandonner' }).click()
}

test('duel : invitation, mot validé par le serveur, abandon, partie rapide, classement', async ({
  page: a,
  browser,
}) => {
  test.setTimeout(150_000)
  const contextB = await browser.newContext({ ...devices['Pixel 7'], locale: 'fr-FR' })
  const b = await contextB.newPage()
  const playerA = newAccount('dla')
  const playerB = newAccount('dlb')

  try {
    await registerAndVerify(a, playerA)
    await registerAndVerify(b, playerB)

    // --- Match entre amis par code d'invitation ---
    await a.goto('/duel')
    await b.goto('/duel')
    await a.getByRole('button', { name: 'Créer une invitation' }).click()
    const codeEl = a.getByLabel(/^Code d'invitation/)
    await expect(codeEl).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/)
    const code = (await codeEl.innerText()).trim()
    await b.getByLabel('Code reçu (6 caractères)').fill(code.toLowerCase())
    await b.getByRole('button', { name: 'Rejoindre' }).click()
    await a.waitForURL(MATCH_URL, { timeout: 15_000 })
    await b.waitForURL(MATCH_URL, { timeout: 15_000 })
    expect(new URL(b.url()).pathname).toBe(new URL(a.url()).pathname)
    await expect(a.getByRole('grid')).toBeVisible()
    await expect(b.getByRole('grid')).toBeVisible()

    const title = await displayedPuzzleTitle(a)
    const word = slotsOf(seedPuzzleByTitle(title)).find((slot) => slot.direction === 'across')
    if (!word) throw new Error('aucun mot horizontal')

    // Mot faux refusé par le serveur, puis bon mot validé.
    await typeInSlot(a, word, 'Z'.repeat(word.answer.length))
    await expect(a.getByText('ce n’est pas le bon mot')).toBeVisible()
    await typeInSlot(a, word, word.answer)
    await expect(
      a.getByText(
        word.classic ? /^Mot trouvé : Ligne [IVX]+\.$/ : `Mot trouvé : ${word.number} horizontal.`,
      ),
    ).toBeVisible()
    // L'adversaire voit le score en direct, y compris après rechargement (resynchronisation).
    const scoreOfA = new RegExp(`${playerA.username} : 1 mots`)
    await expect(b.getByRole('progressbar', { name: scoreOfA })).toBeVisible()
    await b.reload()
    await expect(b.getByRole('progressbar', { name: scoreOfA })).toBeVisible({ timeout: 15_000 })

    await forfeit(a)
    await expect(a.getByRole('heading', { name: 'Défaite' })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Victoire !' })).toBeVisible()
    await expect(b.getByText('Match entre amis : le classement n’est pas modifié.')).toBeVisible()

    // --- Partie rapide : appariement, abandon de B, classement de A ---
    await a.goto('/duel')
    await b.goto('/duel')
    await a.getByRole('button', { name: 'Trouver un adversaire' }).click()
    await expect(a.getByText('Recherche d’un adversaire…')).toBeVisible()
    await b.getByRole('button', { name: 'Trouver un adversaire' }).click()
    await a.waitForURL(MATCH_URL, { timeout: 15_000 })
    await b.waitForURL(MATCH_URL, { timeout: 15_000 })
    expect(new URL(b.url()).pathname).toBe(new URL(a.url()).pathname)
    await expect(a.getByRole('grid')).toBeVisible()
    await expect(b.getByRole('grid')).toBeVisible()
    // Laisse A relever son classement « avant » (affiché ensuite en écart).
    await expect(a.getByRole('button', { name: 'Abandonner' })).toBeEnabled()
    await a.waitForTimeout(1000)
    await forfeit(b)
    await expect(a.getByRole('heading', { name: 'Victoire !' })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Défaite' })).toBeVisible()
    await expect(a.getByText(/\(\+\d+\)/)).toBeVisible()

    await a.getByRole('link', { name: 'Classement' }).click()
    await expect(a.getByRole('heading', { level: 1, name: 'Classement' })).toBeVisible()
    await expect(a.getByRole('region', { name: 'Mon classement' })).toContainText('1 victoire(s)')
    await expect(a.getByRole('row', { name: new RegExp(playerA.username) })).toBeVisible()

    await a.goto('/duel')
    await expect(a.getByText(`contre ${playerB.username}`).first()).toBeVisible()
  } finally {
    // Nettoyage : les comptes de test sont supprimés par l'interface.
    await deleteAccount(a, playerA).catch(() => undefined)
    await deleteAccount(b, playerB).catch(() => undefined)
    await contextB.close()
  }
})
