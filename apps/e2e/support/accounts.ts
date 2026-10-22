/** Parcours de compte réutilisés par plusieurs specs (toujours via l'interface). */
import { randomBytes } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { waitForEmailToken } from './mailbox.ts'

export interface TestAccount {
  readonly username: string
  readonly email: string
  password: string
}

/**
 * Identité unique : les limites par adresse (connexion, mot de passe oublié) ne se cumulent pas
 * d'un test à l'autre. Le préfixe `e2e` signale des données de test supprimables.
 */
export function newAccount(tag: string): TestAccount {
  const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
  return {
    username: `e2e_${tag}_${id}`.slice(0, 24),
    email: `e2e-${tag}-${id}@example.org`,
    password: `phrase de passe e2e ${id}`,
  }
}

/** Inscription depuis /register puis confirmation par le lien reçu (bouton anti-scanner). */
export async function registerAndVerify(page: Page, account: TestAccount): Promise<void> {
  if (new URL(page.url()).pathname !== '/register') await page.goto('/register')
  await page.getByLabel('Pseudo').fill(account.username)
  await page.getByLabel('Adresse e-mail').fill(account.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte e-mail' })).toBeVisible()

  const token = await waitForEmailToken(account.email, '/verify-email')
  await page.goto(`/verify-email?token=${token}`)
  const confirm = page.getByRole('button', { name: 'Confirmer mon adresse' })
  await expect(confirm).toBeVisible()
  // Le jeton est retiré de l'URL (historique, en-tête Referer).
  await expect(page).not.toHaveURL(/token=/)
  await confirm.click()
  await expect(page.getByRole('heading', { name: 'Adresse confirmée' })).toBeVisible()
}

/** Suppression définitive depuis la page compte (nettoie les données de test). */
export async function deleteAccount(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/account')
  const section = page.getByRole('region', { name: 'Supprimer mon compte' })
  await section.getByLabel('Mot de passe actuel').fill(account.password)
  await section.getByRole('button', { name: 'Supprimer mon compte' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Supprimer définitivement' }).click()
  await page.waitForURL((url) => url.pathname === '/')
}
