/**
 * Gestion des comptes en ligne de commande (accès au serveur requis).
 *
 *   tsx scripts/account.ts create --email <e-mail> --username <pseudo> [--admin]
 *   tsx scripts/account.ts promote --email <e-mail>
 *   tsx scripts/account.ts demote --email <e-mail>
 *
 * `create` lit le mot de passe dans la variable ACCOUNT_PASSWORD ; sans elle, il en génère un
 * aléatoire et l'affiche une seule fois. Aucun mot de passe n'est passé en argument (il
 * resterait dans l'historique du shell et la liste des processus) ni écrit dans le dépôt.
 */
import { parseArgs } from 'node:util'
import { loadConfig } from '../src/config.ts'
import { createDb } from '../src/db.ts'
import {
  AccountError,
  createAccount,
  generatePassword,
  setRole,
} from '../src/modules/admin/accounts.ts'

const rootEnv = new URL('../../../.env', import.meta.url)
try {
  process.loadEnvFile(rootEnv)
} catch {
  // Pas de .env (Docker, production) : les variables viennent de l'environnement.
}

const USAGE = `Usage :
  account create --email <e-mail> --username <pseudo> [--admin]   (mot de passe : ACCOUNT_PASSWORD, sinon généré)
  account promote --email <e-mail>
  account demote --email <e-mail>`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    username: { type: 'string' },
    admin: { type: 'boolean', default: false },
  },
})
const [command] = positionals

const db = createDb(loadConfig().databaseUrl)
try {
  if (command === 'create' && values.email && values.username) {
    const provided = process.env['ACCOUNT_PASSWORD']
    const password = provided && provided !== '' ? provided : generatePassword()
    const account = await createAccount(db, {
      email: values.email,
      username: values.username,
      password,
      admin: values.admin,
    })
    process.stdout.write(
      `Compte créé (${account.role}) : ${account.username} <${account.email}>\n` +
        (provided
          ? ''
          : `Mot de passe généré, à conserver maintenant (non réaffiché) : ${password}\n`),
    )
  } else if ((command === 'promote' || command === 'demote') && values.email) {
    await setRole(db, values.email, command === 'promote')
    process.stdout.write(
      command === 'promote'
        ? 'Rôle administrateur accordé.\n'
        : 'Rôle administrateur retiré, sessions fermées.\n',
    )
  } else {
    process.stderr.write(`${USAGE}\n`)
    process.exitCode = 2
  }
} catch (error) {
  if (!(error instanceof AccountError)) throw error
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
