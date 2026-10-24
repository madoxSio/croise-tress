import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createDb } from './db.ts'
import { SmtpMailer } from './modules/mail/mailer.ts'

const config = loadConfig()
const db = createDb(config.databaseUrl)
const mailer = new SmtpMailer(config)
const app = await buildApp({ config, db, mailer })

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'arrêt en cours')
  await app.close()
  await db.$disconnect()
  process.exit(0)
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ host: config.host, port: config.port })

// Sans bloquer le démarrage : l'API reste utile (solo, connexion) même si l'e-mail est en panne.
void mailer.verify().then((result) => {
  const smtp = { host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure }
  if (result.ok) app.log.info({ smtp }, 'SMTP joignable')
  else app.log.error({ smtp, reason: result.reason }, 'SMTP injoignable : inscriptions bloquées')
})
