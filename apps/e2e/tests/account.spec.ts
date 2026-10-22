import { expect, test, type Page } from '@playwright/test'
import { deleteAccount, newAccount, registerAndVerify } from '../support/accounts.ts'
import { waitForEmailToken } from '../support/mailbox.ts'

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Se connecter' })).toBeVisible()
}

test('compte : inscription, confirmation, connexion, réinitialisation, suppression', async ({
  page,
}) => {
  const account = newAccount('acc')

  // Accès à l'inscription depuis l'en-tête (icône sur mobile, libellé sur bureau).
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Se connecter' }).click()
  await page.waitForURL('**/login')
  await page.getByRole('main').getByRole('link', { name: 'Créer un compte' }).click()
  await page.waitForURL('**/register')

  await registerAndVerify(page, account)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Mon compte' })).toBeVisible()

  await page.goto('/account')
  await expect(page.getByText(account.username, { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible()
  await expect(page.getByText('Session actuelle')).toBeVisible()

  await logout(page)

  // Connexion : au plus 2 par projet. La limite « 5 par adresse » de /auth/login est en
  // pratique comptée par IP (corps non encore lu par le limiteur) : voir README.md.
  await login(page, account.email, account.password)
  await page.waitForURL('**/account')
  await logout(page)

  // Mot de passe oublié → lien reçu → nouveau mot de passe.
  await page.goto('/forgot-password')
  await page.getByLabel('Adresse e-mail').fill(account.email)
  await page.getByRole('button', { name: 'Envoyer le lien' }).click()
  await expect(page.getByText('Si un compte existe pour cette adresse')).toBeVisible()
  const resetToken = await waitForEmailToken(account.email, '/reset-password')
  await page.goto(`/reset-password?token=${resetToken}`)
  await expect(page).not.toHaveURL(/token=/)
  account.password = `${account.password} renouvelée`
  await page.getByLabel('Nouveau mot de passe').fill(account.password)
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
  await expect(page.getByRole('heading', { name: 'Mot de passe modifié' })).toBeVisible()

  await login(page, account.email, account.password)
  await page.waitForURL('**/account')

  // Suppression : retour en invité, la page compte n'est plus accessible.
  await deleteAccount(page, account)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Se connecter' })).toBeVisible()
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Vous jouez en invité' })).toBeVisible()
  await expect(page.getByText(account.username, { exact: true })).toHaveCount(0)
})
